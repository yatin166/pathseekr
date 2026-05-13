import type { RetrievalResult, SearchQuery } from '@pathseekr/shared'

export interface IRetriever {
    search(query: SearchQuery): Promise<RetrievalResult[]>;
    isReady(): Promise<boolean>;
}