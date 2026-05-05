import 'reflect-metadata'
import { injectable } from 'inversify'
import { randomUUID } from 'crypto'
import type { Chunk } from '@spyglass/shared'
import type { ParseResult } from '../interfaces/document-parser.interface'

@injectable()
export class ChunkBuilder {

    build(parseResult: ParseResult, documentId: string, sourcePath: string): Chunk[] {
        return parseResult.chunks.map((chunk) => ({
            ...chunk,
            id: chunk.id || randomUUID(),
            documentId,
            createdAt: chunk.createdAt ?? new Date(),
            breadcrumb: this.buildBreadcrumb(sourcePath, chunk),
        }))
    }

    private buildBreadcrumb(sourcePath: string, chunk: Chunk): string {
        const lines: string[] = [`File: ${sourcePath}`]

        switch (chunk.chunkType) {
            case 'method':
                if (chunk.metadata.parentName) lines.push(`Class: ${chunk.metadata.parentName}`)
                lines.push(`Method: ${chunk.name}`)
                if (chunk.metadata.signature) lines.push(`Signature: ${chunk.metadata.signature}`)
                break

            case 'function':
                lines.push(`Function: ${chunk.name}`)
                if (chunk.metadata.signature) lines.push(`Signature: ${chunk.metadata.signature}`)
                break

            case 'class':
                lines.push(`Class: ${chunk.name}`)
                break

            case 'interface':
                lines.push(`Interface: ${chunk.name}`)
                break

            case 'type':
                lines.push(`Type: ${chunk.name}`)
                break

            default:
                if (chunk.name) lines.push(`${chunk.chunkType}: ${chunk.name}`)
                break
        }

        return lines.join('\n')
    }

}