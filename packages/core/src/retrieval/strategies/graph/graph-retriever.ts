import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import Database from 'better-sqlite3'
import type { RetrievalResult, SearchQuery } from '@spyglass/shared'
import type { IRetriever } from '../../../interfaces/retriever.interface'
import { DatabaseConnection } from '../../../storage/database'
import { TYPES } from '../../../container/types'
import { BM25Retriever } from '../bm25/bm25-retriever'
import { EdgeQueries } from './edge-queries'
import {
    RetrievalQueries,
    type RawChunkWithDocument,
    type RawNameMatchRow,
} from '../../shared/retrieval-queries'
import { mapRetrievalResult } from '../../shared/mappers'

interface RawOutboundEdge {
    readonly to_chunk_id: string
    readonly edge_type:   string
    readonly weight:      number
}

interface RawInboundEdge {
    readonly from_chunk_id: string
    readonly edge_type:     string
    readonly weight:        number
}

interface QueueItem {
    readonly chunkId:  string
    readonly score:    number
    readonly hopsLeft: number
}

interface NameSeed {
    readonly chunkId: string
    readonly score:   number
}

@injectable()
export class GraphRetriever implements IRetriever {

    private readonly CHUNK_TYPE_MULTIPLIERS: Record<string, number> = {
        function: 1.0,
        method: 1.0,
        class: 0.9,
        interface: 0.8,
        struct: 0.8,
        trait: 0.8,
        impl: 0.8,
        enum: 0.5,
        type: 0.4,
    }
    private readonly CONSTRUCTOR_MULTIPLIER = 0.2

    /**
     * Name-matched seeds represent the definition of a symbol — they are the
     * most reliable signal in code search. BM25 seeds represent documents that
     * mention the query terms frequently, which biases toward usages over
     * definitions. We weight name matches higher to ensure definitions win.
     */
    private readonly NAME_MATCH_WEIGHT = 1.0
    private readonly BM25_WEIGHT = 0.65

    /**
     * Name match scoring tiers:
     *   exact   — query is identical to chunk name   (e.g. "IRetriever" → IRetriever)
     *   prefix  — chunk name starts with query term  (e.g. "chunk" → ChunkBuilder)
     *   substr  — query term appears inside the name (e.g. "retriev" → BM25Retriever)
     */
    private readonly NAME_SCORE_EXACT  = 1.0
    private readonly NAME_SCORE_PREFIX = 0.9
    private readonly NAME_SCORE_SUBSTR = 0.75

    private readonly SEED_LIMIT     = 20
    private readonly MAX_HOPS       = 2
    private readonly HOP_DECAY      = 0.6
    private readonly MIN_TERM_LEN   = 2

    constructor(
        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection,

        @inject(TYPES.BM25Retriever)
        private readonly bm25Retriever: BM25Retriever,
    ) {}

    async isReady(): Promise<boolean> {
        const db     = this.connection.getDb()
        const result = db
            .prepare(EdgeQueries.COUNT_RESOLVED)
            .get() as { count: number }
        return result.count > 0
    }

