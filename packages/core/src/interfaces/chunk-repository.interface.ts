import type { Chunk, StoredChunk } from '@pathseekr/shared'

export interface IChunkRepository {
    save(chunk: Chunk): Promise<void>;
    saveBatch(chunks: Chunk[]): Promise<void>;
    saveEmbedding(chunkId: string, embedding: number[], modelName: string): Promise<void>;
    findById(id: string): Promise<StoredChunk | null>;
    findByDocumentId(documentId: string): Promise<StoredChunk[]>;
    findUnembedded(): Promise<Chunk[]>;
    deleteByDocumentId(documentId: string): Promise<void>;
    count(): Promise<number>;
}