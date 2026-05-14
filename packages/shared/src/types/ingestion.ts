export type JobStatus = | 'queued' | 'scanning' | 'parsing' | 'graphing' | 'embedding' | 'completed' | 'failed'

export type IndexingPhase = 'parsing' | 'embedding' | 'graphing'

export interface IngestionJob {
    readonly id: string
    readonly sourcePath: string
    readonly status: JobStatus
    readonly phase: IndexingPhase
    readonly totalFiles: number
    readonly processedFiles: number
    readonly totalChunks: number
    readonly skippedFiles: number
    readonly errorMessage?: string
    readonly startedAt?: Date
    readonly completedAt?: Date
    readonly createdAt: Date
    readonly parseMs?: number
    readonly graphMs?: number
    readonly embedMs?: number
    readonly newFiles?: number
    readonly changedFiles?: number
    readonly unchangedFiles?: number
    readonly skippedReasons?: Record<string, number>
    readonly skippedExtensions?: string[]
    readonly skippedDirectories?: string[]
    readonly unparsableExtensions?: string[]
}

export interface IndexingProgress {
    readonly jobId: string
    readonly status: JobStatus
    readonly phase: IndexingPhase
    readonly currentFile?: string
    readonly processedFiles: number
    readonly totalFiles: number
    readonly totalChunks: number
    readonly percentComplete: number
    readonly processedChunks?: number
    readonly totalChunksToEmbed?: number
    readonly scanMs?: number
    readonly graphMs?: number
    readonly newFiles?: number
    readonly changedFiles?: number
    readonly unchangedFiles?: number
}

export interface IndexStats {
    readonly totalDocuments: number
    readonly totalChunks: number
    readonly totalEmbeddings: number
    readonly byLanguage: Record<string, number>
    readonly byChunkType: Record<string, number>
    readonly lastIndexedAt?: Date
    readonly databaseSizeBytes: number
}