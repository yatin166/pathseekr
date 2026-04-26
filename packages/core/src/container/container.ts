import 'reflect-metadata'

import { Container } from 'inversify'

/*import { OllamaEmbeddingProvider } from '../providers/embedding/OllamaEmbeddingProvider'
import { OllamaLLMProvider } from '../providers/llm/OllamaLLMProvider'
import { ChunkRepository } from '../storage/ChunkRepository'
import { DocumentRepository } from '../storage/DocumentRepository'
import { CodebaseIndexer } from '../indexer/CodebaseIndexer'
import { ParserRegistry } from '../parsers/ParserRegistry'
import { BM25Retriever } from '../retrieval/BM25Retriever'
import { VectorRetriever } from '../retrieval/VectorRetriever'
import { HybridRetriever } from '../retrieval/HybridRetriever'
import type { IEmbeddingProvider } from '../interfaces/IEmbeddingProvider'
import type { ILLMProvider } from '../interfaces/ILLMProvider'
import type { IChunkRepository } from '../interfaces/IChunkRepository'
import type { IDocumentRepository } from '../interfaces/IDocumentRepository'
import type { IIndexer } from '../interfaces/IIndexer'*/
import type { SpyglassConfig } from '@spyglass/shared'
import { TYPES } from './types'
import {DatabaseConnection} from "../storage/database";
import {IChunkRepository} from "../interfaces/IChunkRepository";
import {ChunkRepository} from "../storage/ChunkRepository";
import {IDocumentRepository} from "../interfaces/IDocumentRepository";
import {DocumentRepository} from "../storage/DocumentRepository";

export function createContainer(config: SpyglassConfig): Container {
    const container = new Container({ defaultScope: 'Singleton' })

    container
        .bind<SpyglassConfig>(TYPES.SpyglassConfig)
        .toConstantValue(config)

    container
        .bind<DatabaseConnection>(TYPES.DatabaseConnection)
        .to(DatabaseConnection)

    /*container
        .bind<IEmbeddingProvider>(TYPES.IEmbeddingProvider)
        .to(OllamaEmbeddingProvider)

    container
        .bind<ILLMProvider>(TYPES.ILLMProvider)
        .to(OllamaLLMProvider)*/

    container
        .bind<IChunkRepository>(TYPES.IChunkRepository)
        .to(ChunkRepository)

    container
        .bind<IDocumentRepository>(TYPES.IDocumentRepository)
        .to(DocumentRepository)

    /*container
        .bind<ParserRegistry>(TYPES.ParserRegistry)
        .to(ParserRegistry)

    container
        .bind<BM25Retriever>(TYPES.BM25Retriever)
        .to(BM25Retriever)

    container
        .bind<VectorRetriever>(TYPES.VectorRetriever)
        .to(VectorRetriever)

    container
        .bind<HybridRetriever>(TYPES.HybridRetriever)
        .to(HybridRetriever)

    container
        .bind<IIndexer>(TYPES.IIndexer)
        .to(CodebaseIndexer)*/

    return container
}