import 'reflect-metadata'
import { injectable } from 'inversify'
import { randomUUID } from 'crypto'
import type { Chunk } from '@spyglass/shared'
import type { ParseResult } from '../interfaces/document-parser.interface'

@injectable()
export class ChunkBuilder {

    build(parseResult: ParseResult, documentId: string): Chunk[] {
        return parseResult.chunks.map((chunk) => ({
            ...chunk,
            id: chunk.id || randomUUID(),
            documentId,
            createdAt: chunk.createdAt ?? new Date(),
        }))
    }

}