import type { Chunk, Language } from '@spyglass/shared'

export interface ParseResult {
    readonly chunks: Chunk[];
    readonly language: Language;
    readonly totalLines: number;
    readonly imports?: string[];
}

export interface IDocumentParser {
    readonly supportedExtensions: readonly string[];

    parse(filePath: string, content: string): Promise<ParseResult>;
    supports(filePath: string): boolean;
}