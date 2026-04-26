import {Chunk} from "./chunk";
import {DocumentSummary} from "./document";


export type RetrievalStrategy = | 'bm25' | 'vector' | 'hybrid'

export interface SearchQuery {
    readonly query: string;
    readonly strategy: RetrievalStrategy;
    readonly limit: number;
    readonly filters?: SearchFilters;
}

export interface SearchFilters {
    readonly language?: string;
    readonly chunkType?: string;
    readonly documentPath?: string;
}

export interface RetrievalResult {
    readonly chunk: Chunk;
    readonly document: DocumentSummary;
    readonly score: number;
    readonly strategy: RetrievalStrategy;
    readonly rank: number;
    readonly highlights?: string[];
}

export interface StrategyResults {
    readonly bm25: RetrievalResult[];
    readonly vector: RetrievalResult[];
    readonly hybrid: RetrievalResult[];
}

export interface QueryResponse {
    readonly query: string;
    readonly results: RetrievalResult[];
    readonly strategies: StrategyResults;
    readonly winningStrategy: RetrievalStrategy;
    readonly totalChunksSearched: number;
    readonly durationMs: number;
}