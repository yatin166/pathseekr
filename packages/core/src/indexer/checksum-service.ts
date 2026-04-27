import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import { createHash } from 'crypto'
import type { IDocumentRepository } from '../interfaces/document-repository.interface'
import { TYPES } from '../container/types'

export type FileStatus = | 'new' | 'changed' | 'unchanged'

export interface ChecksumResult {
    readonly status: FileStatus
    readonly checksum: string
    readonly existingDocumentId?: string
}

@injectable()
export class ChecksumService {
    constructor(
        @inject(TYPES.IDocumentRepository)
        private readonly documentRepository: IDocumentRepository
    ) {}

    async check(
        filePath: string,
        content: string
    ): Promise<ChecksumResult> {
        const checksum = this.compute(content)
        const existing = await this.documentRepository.findByPath(
            filePath
        )

        if (!existing) {
            return { status: 'new', checksum }
        }

        if (existing.checksum === checksum) {
            return {
                status: 'unchanged',
                checksum,
                existingDocumentId: existing.id,
            }
        }

        return {
            status: 'changed',
            checksum,
            existingDocumentId: existing.id,
        }
    }

    compute(content: string): string {
        return createHash('sha256').update(content).digest('hex')
    }
}