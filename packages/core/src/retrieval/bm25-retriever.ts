import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import type { RetrievalResult, SearchQuery } from '@spyglass/shared'
import type { IRetriever } from '../interfaces/retriever.interface'
import { DatabaseConnection } from '../storage/database'
import { TYPES } from '../container/types'
import type { ITokenizer } from './interfaces/tokenizer.interface'
import { BM25Queries } from './queries/bm25-queries'
import { type RawChunkWithDocument, RetrievalQueries } from "./queries/retrieval-queries";
import { mapRetrievalResult } from './mappers'
import {
    type RawCorpusStats,
    type RawDFRow,
    type RawTermRow
} from './queries/bm25-queries'

const BM25_K1 = 1.5
const BM25_B = 0.75

@injectable()
export class BM25Retriever implements IRetriever {

    constructor(
        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection,

        @inject(TYPES.ITokenizer)
        private readonly tokenizer: ITokenizer
    ) {}

    async isReady(): Promise<boolean> {
        const db = this.connection.getDb()
        const result = db
            .prepare(BM25Queries.COUNT_TERMS)
            .get() as { count: number }
        return result.count > 0
    }

    async search(query: SearchQuery): Promise<RetrievalResult[]> {
        const db = this.connection.getDb()

        const { terms } = this.tokenizer.tokenize(query.query)
        if (terms.length === 0) {
            return []
        }

        const stats = db
            .prepare(BM25Queries.CORPUS_STATS)
            .get() as RawCorpusStats

        if (stats.total_chunks === 0) {
            return []
        }

        const { total_chunks: N, avg_doc_length: avgDL } = stats

        // Get document frequency for each query term
        const dfRows = db
            .prepare(BM25Queries.DOCUMENT_FREQUENCIES(terms.length))
            .all(...terms) as RawDFRow[]

        const dfMap = new Map<string, number>(
            dfRows.map((row) => [row.term, row.df])
        )

        if (dfMap.size === 0) {
            return []
        }

        // Score each matching chunk using BM25 formula
        const chunkScores = new Map<string, number>()

        for (const term of terms) {
            const df = dfMap.get(term)
            if (!df) {
                continue
            }

            // IDF — how rare is this term across the corpus
            const idf = Math.log(
                (N - df + 0.5) / (df + 0.5) + 1
            )

            const termRows = db
                .prepare(BM25Queries.CHUNKS_FOR_TERM)
                .all(term) as RawTermRow[]

            for (const row of termRows) {
                const tfScore = this.computeTFScore(
                    row.frequency,
                    row.doc_length,
                    avgDL
                )

                const current = chunkScores.get(row.chunk_id) ?? 0
                chunkScores.set(row.chunk_id, current + idf * tfScore)
            }
        }

        if (chunkScores.size === 0) {
            return []
        }

        const ranked = Array.from(chunkScores.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, query.limit)

        const chunkIds = ranked.map(([id]) => id)
        const rows = db
            .prepare(RetrievalQueries.CHUNKS_WITH_DOCUMENTS(chunkIds.length))
            .all(...chunkIds) as RawChunkWithDocument[]

        const rowMap = new Map<string, RawChunkWithDocument>(
            rows.map((row) => [row.id, row])
        )

        const maxScore = ranked[0]?.[1] ?? 1
        const results: RetrievalResult[] = []

        for (let i = 0; i < ranked.length; i++) {
            const [chunkId, score] = ranked[i]!
            const row = rowMap.get(chunkId)
            if (!row) {
                continue
            }

            results.push(
                mapRetrievalResult(
                    row,
                    score / maxScore,
                    i + 1,
                    'bm25'
                )
            )
        }

        return results
    }

    private computeTFScore(tf: number, docLength: number, avgDocLength: number): number {
        return (
            (tf * (BM25_K1 + 1)) /
            (tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength)))
        )
    }
}