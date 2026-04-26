import type { IngestionJob, IndexingProgress } from '@spyglass/shared'

export interface IndexOptions {
    readonly force?: boolean;
    readonly skipEmbedding?: boolean;
}

export interface IndexerInterface {
    index(sourcePath: string, options?: IndexOptions, onProgress?: (progress: IndexingProgress) => void): Promise<IngestionJob>;
}