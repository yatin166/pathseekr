export const TYPES = {
    DatabaseConnection: Symbol.for('DatabaseConnection'),
    SpyglassConfig: Symbol.for('SpyglassConfig'),

    IEmbeddingProvider: Symbol.for('IEmbeddingProvider'),
    ILLMProvider: Symbol.for('ILLMProvider'),

    IChunkRepository: Symbol.for('IChunkRepository'),
    IDocumentRepository: Symbol.for('IDocumentRepository'),

    BM25Retriever: Symbol.for('BM25Retriever'),
    VectorRetriever: Symbol.for('VectorRetriever'),
    EmbeddingPipeline: Symbol.for('EmbeddingPipeline'),
    HybridRetriever: Symbol.for('HybridRetriever'),

    ParserRegistry: Symbol.for('ParserRegistry'),

    IIndexer: Symbol.for('IIndexer'),
    FileScanner: Symbol.for('FileScanner'),
    ChecksumService: Symbol.for('ChecksumService'),
    ChunkBuilder: Symbol.for('ChunkBuilder'),

    // Retrieval
    ITokenizer: Symbol.for('ITokenizer'),
    BM25IndexBuilder: Symbol.for('BM25IndexBuilder'),

} as const