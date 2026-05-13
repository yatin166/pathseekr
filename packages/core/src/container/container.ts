import 'reflect-metadata'
import { Container } from 'inversify'
import path from 'path'
import os from 'os'
import type { PathseekrConfig } from '@pathseekr/shared'
import { TYPES } from './types'
import { DatabaseConnection } from '../storage/database'
import { ChunkRepository } from '../storage/chunk-repository'
import { DocumentRepository } from '../storage/document-repository'
import { ParserRegistry } from '../parsers/parser-registry'
import { FileScanner } from '../indexer/file-scanner'
import { ChecksumService } from '../indexer/checksum-service'
import { ChunkBuilder } from '../indexer/chunk-builder'
import { CodebaseIndexer } from '../indexer/codebase-indexer'
import type { IChunkRepository } from '../interfaces/chunk-repository.interface'
import type { IDocumentRepository } from '../interfaces/document-repository.interface'
import type { IIndexer } from '../interfaces/indexer.interface'
import { ITokenizer } from '../retrieval/infrastructure/tokenizer/tokenizer.interface'
import { CodeTokenizer } from '../retrieval/infrastructure/tokenizer/code-tokenizer'
import { BM25IndexBuilder } from '../retrieval/strategies/bm25/bm25-index-builder'
import { BM25Retriever } from '../retrieval/strategies/bm25/bm25-retriever'
import { IEmbeddingProvider } from '../interfaces/embedding-provider.interface'
import { OllamaEmbeddingProvider } from '../providers/embedding/ollama-embedding-provider'
import { VectorRetriever } from '../retrieval/strategies/vector/vector-retriever'
import { EmbeddingIndexBuilder } from '../retrieval/strategies/vector/embedding-index-builder'
import { HybridRetriever } from '../retrieval/strategies/hybrid/hybrid-retriever'
import { ProjectMapBuilder } from '../indexer/project-map-builder'
import { EdgeBuilder } from '../retrieval/strategies/graph/edge-builder'
import { GraphRetriever } from '../retrieval/strategies/graph/graph-retriever'

/**
 * Creates and configures the dependency injection container.
 *
 * @param config - Application configuration
 * @param dbPath - Optional resolved database path. When provided (workspace
 *   mode) this overrides the default database location derived from config.
 *   When omitted, the default ~/.pathseekr/pathseekr.db is used.
 */
export function createContainer(config: PathseekrConfig, dbPath?: string): Container {
  const container = new Container({ defaultScope: 'Singleton' })

  container
    .bind<PathseekrConfig>(TYPES.PathseekrConfig)
    .toConstantValue(config)

  /**
   * Resolved once here so DatabaseConnection has no path resolution logic.
   * All callers go through this single resolution point.
   */
  const resolvedDbPath = dbPath ?? resolveDefaultDbPath(config)

  container
    .bind<string>(TYPES.DatabasePath)
    .toConstantValue(resolvedDbPath)

  // Infrastructure
  container
    .bind<DatabaseConnection>(TYPES.DatabaseConnection)
    .to(DatabaseConnection)

  // Repositories
  container
    .bind<IChunkRepository>(TYPES.IChunkRepository)
    .to(ChunkRepository)

  container
    .bind<IDocumentRepository>(TYPES.IDocumentRepository)
    .to(DocumentRepository)

  // Parsers
  container
    .bind<ParserRegistry>(TYPES.ParserRegistry)
    .to(ParserRegistry)

  // Indexer components
  container
    .bind<FileScanner>(TYPES.FileScanner)
    .to(FileScanner)

  container
    .bind<ChecksumService>(TYPES.ChecksumService)
    .to(ChecksumService)

  container
    .bind<ChunkBuilder>(TYPES.ChunkBuilder)
    .to(ChunkBuilder)

  container
    .bind<EdgeBuilder>(TYPES.EdgeBuilder)
    .to(EdgeBuilder)

  container
    .bind<ProjectMapBuilder>(TYPES.ProjectMapBuilder)
    .to(ProjectMapBuilder)

  container
    .bind<IIndexer>(TYPES.IIndexer)
    .to(CodebaseIndexer)

  // BM25 retrieval
  container
    .bind<ITokenizer>(TYPES.ITokenizer)
    .to(CodeTokenizer)

  container
    .bind<BM25IndexBuilder>(TYPES.BM25IndexBuilder)
    .to(BM25IndexBuilder)

  container
    .bind<BM25Retriever>(TYPES.BM25Retriever)
    .to(BM25Retriever)

  // Graph retrieval
  container
    .bind<GraphRetriever>(TYPES.GraphRetriever)
    .to(GraphRetriever)

  // Vector retrieval
  container
    .bind<IEmbeddingProvider>(TYPES.IEmbeddingProvider)
    .to(OllamaEmbeddingProvider)

  container
    .bind<VectorRetriever>(TYPES.VectorRetriever)
    .to(VectorRetriever)

  container
    .bind<EmbeddingIndexBuilder>(TYPES.EmbeddingIndexBuilder)
    .to(EmbeddingIndexBuilder)

  // Hybrid retrieval
  container
    .bind<HybridRetriever>(TYPES.HybridRetriever)
    .to(HybridRetriever)

  return container
}

/**
 * Resolves the default database path from config when no workspace is active.
 * Handles ~ expansion for cross-platform compatibility.
 */
function resolveDefaultDbPath(config: PathseekrConfig): string {
  const dataDir = config.storage.dataDir

  const resolvedDir = dataDir.startsWith('~')
    ? path.join(os.homedir(), dataDir.slice(1))
    : dataDir

  return path.join(resolvedDir, 'pathseekr.db')
}