export const Tables = {
    DOCUMENTS: 'documents',
    CHUNKS: 'chunks',
    EMBEDDINGS: 'embeddings',
    BM25_TERMS: 'bm25_terms',
    INGESTION_JOBS: 'ingestion_jobs',
    MIGRATIONS: '_migrations',
} as const

export const DocumentCols = {
    ID: 'id',
    SOURCE_PATH: 'source_path',
    SOURCE_TYPE: 'source_type',
    DOCUMENT_TYPE: 'document_type',
    LANGUAGE: 'language',
    NAME: 'name',
    CHECKSUM: 'checksum',
    SIZE_BYTES: 'size_bytes',
    CHUNK_COUNT: 'chunk_count',
    JOB_ID: 'job_id',
    CREATED_AT: 'created_at',
    UPDATED_AT: 'updated_at',
} as const

export const ChunkCols = {
    ID: 'id',
    DOCUMENT_ID: 'document_id',
    CONTENT: 'content',
    CHUNK_TYPE: 'chunk_type',
    LANGUAGE: 'language',
    NAME: 'name',
    START_LINE: 'start_line',
    END_LINE: 'end_line',
    METADATA: 'metadata',
    CREATED_AT: 'created_at',
} as const

export const EmbeddingCols = {
    CHUNK_ID: 'chunk_id',
    EMBEDDING: 'embedding',
    MODEL_NAME: 'model_name',
    DIMENSIONS: 'dimensions',
    CREATED_AT: 'created_at',
} as const

export const BM25Cols = {
    ID: 'id',
    CHUNK_ID: 'chunk_id',
    TERM: 'term',
    FREQUENCY: 'frequency',
} as const

export const JobCols = {
    ID: 'id',
    SOURCE_PATH: 'source_path',
    STATUS: 'status',
    TOTAL_FILES: 'total_files',
    PROCESSED_FILES: 'processed_files',
    TOTAL_CHUNKS: 'total_chunks',
    SKIPPED_FILES: 'skipped_files',
    ERROR_MESSAGE: 'error_message',
    STARTED_AT: 'started_at',
    COMPLETED_AT: 'completed_at',
    CREATED_AT: 'created_at',
} as const

export interface RawDocument {
    id: string
    source_path: string
    source_type: string
    document_type: string
    language: string
    name: string
    checksum: string
    size_bytes: number
    chunk_count: number
    job_id: string
    created_at: string
    updated_at: string
}

export interface RawChunk {
    id: string
    document_id: string
    content: string
    chunk_type: string
    language: string
    name: string
    start_line: number
    end_line: number
    metadata: string
    created_at: string
}

export interface RawChunkWithEmbedding extends RawChunk {
    embedding: Buffer | null
}

export interface RawDocumentSummary {
    id: string
    name: string
    source_path: string
    language: string
    chunk_count: number
    updated_at: string
}