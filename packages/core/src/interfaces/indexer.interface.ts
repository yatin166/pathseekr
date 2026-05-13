import type { IngestionJob, IndexingProgress } from '@pathseekr/shared'

export interface IndexOptions {
    readonly force?: boolean;
    readonly skipEmbedding?: boolean;
}

export interface IIndexer {
    index(sourcePath: string, options?: IndexOptions, onProgress?: (progress: IndexingProgress) => void): Promise<IngestionJob>;
}