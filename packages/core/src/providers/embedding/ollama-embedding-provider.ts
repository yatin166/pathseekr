import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import { Ollama } from 'ollama'
import type { IEmbeddingProvider, EmbeddingResult } from '../../interfaces/embedding-provider.interface'
import type { PathseekrConfig } from '@pathseekr/shared'
import { TYPES } from '../../container/types'

@injectable()
export class OllamaEmbeddingProvider implements IEmbeddingProvider {

    private readonly client: Ollama
    readonly modelName: string
    readonly dimensions: number

    constructor(
        @inject(TYPES.PathseekrConfig)
        private readonly config: PathseekrConfig
    ) {
        this.client = new Ollama({
            host: config.embedding.baseUrl,
        })
        this.modelName = config.embedding.model
        this.dimensions = config.embedding.dimensions
    }

    async embed(text: string): Promise<EmbeddingResult> {
        const response = await this.client.embeddings({
            model: this.modelName,
            prompt: text,
        })

        return {
            embedding: response.embedding,
            tokenCount: text.split(/\s+/).length,
        }
    }

    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
        // Ollama does not support true batch embedding in one call
        const batchSize = this.config.embedding.batchSize
        const results: EmbeddingResult[] = []

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize)

            const batchResults = await Promise.all(
                batch.map((text) => this.embed(text))
            )

            results.push(...batchResults)
        }

        return results
    }
}