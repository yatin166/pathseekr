import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ChecksumService } from '../../../src/indexer/checksum-service'
import type { IDocumentRepository } from '../../../src/interfaces/document-repository.interface'
import type { Document } from '@pathseekr/shared'

function createMockRepository(
  findByPathResult: Document | null = null
): IDocumentRepository {
  return {
    findByPath: vi.fn().mockResolvedValue(findByPathResult),
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    listAll: vi.fn().mockResolvedValue([]),
    updateChecksum: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({}),
  }
}

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-123',
    sourcePath: '/src/file.ts',
    sourceType: 'filesystem',
    documentType: 'code',
    language: 'typescript',
    name: 'file.ts',
    checksum: 'abc123',
    sizeBytes: 1024,
    chunkCount: 5,
    jobId: 'job-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('ChecksumService', () => {
  let repository: IDocumentRepository
  let service: ChecksumService

  beforeEach(() => {
    repository = createMockRepository()
    service = new ChecksumService(repository)
  })

  describe('check', () => {
    describe('new files', () => {
      it('returns status new when file has no existing document', async () => {
        const result = await service.check('/src/file.ts', 'file content')

        expect(result.status).toBe('new')
      })

      it('returns a checksum for new files', async () => {
        const result = await service.check('/src/file.ts', 'file content')

        expect(result.checksum).toBeTruthy()
        expect(typeof result.checksum).toBe('string')
      })

      it('does not return an existingDocumentId for new files', async () => {
        const result = await service.check('/src/file.ts', 'file content')

        expect(result.existingDocumentId).toBeUndefined()
      })

      it('calls findByPath with the correct file path', async () => {
        await service.check('/src/services/auth.ts', 'content')

        expect(repository.findByPath).toHaveBeenCalledWith('/src/services/auth.ts')
        expect(repository.findByPath).toHaveBeenCalledTimes(1)
      })
    })

    describe('unchanged files', () => {
      it('returns status unchanged when checksum matches', async () => {
        const content = 'file content'
        const checksum = service.compute(content)
        repository = createMockRepository(makeDocument({ checksum }))
        service = new ChecksumService(repository)

        const result = await service.check('/src/file.ts', content)

        expect(result.status).toBe('unchanged')
      })

      it('returns the existing document id when unchanged', async () => {
        const content = 'file content'
        const checksum = service.compute(content)
        repository = createMockRepository(
          makeDocument({ id: 'existing-doc-id', checksum })
        )
        service = new ChecksumService(repository)

        const result = await service.check('/src/file.ts', content)

        expect(result.existingDocumentId).toBe('existing-doc-id')
      })

      it('returns the same checksum as the stored one when unchanged', async () => {
        const content = 'file content'
        const checksum = service.compute(content)
        repository = createMockRepository(makeDocument({ checksum }))
        service = new ChecksumService(repository)

        const result = await service.check('/src/file.ts', content)

        expect(result.checksum).toBe(checksum)
      })
    })

    describe('changed files', () => {
      it('returns status changed when checksum differs', async () => {
        repository = createMockRepository(
          makeDocument({ checksum: 'old-checksum' })
        )
        service = new ChecksumService(repository)

        const result = await service.check('/src/file.ts', 'new content')

        expect(result.status).toBe('changed')
      })

      it('returns the existing document id when changed', async () => {
        repository = createMockRepository(
          makeDocument({ id: 'existing-doc-id', checksum: 'old-checksum' })
        )
        service = new ChecksumService(repository)

        const result = await service.check('/src/file.ts', 'new content')

        expect(result.existingDocumentId).toBe('existing-doc-id')
      })

      it('returns the new computed checksum when changed', async () => {
        repository = createMockRepository(
          makeDocument({ checksum: 'old-checksum' })
        )
        service = new ChecksumService(repository)

        const newContent = 'new content'
        const result = await service.check('/src/file.ts', newContent)

        expect(result.checksum).toBe(service.compute(newContent))
        expect(result.checksum).not.toBe('old-checksum')
      })
    })
  })

  describe('compute', () => {
    it('returns a non-empty string', () => {
      const checksum = service.compute('some content')

      expect(checksum).toBeTruthy()
      expect(typeof checksum).toBe('string')
    })

    it('returns the same checksum for identical content', () => {
      const content = 'identical content'

      expect(service.compute(content)).toBe(service.compute(content))
    })

    it('returns different checksums for different content', () => {
      expect(service.compute('content A')).not.toBe(service.compute('content B'))
    })

    it('returns a sha256 hex string of 64 characters', () => {
      const checksum = service.compute('some content')

      expect(checksum).toHaveLength(64)
      expect(checksum).toMatch(/^[0-9a-f]{64}$/)
    })

    it('is sensitive to whitespace changes', () => {
      expect(service.compute('hello world')).not.toBe(service.compute('hello  world'))
    })

    it('is sensitive to case changes', () => {
      expect(service.compute('Hello')).not.toBe(service.compute('hello'))
    })

    it('handles empty string without throwing', () => {
      expect(() => service.compute('')).not.toThrow()
    })

    it('produces a consistent checksum for empty string', () => {
      expect(service.compute('')).toBe(service.compute(''))
    })

    it('handles large content without throwing', () => {
      const largeContent = 'x'.repeat(1_000_000)

      expect(() => service.compute(largeContent)).not.toThrow()
    })
  })
})