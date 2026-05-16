import { describe, it, expect, beforeEach } from 'vitest'
import { Container } from 'inversify'
import Database from 'better-sqlite3'
import { DatabaseConnection } from '../../../../../src/storage/database'
import { EdgeBuilder } from '../../../../../src/retrieval/strategies/graph/edge-builder'
import { TYPES } from '../../../../../src/container/types'


function createTestContainer(): Container {
  const container = new Container({ defaultScope: 'Singleton' })

  container
    .bind<string>(TYPES.DatabasePath)
    .toConstantValue(':memory:')

  container
    .bind<DatabaseConnection>(TYPES.DatabaseConnection)
    .to(DatabaseConnection)

  container
    .bind<EdgeBuilder>(TYPES.EdgeBuilder)
    .to(EdgeBuilder)

  return container
}


function insertDocument(db: Database.Database, id: string): void {
  db.prepare(`
        INSERT INTO documents (
            id, source_path, source_type, document_type,
            language, name, checksum, size_bytes, chunk_count,
            job_id, created_at, updated_at
        ) VALUES (
            ?, ?, 'filesystem', 'code',
            'typescript', 'test.ts', ?, 1000, 0,
            'job-1', datetime('now'), datetime('now')
        )
    `).run(id, `/src/${id}.ts`, `checksum-${id}`)
}


interface ChunkInput {
  id: string
  documentId: string
  chunkType: string
  name: string
  metadata: Record<string, unknown>
}

function insertChunk(db: Database.Database, chunk: ChunkInput): void {
  db.prepare(`
        INSERT INTO chunks (
            id, document_id, content, chunk_type,
            language, name, start_line, end_line,
            metadata, created_at
        ) VALUES (
            ?, ?, '', ?,
            'typescript', ?, 1, 10,
            ?, datetime('now')
        )
    `).run(
    chunk.id,
    chunk.documentId,
    chunk.chunkType,
    chunk.name,
    JSON.stringify(chunk.metadata)
  )
}

interface RawEdge {
  from_chunk_id: string
  to_chunk_id: string | null
  to_name: string
  edge_type: string
  weight: number
  resolved: number
}

function getAllEdges(db: Database.Database): RawEdge[] {
  return db.prepare('SELECT * FROM edges').all() as RawEdge[]
}

function getEdgesByType(db: Database.Database, type: string): RawEdge[] {
  return db
    .prepare('SELECT * FROM edges WHERE edge_type = ?')
    .all(type) as RawEdge[]
}

