import type { RetrievalResult, SearchQuery } from '@spyglass/shared'

export interface IRetriever {
    search(query: SearchQuery): Promise<RetrievalResult[]>;
    isReady(): Promise<boolean>;
}