// packages/core/debug-bm25.ts
import 'reflect-metadata'

import { createContainer } from './src/container/container'
import { TYPES } from './src/container/types'
import { DatabaseConnection } from './src/storage/database'
import { BM25Queries } from './src/retrieval/queries/bm25-queries'
import { Tables } from './src/storage/schema'
import type { SpyglassConfig } from '@spyglass/shared'

const config: SpyglassConfig = {
    embedding: {
        provider: 'ollama',
        model: 'embeddinggemma',
        baseUrl: 'http://localhost:11434',
        dimensions: 768,
        batchSize: 20,
    },
    llm: {
        provider: 'ollama',
        model: 'gemma3:8b',
        baseUrl: 'http://localhost:11434',
    },
    storage: { dataDir: '~/.spyglass' },
    indexing: {
        concurrency: 5,
        maxFileSizeBytes: 1048576,
        excludePatterns: [],
    },
    retrieval: { defaultLimit: 10, bm25Weight: 0.5 },
    server: { apiPort: 3001, mcpPort: 3002, webPort: 3000 },
    logLevel: 'info',
    nodeEnv: 'development',
}

async function debug(): Promise<void> {
    const container = createContainer(config)
    const connection = container.get<DatabaseConnection>(
        TYPES.DatabaseConnection
    )
    const db = connection.getDb()

    // Step 1 — basic counts
    console.log('\n── Step 1: Basic counts ──')
    const chunkCount = (db.prepare(
        'SELECT COUNT(*) as count FROM chunks'
    ).get() as { count: number }).count
    const termCount = (db.prepare(
        'SELECT COUNT(*) as count FROM bm25_terms'
    ).get() as { count: number }).count
    console.log(`Chunks: ${chunkCount}, BM25 terms: ${termCount}`)

    // Step 2 — test ALL_CHUNKS_FOR_INDEX query directly
    console.log('\n── Step 2: Test ALL_CHUNKS_FOR_INDEX ──')
    console.log(`Query: ${BM25Queries.ALL_CHUNKS_FOR_INDEX}`)
    try {
        const chunks = db
            .prepare(BM25Queries.ALL_CHUNKS_FOR_INDEX)
            .all() as Array<{ id: string; content: string }>
        console.log(`OK — returned ${chunks.length} chunks`)
        if (chunks[0]) {
            console.log(`First chunk id: ${chunks[0].id}`)
            console.log(
                `First chunk content preview: ${chunks[0].content.slice(0, 50)}`
            )
        }
    } catch (err) {
        console.error(`FAILED: ${String(err)}`)
        return
    }

    // Step 3 — test DELETE_BY_CHUNK_ID
    console.log('\n── Step 3: Test DELETE_BY_CHUNK_ID ──')
    console.log(`Query: ${BM25Queries.DELETE_BY_CHUNK_ID}`)
    try {
        db.prepare(BM25Queries.DELETE_BY_CHUNK_ID).run('test-id')
        console.log('OK')
    } catch (err) {
        console.error(`FAILED: ${String(err)}`)
        return
    }

    // Step 4 — test INSERT_TERM
    console.log('\n── Step 4: Test INSERT_TERM ──')
    console.log(`Query: ${BM25Queries.INSERT_TERM}`)
    try {
        // Get a real chunk id to test with
        const firstChunk = db
            .prepare('SELECT id FROM chunks LIMIT 1')
            .get() as { id: string } | undefined

        if (!firstChunk) {
            console.log('No chunks to test with')
            return
        }

        db.prepare(BM25Queries.INSERT_TERM).run({
            chunkId: firstChunk.id,
            term: 'testterm',
            frequency: 1,
        })
        console.log(`OK — inserted test term for chunk ${firstChunk.id}`)

        // Clean up test term
        db.prepare(
            `DELETE FROM ${Tables.BM25_TERMS} WHERE term = 'testterm'`
        ).run()
        console.log('Test term cleaned up')
    } catch (err) {
        console.error(`FAILED: ${String(err)}`)
        return
    }

    // Step 5 — test tokenizer
    console.log('\n── Step 5: Test tokenizer ──')
    try {
        const { CodeTokenizer } = await import(
            './src/retrieval/tokenizer/code-tokenizer'
            )
        const tokenizer = new CodeTokenizer()
        const result = tokenizer.tokenize(
            'export class ChunkRepository implements IChunkRepository'
        )
        console.log(`OK — tokens: ${result.terms.join(', ')}`)
    } catch (err) {
        console.error(`FAILED: ${String(err)}`)
        return
    }

    // Step 6 — run full buildAll manually step by step
    console.log('\n── Step 6: Manual buildAll ──')
    try {
        const { CodeTokenizer } = await import(
            './src/retrieval/tokenizer/code-tokenizer'
            )
        const tokenizer = new CodeTokenizer()

        const chunks = db
            .prepare(BM25Queries.ALL_CHUNKS_FOR_INDEX)
            .all() as Array<{ id: string; content: string }>

        console.log(
            `Processing ${chunks.length} chunks manually...`
        )

        const deleteExisting = db.prepare(
            BM25Queries.DELETE_BY_CHUNK_ID
        )
        const insertTerm = db.prepare(BM25Queries.INSERT_TERM)

        let processed = 0
        let totalTerms = 0

        for (const chunk of chunks.slice(0, 3)) {
            // Test first 3 only
            console.log(
                `\n  Chunk ${chunk.id.slice(0, 8)}...`
            )
            deleteExisting.run(chunk.id)

            const { termFrequencies } = tokenizer.tokenize(
                chunk.content
            )
            console.log(
                `  Terms extracted: ${termFrequencies.size}`
            )

            for (const [term, frequency] of termFrequencies) {
                insertTerm.run({ chunkId: chunk.id, term, frequency })
                totalTerms++
            }
            processed++
        }

        console.log(
            `\nOK — processed ${processed} chunks, inserted ${totalTerms} terms`
        )
    } catch (err) {
        console.error(`FAILED at step 6: ${String(err)}`)
        console.error(
            err instanceof Error ? err.stack : String(err)
        )
    }
}

debug().catch(console.error)