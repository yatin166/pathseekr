export type Language = | 'typescript' | 'javascript' | 'python' | 'java' | 'unknown'

export type ChunkType =
    | 'function'
    | 'method'
    | 'class'
    | 'interface'
    | 'type'
    | 'struct'
    | 'enum'
    | 'trait'
    | 'impl'
    | 'module'
    | 'paragraph'

export interface Chunk {
    readonly id: string;
    readonly documentId: string;
    readonly content: string;
    readonly chunkType: ChunkType;
    readonly language: Language;
    readonly name: string;
    readonly startLine: number;
    readonly endLine: number;
    readonly metadata: ChunkMetadata;
    readonly createdAt: Date;
    readonly breadcrumb?: string;
}

export interface ChunkMetadata {
    readonly signature?: string;
    readonly docstring?: string;
    readonly parentName?: string;
    readonly isExported?: boolean;
    readonly isAsync?: boolean;
    readonly parameters?: string[];
    readonly returnType?: string;
    readonly extendsNames?: string[];
    readonly implementsNames?: string[];
}

export interface StoredChunk extends Chunk {
    readonly embedding?: number[]
}