import 'reflect-metadata'

import { createContainer } from './src/container/container'
import { TYPES } from './src/container/types'
import { DatabaseConnection } from './src/storage/database'
import { BM25Retriever } from './src/retrieval/strategies/bm25/bm25-retriever'
import { VectorRetriever } from './src/retrieval/strategies/vector/vector-retriever'
import type { SpyglassConfig } from '@spyglass/shared'

const config: SpyglassConfig = {
    embedding: {
        provider: 'ollama',
        model: 'qwen3-embedding:0.6b',
        baseUrl: 'http://localhost:11434',
        dimensions: 1024,
        batchSize: 10,
    },
    llm: {
        provider: 'ollama',
        model: 'gemma3:8b',
        baseUrl: 'http://localhost:11434',
    },
    storage: {
        dataDir: '~/.spyglass',
    },
    indexing: {
        concurrency: 5,
        maxFileSizeBytes: 1048576,
        excludePatterns: [],
    },
    retrieval: {
        defaultLimit: 5,
        bm25Weight: 0.5,
    },
    server: {
        apiPort: 3001,
        mcpPort: 3002,
        webPort: 3000,
    },
    logLevel: 'info',
    nodeEnv: 'development',
}

async function verify(): Promise<void> {
    console.log('\nSpyglass — Retrieval Verification\n')
    console.log('─'.repeat(60))

    const container = createContainer(config)

    // ── Step 1: Database state ───────────────────────────────────
    console.log('\n── Step 1: Database state ──')
    const connection = container.get<DatabaseConnection>(
        TYPES.DatabaseConnection
    )
    const db = connection.getDb()

    const docCount = (db.prepare(
        'SELECT COUNT(*) as count FROM documents'
    ).get() as { count: number }).count

    const chunkCount = (db.prepare(
        'SELECT COUNT(*) as count FROM chunks'
    ).get() as { count: number }).count

    const termCount = (db.prepare(
        'SELECT COUNT(*) as count FROM bm25_terms'
    ).get() as { count: number }).count

    const embeddingCount = (db.prepare(
        'SELECT COUNT(*) as count FROM embeddings'
    ).get() as { count: number }).count

    console.log(`  Documents:  ${docCount}`)
    console.log(`  Chunks:     ${chunkCount}`)
    console.log(`  BM25 terms: ${termCount}`)
    console.log(`  Embeddings: ${embeddingCount}`)

    if (chunkCount === 0) {
        console.log('\n  No chunks found. Run: spyglass index <path>')
        return
    }

    if (termCount === 0) {
        console.log('\n  No BM25 terms. Run: spyglass index <path> --force')
        return
    }

    if (embeddingCount === 0) {
        console.log('\n  No embeddings. Run: spyglass embed')
        return
    }

    // ── Step 2: BM25 retrieval ───────────────────────────────────
    console.log('\n── Step 2: BM25 retrieval ──')
    const bm25Retriever = container.get<BM25Retriever>(
        TYPES.BM25Retriever
    )

    const bm25Ready = await bm25Retriever.isReady()
    console.log(`  Ready: ${bm25Ready ? 'yes' : 'no'}`)

    if (bm25Ready) {
        const testQueries = [
            'database connection',
            'parse typescript file',
            'chunk repository',
        ]

        for (const query of testQueries) {
            try {
                const results = await bm25Retriever.search({
                    query,
                    strategy: 'bm25',
                    limit: 3,
                })
                console.log(`\n  Query: "${query}"`)
                console.log(`  Results: ${results.length}`)
                for (const r of results.slice(0, 2)) {
                    console.log(
                        `    [${r.rank}] ${r.chunk.name} — ${(r.score * 100).toFixed(0)}%`
                    )
                }
            } catch (err) {
                console.error(`  FAILED: ${String(err)}`)
            }
        }
    }

    // ── Step 3: Vector retrieval ─────────────────────────────────
    console.log('\n── Step 3: Vector retrieval ──')
    const vectorRetriever = container.get<VectorRetriever>(
        TYPES.VectorRetriever
    )

    const vectorReady = await vectorRetriever.isReady()
    console.log(`  Ready: ${vectorReady ? 'yes' : 'no'}`)

    if (vectorReady) {
        const testQueries = [
            'how do I store a chunk',
            'walk directory and find files',
            'find code that has not been embedded yet',
        ]

        for (const query of testQueries) {
            try {
                const results = await vectorRetriever.search({
                    query,
                    strategy: 'vector',
                    limit: 3,
                })
                console.log(`\n  Query: "${query}"`)
                console.log(`  Results: ${results.length}`)
                for (const r of results.slice(0, 2)) {
                    console.log(
                        `    [${r.rank}] ${r.chunk.name} — ${(r.score * 100).toFixed(0)}%`
                    )
                }
            } catch (err) {
                console.error(`  FAILED: ${String(err)}`)
            }
        }
    }

    console.log('\n─'.repeat(60))
    console.log('\n✓ Verification complete\n')
}

verify().catch(console.error)