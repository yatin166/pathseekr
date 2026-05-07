import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import type { RetrievalResult, SearchQuery } from '@spyglass/shared'
import type { IRetriever } from '../../../interfaces/retriever.interface'
import { DatabaseConnection } from '../../../storage/database'
import { TYPES } from '../../../container/types'
import { BM25Retriever } from '../bm25/bm25-retriever'
import { EdgeQueries } from './edge-queries'
import { RetrievalQueries, type RawChunkWithDocument } from '../../shared/retrieval-queries'
import { mapRetrievalResult } from '../../shared/mappers'

interface RawOutboundEdge {
    readonly to_chunk_id: string
    readonly edge_type: string
    readonly weight: number
}

interface RawInboundEdge {
    readonly from_chunk_id: string
    readonly edge_type: string
    readonly weight: number
}

interface QueueItem {
    readonly chunkId: string
    readonly score: number
    readonly hopsLeft: number
}


@injectable()
export class GraphRetriever implements IRetriever {

    private readonly  CHUNK_TYPE_MULTIPLIERS: Record<string, number> = {
        function: 1.0,
        method: 1.0,
        class: 0.9,
        interface: 0.8,
        struct: 0.8,
        trait: 0.8,
        enum: 0.5,
        type: 0.4,
    }
    private readonly CONSTRUCTOR_MULTIPLIER = 0.2
    private readonly SEED_LIMIT = 20
    private readonly MAX_HOPS = 2
    private readonly HOP_DECAY = 0.6

    constructor(
        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection,

        @inject(TYPES.BM25Retriever)
        private readonly bm25Retriever: BM25Retriever,
    ) {}

    async isReady(): Promise<boolean> {
        const db = this.connection.getDb()
        const result = db
            .prepare(EdgeQueries.COUNT_RESOLVED)
            .get() as { count: number }
        return result.count > 0
    }

    async search(query: SearchQuery): Promise<RetrievalResult[]> {
        const db = this.connection.getDb()

        // BM25 seeds
        // Wider limit gives the graph more starting points to expand from
        const seeds = await this.bm25Retriever.search({
            ...query,
            limit: this.SEED_LIMIT,
            strategy: 'bm25',
        })

        if (seeds.length === 0) {
            return []
        }

        // Initialise scores from seeds
        const scores = new Map<string, number>()
        for (const seed of seeds) {
            scores.set(seed.chunk.id, seed.score)
        }

        // BFS traversal
        const queue: QueueItem[] = seeds.map((s) => ({
            chunkId: s.chunk.id,
            score: s.score,
            hopsLeft: this.MAX_HOPS,
        }))

        const visited = new Set<string>()
        const outboundStmt = db.prepare(EdgeQueries.FIND_OUTBOUND)
        const inboundStmt = db.prepare(EdgeQueries.FIND_INBOUND)

        while (queue.length > 0) {
            const item = queue.shift()!

            if (visited.has(item.chunkId) || item.hopsLeft === 0) {
                continue
            }
            visited.add(item.chunkId)

            // Outbound: class → method, class → parent, class → interface
            const outbound = outboundStmt.all(item.chunkId) as RawOutboundEdge[]
            for (const edge of outbound) {
                const neighborScore = item.score * edge.weight * this.HOP_DECAY
                if (neighborScore > (scores.get(edge.to_chunk_id) ?? 0)) {
                    scores.set(edge.to_chunk_id, neighborScore)
                }
                queue.push({ chunkId: edge.to_chunk_id, score: neighborScore, hopsLeft: item.hopsLeft - 1 })
            }

            // Inbound: method → class, interface → implementors, parent → subclasses
            const inbound = inboundStmt.all(item.chunkId) as RawInboundEdge[]
            for (const edge of inbound) {
                const neighborScore = item.score * edge.weight * this.HOP_DECAY
                if (neighborScore > (scores.get(edge.from_chunk_id) ?? 0)) {
                    scores.set(edge.from_chunk_id, neighborScore)
                }
                queue.push({ chunkId: edge.from_chunk_id, score: neighborScore, hopsLeft: item.hopsLeft - 1 })
            }
        }

        // Pre-sort before fetching full chunk data
        const candidates = Array.from(scores.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, query.limit * 3)

        if (candidates.length === 0) {
            return []
        }

        // Fetch full chunk + document data
        const chunkIds = candidates.map(([id]) => id)
        const rows = db
            .prepare(RetrievalQueries.CHUNKS_WITH_DOCUMENTS(chunkIds.length))
            .all(...chunkIds) as RawChunkWithDocument[]

        const rowMap = new Map<string, RawChunkWithDocument>(
            rows.map((row) => [row.id, row])
        )

        // Apply chunk type multipliers
        const scored = candidates
            .map(([chunkId, score]) => {
                const row = rowMap.get(chunkId)
                if (!row) return null
                return { row, score: score * this.typeMultiplier(row) }
            })
            .filter((r): r is { row: RawChunkWithDocument; score: number } => r !== null)
            .sort((a, b) => b.score - a.score)
            .slice(0, query.limit)

        if (scored.length === 0) return []

        // Normalise and map
        const maxScore = scored[0]!.score

        return scored.map(({ row, score }, index) =>
            mapRetrievalResult(row, score / maxScore, index + 1, 'graph')
        )
    }

    private typeMultiplier(row: RawChunkWithDocument): number {
        if (row.chunk_type === 'method' && row.name.endsWith('.constructor')) {
            return this.CONSTRUCTOR_MULTIPLIER
        }
        return this.CHUNK_TYPE_MULTIPLIERS[row.chunk_type] ?? 1.0
    }
}