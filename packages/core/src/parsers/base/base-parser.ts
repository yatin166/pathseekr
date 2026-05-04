import 'reflect-metadata'
import Parser from 'tree-sitter'
import { injectable } from 'inversify'
import { randomUUID } from 'crypto'
import type { Chunk, ChunkMetadata, ChunkType, Language } from '@spyglass/shared'
import type { IDocumentParser, ParseResult } from '../../interfaces/document-parser.interface'

export type TreeSitterLanguage = Parameters<Parser['setLanguage']>[0]

export interface ExtractedNode {
    name: string
    content: string
    chunkType: ChunkType
    startLine: number
    endLine: number
    metadata: ChunkMetadata
}

export interface ClassSummaryParams {
    readonly name: string
    readonly methods: ExtractedNode[]
    readonly fields: string[]
    readonly extendsClause?: string
    readonly implementsClause?: string
    readonly accessModifier?: string
}

@injectable()
export abstract class BaseParser implements IDocumentParser {

    abstract readonly supportedExtensions: readonly string[]
    protected abstract readonly language: TreeSitterLanguage
    protected abstract readonly languageId: Language
    private parser: Parser | null = null

    supports(filePath: string): boolean {
        const ext = this.getExtension(filePath)
        return this.supportedExtensions.includes(ext)
    }

    async parse(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _filePath: string,
        content: string
    ): Promise<ParseResult> {
        const parser = this.getParser()
        const tree = parser.parse(content)
        const lines = content.split('\n')

        const extracted = this.extractNodes(tree.rootNode, content, lines)

        const chunks = extracted.map((node) =>
            this.buildChunk(node)
        )

        return {
            chunks,
            language: this.languageId,
            totalLines: lines.length,
        }
    }

    protected abstract extractNodes(rootNode: Parser.SyntaxNode, content: string, lines: string[]): ExtractedNode[]

    protected getParser(): Parser {
        if (!this.parser) {
            this.parser = new Parser()
            this.parser.setLanguage(this.language)
        }
        return this.parser
    }

    protected getNodeText(
        node: Parser.SyntaxNode,
        content: string
    ): string {
        return content.slice(node.startIndex, node.endIndex)
    }

    protected getStartLine(node: Parser.SyntaxNode): number {
        return node.startPosition.row + 1
    }

    protected getEndLine(node: Parser.SyntaxNode): number {
        return node.endPosition.row + 1
    }

    protected getChildByField(node: Parser.SyntaxNode, fieldName: string): Parser.SyntaxNode | null {
        return node.childForFieldName(fieldName)
    }

    protected getFieldText(node: Parser.SyntaxNode, fieldName: string, content: string): string | undefined {
        const child = this.getChildByField(node, fieldName)
        return child ? this.getNodeText(child, content) : undefined
    }

    protected extractDocstring(node: Parser.SyntaxNode, lines: string[]): string | undefined {
        const startLine = node.startPosition.row
        let commentEnd = startLine - 1

        while (
            commentEnd >= 0 &&
            lines[commentEnd]?.trim() === ''
            ) {
            commentEnd--
        }

        if (commentEnd < 0) {
            return undefined
        }

        const lastLine = lines[commentEnd]?.trim() ?? ''

        if (lastLine.endsWith('*/')) {
            let commentStart = commentEnd
            while (
                commentStart > 0 &&
                !lines[commentStart]?.trim().startsWith('/*')
                ) {
                commentStart--
            }

            const commentLines = lines.slice(commentStart, commentEnd + 1)
            return commentLines.join('\n').trim()
        }

        if (lastLine.startsWith('//')) {
            return lastLine
        }

        return undefined
    }

    protected isExported(node: Parser.SyntaxNode): boolean {
        if (node.type === 'export_statement') {
            return true
        }

        const parent = node.parent
        if (!parent) return false

        if (parent.type === 'export_statement') {
            return true
        }

        for (let i = 0; i < parent.childCount; i++) {
            const child = parent.child(i)
            if (child?.type === 'export') {
                return true
            }
        }

        return false
    }

    protected walk(node: Parser.SyntaxNode, visitor: (node: Parser.SyntaxNode) => boolean | void): void {
        const shouldContinue = visitor(node)
        if (shouldContinue === false) return

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (child) {
                this.walk(child, visitor)
            }
        }
    }

    private buildChunk(extracted: ExtractedNode): Chunk {
        return {
            id: randomUUID(),
            documentId: '',
            content: extracted.content,
            chunkType: extracted.chunkType,
            language: this.languageId,
            name: extracted.name,
            startLine: extracted.startLine,
            endLine: extracted.endLine,
            metadata: extracted.metadata,
            createdAt: new Date(),
        }
    }

    /*
    * Builds a structural summary for a class chunk.
    * Stores the class declaration, fields, and method signatures only.
    * Full method implementations are stored in individual method chunks.
    * This eliminates duplicate content and improves embedding quality.
    */
    protected buildClassSummary(params: ClassSummaryParams): string {
        const lines: string[] = []

        // Class declaration line
        const declaration = this.buildDeclarationLine(params)
        lines.push(`${declaration} {`)

        // Class-level fields
        if (params.fields.length > 0) {
            lines.push('')
            for (const field of params.fields) {
                lines.push(`  ${field}`)
            }
        }

        // Method signatures as comments
        // Full implementations live in individual method chunks
        if (params.methods.length > 0) {
            lines.push('')
            for (const method of params.methods) {
                const sig = method.metadata.signature ?? method.name
                lines.push(`  // ${sig}`)
            }
        }

        lines.push('}')

        return lines.join('\n')
    }

    private buildDeclarationLine(params: ClassSummaryParams): string {
        const parts: string[] = []

        if (params.accessModifier !== undefined) {
            parts.push(params.accessModifier)
        }

        parts.push(`class ${params.name}`)

        if (params.extendsClause !== undefined) {
            parts.push(`extends ${params.extendsClause}`)
        }

        if (params.implementsClause !== undefined) {
            parts.push(`implements ${params.implementsClause}`)
        }

        return parts.join(' ')
    }

    private getExtension(filePath: string): string {
        const parts = filePath.split('.')
        return parts.length > 1 ? `.${parts[parts.length - 1]}` : ''
    }
}