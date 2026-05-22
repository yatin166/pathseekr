import type { RetrievalResult, Chunk, ChunkMetadata } from '@pathseekr/shared'
import type { IResultFormatter, RawSymbolRow } from '../interfaces/result-formatter.interface'

const CHUNK_TYPE_ORDER = ['class', 'interface', 'type', 'function', 'method'] as const
const SEARCH_PREVIEW_LINES = 8
const SYMBOL_PREVIEW_LINES = 6
const FILE_CONTEXT_PREVIEW_LINES = 10

export class MarkdownResultFormatter implements IResultFormatter {
  formatSearchResults(results: RetrievalResult[], query: string): string {
    const lines: string[] = [
      `Found ${results.length} result${results.length === 1 ? '' : 's'} for "${query}"\n`,
    ]

    for (const result of results) {
      const score = (result.score * 100).toFixed(0)
      const location = `${result.document.sourcePath}:${result.chunk.startLine}–${result.chunk.endLine}`

      lines.push(`## ${result.chunk.name} [${result.chunk.chunkType}]`)
      lines.push(`Location: ${location}`)
      lines.push(`Match: ${score}%`)

      this.appendSignature(result.chunk.metadata, lines)
      lines.push('')

      this.appendCodePreview(result.chunk.content, result.chunk.language, SEARCH_PREVIEW_LINES, lines)
      lines.push('')
    }

    return lines.join('\n')
  }

  formatSymbolResults(rows: RawSymbolRow[], query: string): string {
    const lines: string[] = [
      `Found ${rows.length} symbol${rows.length === 1 ? '' : 's'} matching "${query}"\n`,
    ]

    for (const row of rows) {
      const location = `${row.source_path}:${row.start_line}–${row.end_line}`
      const metadata = this.parseMetadata(row.metadata)

      lines.push(`## ${row.name} [${row.chunk_type}]`)
      lines.push(`Location: ${location}`)

      this.appendSignature(metadata, lines)
      this.appendParentName(metadata, lines)
      lines.push('')

      this.appendCodePreview(row.content, row.chunk_type, SYMBOL_PREVIEW_LINES, lines)
      lines.push('')
    }

    return lines.join('\n')
  }

  formatFileContext(filePath: string, language: string, chunks: Chunk[]): string {
    const lines: string[] = [
      `# File: ${filePath}`,
      `Language: ${language}`,
      `Symbols: ${chunks.length}\n`,
    ]

    const grouped = this.groupByType(chunks)

    for (const chunkType of CHUNK_TYPE_ORDER) {
      const group = grouped.get(chunkType)

      if (!group || group.length === 0) {
        continue
      }

      lines.push(`## ${this.capitalize(chunkType)}s\n`)

      for (const chunk of group) {
        lines.push(`### ${chunk.name}`)
        lines.push(`Lines: ${chunk.startLine}–${chunk.endLine}`)

        this.appendSignature(chunk.metadata, lines)
        this.appendParentName(chunk.metadata, lines)
        lines.push('')

        this.appendCodePreview(chunk.content, language, FILE_CONTEXT_PREVIEW_LINES, lines)
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  private appendSignature(metadata: ChunkMetadata, lines: string[]): void {
    if (metadata.signature) {
      lines.push(`Signature: ${metadata.signature}`)
    }
  }

  private appendParentName(metadata: ChunkMetadata, lines: string[]): void {
    if (metadata.parentName) {
      lines.push(`Class: ${metadata.parentName}`)
    }
  }

  private appendCodePreview(content: string, language: string, maxLines: number, lines: string[]): void {
    const preview = content
      .split('\n')
      .slice(0, maxLines)
      .join('\n')
      .trim()

    lines.push('```' + language)
    lines.push(preview)
    lines.push('```')
  }

  private groupByType(chunks: Chunk[]): Map<string, Chunk[]> {
    const grouped = new Map<string, Chunk[]>()

    for (const chunk of chunks) {
      const group = grouped.get(chunk.chunkType) ?? []
      group.push(chunk)
      grouped.set(chunk.chunkType, group)
    }

    return grouped
  }

  private parseMetadata(raw: string): ChunkMetadata {
    try {
      return JSON.parse(raw) as ChunkMetadata
    } catch {
      return {}
    }
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }
}