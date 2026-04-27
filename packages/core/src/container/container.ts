import 'reflect-metadata'
import { Container } from 'inversify'
import type { SpyglassConfig } from '@spyglass/shared'
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
import { ITokenizer } from "../retrieval/interfaces/tokenizer.interface";
import { CodeTokenizer } from "../retrieval/tokenizer/code-tokenizer";
import { BM25IndexBuilder } from "../retrieval/bm25-index-builder";
import { BM25Retriever } from "../retrieval/bm25-retriever";

export function createContainer(config: SpyglassConfig): Container {
    const container = new Container({ defaultScope: 'Singleton' })

    // Config
    container
        .bind<SpyglassConfig>(TYPES.SpyglassConfig)
        .toConstantValue(config)

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
        .bind<IIndexer>(TYPES.IIndexer)
        .to(CodebaseIndexer)

    // BM25 Retrieval components
    container
        .bind<ITokenizer>(TYPES.ITokenizer)
        .to(CodeTokenizer)

    container
        .bind<BM25IndexBuilder>(TYPES.BM25IndexBuilder)
        .to(BM25IndexBuilder)

    container
        .bind<BM25Retriever>(TYPES.BM25Retriever)
        .to(BM25Retriever)

    return container
}