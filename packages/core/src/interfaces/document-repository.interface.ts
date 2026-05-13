import type { Document, DocumentSummary, IndexStats } from '@pathseekr/shared'

export interface IDocumentRepository {
    save(document: Document): Promise<void>;
    findByPath(sourcePath: string): Promise<Document | null>;
    findById(id: string): Promise<Document | null>;
    listAll(): Promise<DocumentSummary[]>;
    updateChecksum(id: string, checksum: string): Promise<void>;
    delete(id: string): Promise<void>;
    getStats(): Promise<IndexStats>;
}