export interface EmbeddingResult {
    readonly embedding: number[];
    readonly tokenCount: number;
}

export interface EmbeddingProviderInterface {
    readonly modelName: string;
    readonly dimensions: number;

    embed(text: string): Promise<EmbeddingResult>;
    embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}