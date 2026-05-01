export interface TokenizeResult {
    readonly terms: string[]
    readonly termFrequencies: Map<string, number>
}

export interface ITokenizer {
    tokenize(text: string): TokenizeResult
}