    async search(query: SearchQuery): Promise<RetrievalResult[]> {
        const db = this.connection.getDb()

        // Primary seeds: name matching
        const nameSeeds = this.seedByNameMatch(db, query.query)

        // Secondary seeds: BM25
        const bm25Seeds = await this.bm25Retriever.search({
            ...query,
            limit:    this.SEED_LIMIT,
            strategy: 'bm25',
        })

        // Merge seeds — name matches always win
        const scores = new Map<string, number>()

        for (const seed of bm25Seeds) {
            scores.set(seed.chunk.id, seed.score * this.BM25_WEIGHT)
        }

        for (const seed of nameSeeds) {
            scores.set(seed.chunkId, seed.score * this.NAME_MATCH_WEIGHT)
        }

        if (scores.size === 0) return []

        // BFS graph traversal
        const queue: QueueItem[] = Array.from(scores.entries()).map(
            ([chunkId, score]) => ({ chunkId, score, hopsLeft: this.MAX_HOPS })
        )

        const visited = new Set<string>()
        const outboundStmt = db.prepare(EdgeQueries.FIND_OUTBOUND)
        const inboundStmt = db.prepare(EdgeQueries.FIND_INBOUND)

        while (queue.length > 0) {
            const item = queue.shift()!

            if (visited.has(item.chunkId) || item.hopsLeft === 0) {
                continue
            }
            visited.add(item.chunkId)

            // Follow outbound edges
            const outbound = outboundStmt.all(item.chunkId) as RawOutboundEdge[]
            for (const edge of outbound) {
                const s = item.score * edge.weight * this.HOP_DECAY
                if (s > (scores.get(edge.to_chunk_id) ?? 0)) {
                    scores.set(edge.to_chunk_id, s)
                }
                queue.push({
                    chunkId:  edge.to_chunk_id,
                    score:    s,
                    hopsLeft: item.hopsLeft - 1,
                })
            }

            // Follow inbound edges
            const inbound = inboundStmt.all(item.chunkId) as RawInboundEdge[]
            for (const edge of inbound) {
                const s = item.score * edge.weight * this.HOP_DECAY
                if (s > (scores.get(edge.from_chunk_id) ?? 0)) {
                    scores.set(edge.from_chunk_id, s)
                }
                queue.push({
                    chunkId:  edge.from_chunk_id,
                    score:    s,
                    hopsLeft: item.hopsLeft - 1,
                })
            }
        }

        // Pre-sort and fetch full chunk + document data
        const candidates = Array.from(scores.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, query.limit * 3)

        if (candidates.length === 0) {
            return []
        }

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

        // Normalise and return
        const maxScore = scored[0]!.score

        return scored.map(({ row, score }, index) =>
            mapRetrievalResult(row, score / maxScore, index + 1, 'graph')
        )
    }

    /**
     * Searches chunk names for each token in the query.
     *
     * Multi-word queries are split so each token is searched independently:
     *   "BM25 retriever" → search "%BM25%" and "%retriever%" separately,
     *   then merge results.
     *
     * Scoring tiers reward precision:
     *   exact match  → 1.0  ("IRetriever" matches chunk named "IRetriever")
     *   prefix match → 0.9  ("chunk" matches "ChunkBuilder")
     *   substr match → 0.75 ("retriev" matches "BM25Retriever")
     */
    private seedByNameMatch(db: Database.Database, query: string,): NameSeed[] {
        const terms = query
            .trim()
            .split(/\s+/)
            .filter((t) => t.length >= this.MIN_TERM_LEN)

        const seen = new Set<string>()
        const seeds: NameSeed[] = []

        for (const term of terms) {
            const rows = db
                .prepare(RetrievalQueries.CHUNKS_BY_NAME_MATCH)
                .all(`%${term}%`, this.SEED_LIMIT) as RawNameMatchRow[]

            for (const row of rows) {
                if (seen.has(row.id)) {
                    continue
                }
                seen.add(row.id)

                const lowerName = row.name.toLowerCase()
                const lowerTerm = term.toLowerCase()

                const score = lowerName === lowerTerm
                    ? this.NAME_SCORE_EXACT
                    : lowerName.startsWith(lowerTerm) ? this.NAME_SCORE_PREFIX : this.NAME_SCORE_SUBSTR

                seeds.push({ chunkId: row.id, score })
            }
        }

        return seeds
            .sort((a, b) => b.score - a.score)
            .slice(0, this.SEED_LIMIT)
    }

    /**
     * Returns the scoring multiplier for a chunk based on its type.
     *
     * Constructors receive an additional penalty because they appear in
     * every class but almost never represent the answer to a search query —
     * they tend to surface as false positives due to listing all injected
     * dependencies in their body.
     */
    private typeMultiplier(row: RawChunkWithDocument): number {
        if (row.chunk_type === 'method' && row.name.endsWith('.constructor')) {
            return this.CONSTRUCTOR_MULTIPLIER
        }
        return this.CHUNK_TYPE_MULTIPLIERS[row.chunk_type] ?? 1.0
    }
}