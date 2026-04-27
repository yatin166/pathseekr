import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import Database from 'better-sqlite3'
import type { IChunkRepository } from '../interfaces/chunk-repository.interface'
import { DatabaseConnection } from '../storage/database'
import { TYPES } from '../container/types'
import type { ITokenizer } from './interfaces/tokenizer.interface'
import { BM25Queries } from './queries/bm25-queries'

@injectable()
export class BM25IndexBuilder {

    constructor(
        @inject(TYPES.IChunkRepository)
        private readonly chunkRepository: IChunkRepository,

        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection,

        @inject(TYPES.ITokenizer)
        private readonly tokenizer: ITokenizer
    ) {}

    async buildForDocument(documentId: string): Promise<void> {
        const chunks = await this.chunkRepository.findByDocumentId(documentId)
        if (chunks.length === 0) {
            return
        }

        const db = this.connection.getDb()
        this.indexChunks(
            db,
            chunks.map((c) => ({ id: c.id, content: c.content }))
        )
    }

    async buildAll(): Promise<void> {
        const db = this.connection.getDb()

        db.prepare(BM25Queries.DELETE_ALL).run()

        const chunks = db
            .prepare(BM25Queries.ALL_CHUNKS_FOR_INDEX)
            .all() as Array<{ id: string; content: string }>

        this.indexChunks(db, chunks)
    }

    private indexChunks(db: Database.Database, chunks: Array<{ id: string; content: string }>): void {
        const deleteExisting = db.prepare(BM25Queries.DELETE_BY_CHUNK_ID)
        const insertTerm = db.prepare(BM25Queries.INSERT_TERM)

        const indexAll = db.transaction(
            (items: Array<{ id: string; content: string }>) => {
                for (const chunk of items) {
                    deleteExisting.run(chunk.id)

                    const { termFrequencies } = this.tokenizer.tokenize(chunk.content)

                    for (const [term, frequency] of termFrequencies) {
                        insertTerm.run({
                            chunkId: chunk.id,
                            term,
                            frequency,
                        })
                    }
                }
            }
        )

        indexAll(chunks)
    }
}