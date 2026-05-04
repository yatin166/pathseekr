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

export interface ClassDeclaration {
    readonly name: string
    readonly extendsClause?: string
    readonly implementsClause?: string
    readonly accessModifier?: string
    readonly fields: readonly string[]
    readonly methods: readonly ExtractedNode[]
    readonly docstring?: string
    readonly bodyStyle: 'brace' | 'colon'
    readonly commentPrefix: '//' | '#'
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
    protected buildClassSummary(declaration: ClassDeclaration): string {
        const lines: string[] = []

        // Declaration line
        const declarationLine = this.buildDeclarationLine(declaration)
        lines.push(declarationLine)

        // Docstring — Python puts it first inside the class body
        if (declaration.docstring !== undefined && declaration.bodyStyle === 'colon') {
            lines.push(`    """${declaration.docstring}"""`)
        }

        // Fields
        if (declaration.fields.length > 0) {
            lines.push('')
            for (const field of declaration.fields) {
                const indent =
                    declaration.bodyStyle === 'brace' ? '  ' : '    '
                lines.push(`${indent}${field}`)
            }
        }

        // Method signatures
        if (declaration.methods.length > 0) {
            lines.push('')
            for (const method of declaration.methods) {
                const sig = this.compressSignature(method.metadata.signature ?? method.name)
                const indent = declaration.bodyStyle === 'brace' ? '  ' : '    '
                lines.push(`${indent}${declaration.commentPrefix} ${sig}`)
            }
        }

        // Closing brace for brace-style languages
        if (declaration.bodyStyle === 'brace') {
            lines.push('}')
        }

        return lines.join('\n')
    }

    private buildDeclarationLine(declaration: ClassDeclaration): string {
        const parts: string[] = []

        if (declaration.accessModifier !== undefined) {
            parts.push(declaration.accessModifier)
        }

        parts.push(`class ${declaration.name}`)

        if (declaration.extendsClause !== undefined) {
            if (declaration.bodyStyle === 'colon') {
                // Python: class Foo(BaseClass):
                // handled below in suffix
            } else {
                parts.push(`extends ${declaration.extendsClause}`)
            }
        }

        if (declaration.implementsClause !== undefined) {
            parts.push(`implements ${declaration.implementsClause}`)
        }

        const base = parts.join(' ')

        if (declaration.bodyStyle === 'colon') {
            // Python: class Foo(BaseClass): or class Foo:
            const bases = declaration.extendsClause
                ? `(${declaration.extendsClause})`
                : ''
            return `class ${declaration.name}${bases}:`
        }

        return `${base} {`
    }

    /*
    * Compresses a multi-line signature to a single readable line
    * extractFunction(
    *   node: Parser.SyntaxNode,
    *   content: string
    * ): string
    * becomes:
    * extractFunction(node: Parser.SyntaxNode, content: string): string
    */
    private compressSignature(signature: string): string {
        return signature
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .join(' ')
            .replace(/\(\s+/g, '(')
            .replace(/\s+\)/g, ')')
            .replace(/,\s+/g, ', ')
            .replace(/\s{2,}/g, ' ')
            .trim()
    }

    private getExtension(filePath: string): string {
        const parts = filePath.split('.')
        return parts.length > 1 ? `.${parts[parts.length - 1]}` : ''
    }
}