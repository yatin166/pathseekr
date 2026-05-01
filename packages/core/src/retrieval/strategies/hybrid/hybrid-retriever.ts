import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import type { RetrievalResult, SearchQuery, SpyglassConfig } from '@spyglass/shared'
import type { IRetriever } from '../../../interfaces/retriever.interface'
import { TYPES } from '../../../container/types'
import { BM25Retriever } from '../bm25/bm25-retriever'
import { VectorRetriever } from '../vector/vector-retriever'

@injectable()
export class HybridRetriever implements IRetriever {

    private readonly RRF_K = 60;

    constructor(
        @inject(TYPES.BM25Retriever)
        private readonly bm25Retriever: BM25Retriever,

        @inject(TYPES.VectorRetriever)
        private readonly vectorRetriever: VectorRetriever,

        @inject(TYPES.SpyglassConfig)
        private readonly config: SpyglassConfig
    ) {}

    async isReady(): Promise<boolean> {
        const [bm25Ready, vectorReady] = await Promise.all([
            this.bm25Retriever.isReady(),
            this.vectorRetriever.isReady(),
        ])
        return bm25Ready && vectorReady
    }

    async search(query: SearchQuery): Promise<RetrievalResult[]> {
        const limit = query.limit * 2
        const [bm25Results, vectorResults] = await Promise.all([
            this.bm25Retriever.search({ ...query, limit: limit, strategy: 'bm25' }),
            this.vectorRetriever.search({ ...query, limit: limit, strategy: 'vector' }),
        ])

        const fused = this.fuseWithRRF(bm25Results, vectorResults, this.config.retrieval.bm25Weight)

        const reranked = this.applyNameBoost(fused, query.query)
        reranked.sort((a, b) => b.score - a.score)

        return reranked
            .slice(0, query.limit)
            .map((result, index) => ({
                ...result,
                strategy: 'hybrid' as const,
                rank: index + 1,
            }))
    }

    private fuseWithRRF(bm25Results: RetrievalResult[], vectorResults: RetrievalResult[], bm25Weight: number): RetrievalResult[] {
        const vectorWeight = 1 - bm25Weight
        const scores = new Map<string, number>()
        const bestResult = new Map<string, RetrievalResult>()

        for (let i = 0; i < bm25Results.length; i++) {
            const result = bm25Results[i]!
            const chunkId = result.chunk.id
            const rrfScore = bm25Weight * (1 / (this.RRF_K + i + 1))

            scores.set(chunkId, (scores.get(chunkId) ?? 0) + rrfScore)

            if (!bestResult.has(chunkId)) {
                bestResult.set(chunkId, result)
            }
        }

        for (let i = 0; i < vectorResults.length; i++) {
            const result = vectorResults[i]!
            const chunkId = result.chunk.id
            const rrfScore = vectorWeight * (1 / (this.RRF_K + i + 1))

            scores.set(chunkId, (scores.get(chunkId) ?? 0) + rrfScore)

            if (!bestResult.has(chunkId)) {
                bestResult.set(chunkId, result)
            }
        }

        const ranked = Array.from(scores.entries())
            .sort(([, a], [, b]) => b - a)

        const maxScore = ranked[0]?.[1] ?? 1

        return ranked
            .map(([chunkId, score]) => {
                const result = bestResult.get(chunkId)
                if (!result) {
                    return null
                }
                return {
                    ...result,
                    score: score / maxScore,
                }
            })
            .filter((r): r is RetrievalResult => r !== null)
    }

    private applyNameBoost(results: RetrievalResult[], query: string): RetrievalResult[] {
        const queryTerms = query
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length > 1)

        if (queryTerms.length === 0) {
            return results
        }

        const resultsWithBoost = results.map((result) => {
            const chunkName = result.chunk.name.toLowerCase()
            const matchCount = queryTerms.filter((term) => chunkName.includes(term)).length

            if (matchCount === 0) {
                return result
            }

            /*
            * Partial or full name match — boost proportionally
            * Example:
            * Query: "get user data"
            * Chunk name: "getUserData" -> matches all 3 terms -> boost = 0.25
            * Chunk name: "getData" -> matches 2 terms -> boost = 0.167
            */
            const matchRatio = matchCount / queryTerms.length
            const boost = matchRatio * 0.25

            return {
                ...result,
                score: Math.min(result.score + boost, 1.0),
            }
        })

        return resultsWithBoost
    }
}