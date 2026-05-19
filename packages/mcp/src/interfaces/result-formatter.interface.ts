import type { RetrievalResult, Chunk } from '@pathseekr/shared'

export interface RawSymbolRow {
  id: string
  name: string
  chunk_type: string
  start_line: number
  end_line: number
  content: string
  metadata: string
  source_path: string
}

export interface IResultFormatter {
  formatSearchResults(results: RetrievalResult[], query: string): string
  formatSymbolResults(rows: RawSymbolRow[], query: string): string
  formatFileContext(filePath: string, language: string, chunks: Chunk[]): string
}