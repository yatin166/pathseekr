export type DocumentType = 'code' | 'text' | 'markdown'

export type SourceType = 'filesystem' | 'github'

export interface Document {
    readonly id: string;
    readonly sourcePath: string;
    readonly sourceType: SourceType;
    readonly documentType: DocumentType;
    readonly language: string;
    readonly name: string;
    readonly checksum: string;
    readonly sizeBytes: number;
    readonly chunkCount: number;
    readonly jobId: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export interface DocumentSummary {
    readonly id: string;
    readonly name: string;
    readonly sourcePath: string;
    readonly language: string;
    readonly chunkCount: number;
    readonly updatedAt: Date;
}