export type JobStatus = | 'queued' | 'scanning' | 'parsing' | 'embedding' | 'completed' | 'failed'

export interface IngestionJob {
    readonly id: string;
    readonly sourcePath: string;
    readonly status: JobStatus;
    readonly totalFiles: number;
    readonly processedFiles: number;
    readonly totalChunks: number;
    readonly skippedFiles: number;
    readonly errorMessage?: string;
    readonly startedAt?: Date;
    readonly completedAt?: Date;
    readonly createdAt: Date;
}

export interface IndexingProgress {
    readonly jobId: string;
    readonly status: JobStatus;
    readonly currentFile?: string;
    readonly processedFiles: number;
    readonly totalFiles: number;
    readonly totalChunks: number;
    readonly percentComplete: number;
}

export interface IndexStats {
    readonly totalDocuments: number;
    readonly totalChunks: number;
    readonly totalEmbeddings: number;
    readonly byLanguage: Record<string, number>;
    readonly byChunkType: Record<string, number>;
    readonly lastIndexedAt?: Date;
    readonly databaseSizeBytes: number;
}