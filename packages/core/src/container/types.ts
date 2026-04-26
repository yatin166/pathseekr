export const TYPES = {
    // Infrastructure
    DatabaseConnection: Symbol.for('DatabaseConnection'),

    // Providers
    IEmbeddingProvider: Symbol.for('IEmbeddingProvider'),
    ILLMProvider: Symbol.for('ILLMProvider'),

    // Repositories
    IChunkRepository: Symbol.for('IChunkRepository'),
    IDocumentRepository: Symbol.for('IDocumentRepository'),

    // Retrieval
    BM25Retriever: Symbol.for('BM25Retriever'),
    VectorRetriever: Symbol.for('VectorRetriever'),
    HybridRetriever: Symbol.for('HybridRetriever'),

    // Parsers
    IDocumentParser: Symbol.for('IDocumentParser'),
    ParserRegistry: Symbol.for('ParserRegistry'),

    // Indexer
    IIndexer: Symbol.for('IIndexer'),

    // Config
    SpyglassConfig: Symbol.for('SpyglassConfig'),
} as const