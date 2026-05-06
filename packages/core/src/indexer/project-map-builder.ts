import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Chunk, SpyglassConfig } from '@spyglass/shared'
import type { IDocumentRepository } from '../interfaces/document-repository.interface'
import type { IChunkRepository } from '../interfaces/chunk-repository.interface'
import { TYPES } from '../container/types'

@injectable()
export class ProjectMapBuilder {

    private readonly MAP_FILENAME = 'project-map.txt'

    constructor(
        @inject(TYPES.SpyglassConfig)
        private readonly config: SpyglassConfig,

        @inject(TYPES.IDocumentRepository)
        private readonly documentRepository: IDocumentRepository,

        @inject(TYPES.IChunkRepository)
        private readonly chunkRepository: IChunkRepository,
    ) {}

    async build(rootPath: string): Promise<void> {
        const documents = await this.documentRepository.listAll()

        const sorted = [...documents].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))

        const totalChunks = sorted.reduce((sum, d) => sum + d.chunkCount, 0)

        const lines: string[] = [
            '# Spyglass Project Map',
            `# Generated: ${new Date().toISOString()}`,
            `# ${sorted.length} files | ${totalChunks} chunks`,
            '',
        ]

        for (const doc of sorted) {
            const relativePath = path.relative(rootPath, doc.sourcePath)
            lines.push(`${relativePath} [${doc.language}]`)

            const chunks = await this.chunkRepository.findByDocumentId(doc.id)
            this.renderChunks(chunks, lines)
            lines.push('')
        }

        const dataDir = this.config.storage.dataDir.replace(/^~/, os.homedir())
        fs.mkdirSync(dataDir, { recursive: true })
        fs.writeFileSync(path.join(dataDir, this.MAP_FILENAME), lines.join('\n'), 'utf-8')
    }

    private renderChunks(chunks: Chunk[], lines: string[]): void {
        const classes   = chunks.filter(c => c.chunkType === 'class')
        const methods   = chunks.filter(c => c.chunkType === 'method')
        const interfaces = chunks.filter(c => c.chunkType === 'interface')
        const types     = chunks.filter(c => c.chunkType === 'type')
        const functions = chunks.filter(c => c.chunkType === 'function')

        for (const cls of classes) {
            lines.push(`  class ${cls.name}`)
            const classMethods = methods.filter(m => m.metadata.parentName === cls.name)
            for (const method of classMethods) {
                const sig = method.metadata.signature ?? `${method.name}()`
                lines.push(`    ${sig}`)
            }
        }

        for (const item of interfaces) {
            lines.push(`  interface ${item.name}`)
        }

        for (const type of types) {
            lines.push(`  type ${type.name}`)
        }

        for (const fn of functions) {
            const sig = fn.metadata.signature ?? `${fn.name}()`
            lines.push(`  fn ${sig}`)
        }
    }
}