import type { RetrievalResult, SearchQuery } from '@spyglass/shared'

export interface RetrieverInterface {
    search(query: SearchQuery): Promise<RetrievalResult[]>;
    isReady(): Promise<boolean>;
}