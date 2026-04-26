export interface EmbeddingConfig {
    readonly provider: 'ollama';
    readonly model: string;
    readonly baseUrl: string;
    readonly dimensions: number;
    readonly batchSize: number;
}

export interface LLMConfig {
    readonly provider: 'ollama';
    readonly model: string;
    readonly baseUrl: string;
}

export interface StorageConfig {
    readonly dataDir: string;
}

export interface IndexingConfig {
    readonly concurrency: number;
    readonly maxFileSizeBytes: number;
    readonly excludePatterns: string[];
}

export interface RetrievalConfig {
    readonly defaultLimit: number;
    readonly bm25Weight: number;
}

export interface ServerConfig {
    readonly apiPort: number;
    readonly mcpPort: number;
    readonly webPort: number;
}

export interface SpyglassConfig {
    readonly embedding: EmbeddingConfig;
    readonly llm: LLMConfig;
    readonly storage: StorageConfig;
    readonly indexing: IndexingConfig;
    readonly retrieval: RetrievalConfig;
    readonly server: ServerConfig;
    readonly logLevel: 'error' | 'warn' | 'info' | 'debug';
    readonly nodeEnv: 'development' | 'production' | 'test';
}