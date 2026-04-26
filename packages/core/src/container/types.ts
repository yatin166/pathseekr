export const TYPES = {
    IEmbeddingProvider: Symbol.for('IEmbeddingProvider'),
    ILLMProvider: Symbol.for('ILLMProvider'),

    IChunkRepository: Symbol.for('IChunkRepository'),
    IDocumentRepository: Symbol.for('IDocumentRepository'),

    BM25Retriever: Symbol.for('BM25Retriever'),
    VectorRetriever: Symbol.for('VectorRetriever'),
    HybridRetriever: Symbol.for('HybridRetriever'),

    IDocumentParser: Symbol.for('IDocumentParser'),
    ParserRegistry: Symbol.for('ParserRegistry'),

    IIndexer: Symbol.for('IIndexer'),

    SpyglassConfig: Symbol.for('SpyglassConfig'),
} as const