describe('EdgeBuilder', () => {
  let container: Container
  let db: Database.Database
  let builder: EdgeBuilder

  beforeEach(() => {
    container = createTestContainer()
    const connection = container.get<DatabaseConnection>(TYPES.DatabaseConnection)
    db = connection.getDb()
    builder = container.get<EdgeBuilder>(TYPES.EdgeBuilder)
  })

  describe('contains edges', () => {
    it('creates a contains edge from class to each of its methods', () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'class-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'MyService',
        metadata: {},
      })
      insertChunk(db, {
        id: 'method-1',
        documentId: 'doc-1',
        chunkType: 'method',
        name: 'MyService.doWork',
        metadata: { parentName: 'MyService' },
      })
      insertChunk(db, {
        id: 'method-2',
        documentId: 'doc-1',
        chunkType: 'method',
        name: 'MyService.save',
        metadata: { parentName: 'MyService' },
      })

      builder.buildAll()

      expect(getEdgesByType(db, 'contains')).toHaveLength(2)
    })

    it('sets from_chunk_id to the class and to_chunk_id to the method', () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'class-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'MyService',
        metadata: {},
      })
      insertChunk(db, {
        id: 'method-1',
        documentId: 'doc-1',
        chunkType: 'method',
        name: 'MyService.doWork',
        metadata: { parentName: 'MyService' },
      })

      builder.buildAll()

      const edges = getEdgesByType(db, 'contains')
      expect(edges[0]!.from_chunk_id).toBe('class-1')
      expect(edges[0]!.to_chunk_id).toBe('method-1')
    })

    it('marks contains edges as resolved', () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'class-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'MyService',
        metadata: {},
      })
      insertChunk(db, {
        id: 'method-1',
        documentId: 'doc-1',
        chunkType: 'method',
        name: 'MyService.doWork',
        metadata: { parentName: 'MyService' },
      })

      builder.buildAll()

      expect(getEdgesByType(db, 'contains')[0]!.resolved).toBe(1)
    })

    it('does not create contains edges for methods with no matching class', () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'method-1',
        documentId: 'doc-1',
        chunkType: 'method',
        name: 'orphan.doWork',
        metadata: { parentName: 'NonExistentClass' },
      })

      builder.buildAll()

      expect(getEdgesByType(db, 'contains')).toHaveLength(0)
    })
  })

  describe('extends edges', () => {
    it('creates a resolved extends edge when parent class exists', () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'class-parent',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'BaseService',
        metadata: {},
      })
      insertChunk(db, {
        id: 'class-child',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'MyService',
        metadata: { extendsNames: ['BaseService'] },
      })

      builder.buildAll()

      const edges = getEdgesByType(db, 'extends')
      expect(edges).toHaveLength(1)
      expect(edges[0]!.resolved).toBe(1)
      expect(edges[0]!.from_chunk_id).toBe('class-child')
      expect(edges[0]!.to_chunk_id).toBe('class-parent')
    })

    it('creates an unresolved extends edge when parent does not exist in the index', () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'class-child',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'MyService',
        metadata: { extendsNames: ['ExternalBase'] },
      })

      builder.buildAll()

      const edges = getEdgesByType(db, 'extends')
      expect(edges).toHaveLength(1)
      expect(edges[0]!.resolved).toBe(0)
      expect(edges[0]!.to_chunk_id).toBeNull()
      expect(edges[0]!.to_name).toBe('ExternalBase')
    })

    it('creates an unresolved extends edge when the name is ambiguous across documents', () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')
      insertChunk(db, {
        id: 'base-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'BaseParser',
        metadata: {},
      })
      insertChunk(db, {
        id: 'base-2',
        documentId: 'doc-2',
        chunkType: 'class',
        name: 'BaseParser',
        metadata: {},
      })
      insertChunk(db, {
        id: 'child-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'TypeScriptParser',
        metadata: { extendsNames: ['BaseParser'] },
      })

      builder.buildAll()

      expect(getEdgesByType(db, 'extends')[0]!.resolved).toBe(0)
    })

    it('resolves extends edges across different documents', () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')
      insertChunk(db, {
        id: 'class-base',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'BaseService',
        metadata: {},
      })
      insertChunk(db, {
        id: 'class-child',
        documentId: 'doc-2',
        chunkType: 'class',
        name: 'MyService',
        metadata: { extendsNames: ['BaseService'] },
      })

      builder.buildAll()

      const edges = getEdgesByType(db, 'extends')
      expect(edges[0]!.resolved).toBe(1)
      expect(edges[0]!.to_chunk_id).toBe('class-base')
    })
  })

  describe('implements edges', () => {
    it('creates a resolved implements edge when the interface exists', () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'iface-1',
        documentId: 'doc-1',
        chunkType: 'interface',
        name: 'IRetriever',
        metadata: {},
      })
      insertChunk(db, {
        id: 'class-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'BM25Retriever',
        metadata: { implementsNames: ['IRetriever'] },
      })

      builder.buildAll()

      const edges = getEdgesByType(db, 'implements')
      expect(edges).toHaveLength(1)
      expect(edges[0]!.resolved).toBe(1)
      expect(edges[0]!.from_chunk_id).toBe('class-1')
      expect(edges[0]!.to_chunk_id).toBe('iface-1')
    })

    it('creates an unresolved implements edge when the interface does not exist', () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'class-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'BM25Retriever',
        metadata: { implementsNames: ['IRetriever'] },
      })

      builder.buildAll()

      const edges = getEdgesByType(db, 'implements')
      expect(edges).toHaveLength(1)
      expect(edges[0]!.resolved).toBe(0)
      expect(edges[0]!.to_chunk_id).toBeNull()
      expect(edges[0]!.to_name).toBe('IRetriever')
    })

    it('creates one edge per implemented interface', () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'iface-1',
        documentId: 'doc-1',
        chunkType: 'interface',
        name: 'IRetriever',
        metadata: {},
      })
      insertChunk(db, {
        id: 'iface-2',
        documentId: 'doc-1',
        chunkType: 'interface',
        name: 'ISearchable',
        metadata: {},
      })
      insertChunk(db, {
        id: 'class-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'BM25Retriever',
        metadata: { implementsNames: ['IRetriever', 'ISearchable'] },
      })

      builder.buildAll()

      const edges = getEdgesByType(db, 'implements')
      expect(edges).toHaveLength(2)
      expect(edges.every((e) => e.resolved === 1)).toBe(true)
    })
  })

  describe('buildAll', () => {
    it('produces no edges when there are no chunks', () => {
      builder.buildAll()

      expect(getAllEdges(db)).toHaveLength(0)
    })

    it('clears all existing edges before rebuilding to prevent duplicates', () => {
      insertDocument(db, 'doc-1')
      insertChunk(db, {
        id: 'class-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'MyService',
        metadata: {},
      })
      insertChunk(db, {
        id: 'method-1',
        documentId: 'doc-1',
        chunkType: 'method',
        name: 'MyService.doWork',
        metadata: { parentName: 'MyService' },
      })

      builder.buildAll()
      builder.buildAll()

      expect(getAllEdges(db)).toHaveLength(1)
    })

    it('builds edges across multiple documents', () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')
      insertChunk(db, {
        id: 'class-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'ServiceA',
        metadata: {},
      })
      insertChunk(db, {
        id: 'method-1',
        documentId: 'doc-1',
        chunkType: 'method',
        name: 'ServiceA.run',
        metadata: { parentName: 'ServiceA' },
      })
      insertChunk(db, {
        id: 'class-2',
        documentId: 'doc-2',
        chunkType: 'class',
        name: 'ServiceB',
        metadata: {},
      })
      insertChunk(db, {
        id: 'method-2',
        documentId: 'doc-2',
        chunkType: 'method',
        name: 'ServiceB.run',
        metadata: { parentName: 'ServiceB' },
      })

      builder.buildAll()

      expect(getEdgesByType(db, 'contains')).toHaveLength(2)
    })
  })

  describe('buildForDocument', () => {
    it('only builds edges for chunks belonging to the specified document', () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')
      insertChunk(db, {
        id: 'class-1',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'ServiceA',
        metadata: {},
      })
      insertChunk(db, {
        id: 'method-1',
        documentId: 'doc-1',
        chunkType: 'method',
        name: 'ServiceA.run',
        metadata: { parentName: 'ServiceA' },
      })
      insertChunk(db, {
        id: 'class-2',
        documentId: 'doc-2',
        chunkType: 'class',
        name: 'ServiceB',
        metadata: {},
      })
      insertChunk(db, {
        id: 'method-2',
        documentId: 'doc-2',
        chunkType: 'method',
        name: 'ServiceB.run',
        metadata: { parentName: 'ServiceB' },
      })

      builder.buildForDocument('doc-1')

      const edges = getAllEdges(db)
      expect(edges).toHaveLength(1)
      expect(edges[0]!.from_chunk_id).toBe('class-1')
    })

    it('resolves extends edges against chunks from all documents not just the target', () => {
      insertDocument(db, 'doc-1')
      insertDocument(db, 'doc-2')
      insertChunk(db, {
        id: 'class-base',
        documentId: 'doc-1',
        chunkType: 'class',
        name: 'BaseService',
        metadata: {},
      })
      insertChunk(db, {
        id: 'class-child',
        documentId: 'doc-2',
        chunkType: 'class',
        name: 'MyService',
        metadata: { extendsNames: ['BaseService'] },
      })

      builder.buildForDocument('doc-2')

      const edges = getEdgesByType(db, 'extends')
      expect(edges[0]!.resolved).toBe(1)
      expect(edges[0]!.to_chunk_id).toBe('class-base')
    })
  })
})