export interface GenerateOptions {
    readonly maxTokens?: number;
    readonly temperature?: number;
}

export interface LlmProviderInterface {
    readonly modelName: string;

    generate(prompt: string, context: string, options?: GenerateOptions): Promise<string>;
    stream(prompt: string, context: string, options?: GenerateOptions): AsyncIterable<string>;
}