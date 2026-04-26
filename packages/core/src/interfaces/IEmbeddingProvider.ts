export interface EmbeddingResult {
    readonly embedding: number[];
    readonly tokenCount: number;
}

export interface IEmbeddingProvider {
    readonly modelName: string;
    readonly dimensions: number;

    embed(text: string): Promise<EmbeddingResult>;
    embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}