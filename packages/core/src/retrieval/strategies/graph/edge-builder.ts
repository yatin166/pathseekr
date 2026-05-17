import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import { randomUUID } from 'crypto'
import { EdgeQueries, type EdgeType } from './edge-queries'
import { TYPES } from "../../../container/types";
import { DatabaseConnection } from "../../../storage/database";
import { RetrievalQueries } from '../../shared/retrieval-queries'

interface RawContainsPair {
    class_chunk_id: string
    method_chunk_id: string
    method_name: string
}

interface RawClassChunk {
    id: string
    name: string
    metadata: string
}

interface EdgeParams {
    id: string
    fromChunkId: string
    toChunkId: string | null
    toName: string
    edgeType: EdgeType
    weight: number
    resolved: number
}


@injectable()
export class EdgeBuilder {

    private readonly WEIGHTS: Record<EdgeType, number> = {
        contains: 1.0,
        extends: 0.9,
        implements: 0.85,
        calls: 0.6,
    }

    constructor(
        @inject(TYPES.DatabaseConnection)
        private readonly connection: DatabaseConnection,
    ) {}

    buildForDocument(documentId: string): void {
        const db = this.connection.getDb()
        db.prepare(EdgeQueries.DELETE_BY_DOCUMENT).run(documentId)

        const nameMap = this.buildNameMap()
        const insert  = db.prepare(EdgeQueries.INSERT)

        db.transaction(() => {
            // Contains: class → method
            const pairs = db
                .prepare(EdgeQueries.CONTAINS_PAIRS_FOR_DOCUMENT)
                .all(documentId) as RawContainsPair[]

            for (const pair of pairs) {
                insert.run(this.edge(
                    pair.class_chunk_id,
                    pair.method_chunk_id,
                    pair.method_name,
                    'contains',
                    true,
                ))
            }

            // Extends + implements
            const classChunks = db
                .prepare(EdgeQueries.CLASS_CHUNKS_WITH_HERITAGE_FOR_DOCUMENT)
                .all(documentId) as RawClassChunk[]

            this.buildHeritageEdges(classChunks, nameMap)
        })()

        this.buildCallEdges(documentId)
    }

    buildAll(): void {
        const db = this.connection.getDb()
        db.prepare(EdgeQueries.DELETE_ALL).run()

        const nameMap = this.buildNameMap()
        const insert  = db.prepare(EdgeQueries.INSERT)

        db.transaction(() => {
            const pairs = db
                .prepare(EdgeQueries.CONTAINS_PAIRS)
                .all() as RawContainsPair[]

            for (const pair of pairs) {
                insert.run(this.edge(
                    pair.class_chunk_id,
                    pair.method_chunk_id,
                    pair.method_name,
                    'contains',
                    true,
                ))
            }

            const classChunks = db
                .prepare(EdgeQueries.CLASS_CHUNKS_WITH_HERITAGE)
                .all() as RawClassChunk[]

            this.buildHeritageEdges(classChunks, nameMap)
        })()

        this.buildCallEdges()
    }

    private buildHeritageEdges(classChunks: RawClassChunk[], nameMap: Map<string, string[]>): void {
        const db = this.connection.getDb()
        for (const chunk of classChunks) {
            const metadata = JSON.parse(chunk.metadata) as {
                extendsNames?:    string[]
                implementsNames?: string[]
            }

            for (const name of metadata.extendsNames ?? []) {
                db.prepare(EdgeQueries.INSERT).run(this.resolve(chunk.id, name, 'extends', nameMap))
            }

            for (const name of metadata.implementsNames ?? []) {
                db.prepare(EdgeQueries.INSERT).run(this.resolve(chunk.id, name, 'implements', nameMap))
            }
        }
    }

    private buildNameMap(): Map<string, string[]> {
        const db = this.connection.getDb()
        const rows = db
            .prepare(`SELECT id, name FROM chunks WHERE chunk_type IN ('class', 'interface')`)
            .all() as { id: string; name: string }[]

        const map = new Map<string, string[]>()
        for (const row of rows) {
            const ids = map.get(row.name) ?? []
            ids.push(row.id)
            map.set(row.name, ids)
        }
        return map
    }

    private resolve(
        fromChunkId: string,
        toName: string,
        edgeType: EdgeType,
        nameMap: Map<string, string[]>,
    ): EdgeParams {
        const matches = nameMap.get(toName) ?? []
        const resolved = matches.length === 1
        return this.edge(
            fromChunkId,
            resolved ? (matches[0] ?? null) : null,
            toName,
            edgeType,
            resolved,
        )
    }

    private edge(
        fromChunkId: string,
        toChunkId: string | null,
        toName: string,
        edgeType: EdgeType,
        resolved: boolean,
    ): EdgeParams {
        return {
            id: randomUUID(),
            fromChunkId,
            toChunkId,
            toName,
            edgeType,
            weight: this.WEIGHTS[edgeType],
            resolved: resolved ? 1 : 0,
        }
    }

    private buildCallEdges(documentId?: string): void {
        const db = this.connection.getDb()

        const allCallable = db
            .prepare(`
                  SELECT id, name
                  FROM chunks
                  WHERE chunk_type IN ('function', 'method')
              `)
            .all() as Array<{ id: string; name: string }>

        const nameToId = new Map<string, string>()
        const ambiguous = new Set<string>()

        for (const chunk of allCallable) {
            const shortName = chunk.name.includes('.')
                ? chunk.name.split('.').pop()!
                : chunk.name

            if (shortName.length < 4) {
                continue
            }

            if (nameToId.has(shortName)) {
                ambiguous.add(shortName)
            } else {
                nameToId.set(shortName, chunk.id)
            }
        }

        for (const name of ambiguous) {
            nameToId.delete(name)
        }

        if (nameToId.size === 0) {
            return
        }

        const sourceChunks = (
            documentId !== undefined
                ? db.prepare(RetrievalQueries.CHUNKS_BY_FUNCTION_OR_METHOD_AND_DOCUMENT).all(documentId)
                : db.prepare(RetrievalQueries.CHUNKS_BY_FUNCTION_OR_METHOD).all()
        ) as Array<{ id: string; name: string; content: string }>

        const insert = db.prepare(EdgeQueries.INSERT)

        db.transaction(() => {
            for (const source of sourceChunks) {
                for (const [name, targetId] of nameToId) {
                    if (targetId === source.id) {
                        continue
                    }

                    const regex = new RegExp(`\\b${name}\\b`)

                    if (regex.test(source.content)) {
                        insert.run(this.edge(
                            source.id,
                            targetId,
                            name,
                            'calls',
                            true,
                        ))
                    }
                }
            }
        })()
    }
}