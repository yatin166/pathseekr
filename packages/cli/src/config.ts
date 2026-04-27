import 'reflect-metadata'
import { z } from 'zod'
import dotenv from 'dotenv'
import path from 'path'
import type { SpyglassConfig } from '@spyglass/shared'

dotenv.config({ path: path.join(process.cwd(), '.env') })

dotenv.config({
    path: path.join(
        process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.',
        '.spyglass',
        '.env'
    ),
    override: false,
})

const envSchema = z.object({
    OLLAMA_BASE_URL: z
        .string()
        .default('http://localhost:11434'),
    OLLAMA_EMBEDDING_MODEL: z
        .string()
        .default('nomic-embed-text'),
    OLLAMA_LLM_MODEL: z
        .string()
        .default('gemma3:8b'),
    SPYGLASS_DATA_DIR: z
        .string()
        .default('~/.spyglass'),
    API_PORT: z
        .string()
        .default('3001')
        .transform(Number),
    MCP_PORT: z
        .string()
        .default('3002')
        .transform(Number),
    WEB_PORT: z
        .string()
        .default('3000')
        .transform(Number),
    INDEXING_CONCURRENCY: z
        .string()
        .default('10')
        .transform(Number),
    EMBEDDING_BATCH_SIZE: z
        .string()
        .default('20')
        .transform(Number),
    MAX_FILE_SIZE_BYTES: z
        .string()
        .default('1048576')
        .transform(Number),
    DEFAULT_SEARCH_LIMIT: z
        .string()
        .default('10')
        .transform(Number),
    BM25_WEIGHT: z
        .string()
        .default('0.5')
        .transform(Number),
    LOG_LEVEL: z
        .enum(['error', 'warn', 'info', 'debug'])
        .default('info'),
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),
})

function buildConfig(): SpyglassConfig {
    const parsed = envSchema.safeParse(process.env)

    if (!parsed.success) {
        console.error('Invalid configuration:')
        for (const [field, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
            console.error(`  ${field}: ${errors?.join(', ') ?? ''}`)
        }
        process.exit(1)
    }

    const env = parsed.data

    return {
        embedding: {
            provider: 'ollama',
            model: env.OLLAMA_EMBEDDING_MODEL,
            baseUrl: env.OLLAMA_BASE_URL,
            dimensions: 768,
            batchSize: env.EMBEDDING_BATCH_SIZE,
        },
        llm: {
            provider: 'ollama',
            model: env.OLLAMA_LLM_MODEL,
            baseUrl: env.OLLAMA_BASE_URL,
        },
        storage: {
            dataDir: env.SPYGLASS_DATA_DIR,
        },
        indexing: {
            concurrency: env.INDEXING_CONCURRENCY,
            maxFileSizeBytes: env.MAX_FILE_SIZE_BYTES,
            excludePatterns: [],
        },
        retrieval: {
            defaultLimit: env.DEFAULT_SEARCH_LIMIT,
            bm25Weight: env.BM25_WEIGHT,
        },
        server: {
            apiPort: env.API_PORT,
            mcpPort: env.MCP_PORT,
            webPort: env.WEB_PORT,
        },
        logLevel: env.LOG_LEVEL,
        nodeEnv: env.NODE_ENV,
    }
}

export const config = buildConfig()
