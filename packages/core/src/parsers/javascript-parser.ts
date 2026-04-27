import 'reflect-metadata'
import Parser from 'tree-sitter'
import { injectable } from 'inversify'
const JSLanguage = require('tree-sitter-javascript')
import type { Language } from '@spyglass/shared'
import {BaseParser, type ExtractedNode, TreeSitterLanguage,} from './base/base-parser'

const JS_NODE_TYPES = {
    // Top level
    FUNCTION_DECLARATION: 'function_declaration',
    CLASS_DECLARATION: 'class_declaration',
    GENERATOR_FUNCTION: 'generator_function_declaration',

    // Inside classes
    METHOD_DEFINITION: 'method_definition',

    // Variable declarations containing arrow functions
    LEXICAL_DECLARATION: 'lexical_declaration',
    VARIABLE_DECLARATION: 'variable_declaration',
    VARIABLE_DECLARATOR: 'variable_declarator',

    // Function variants
    ARROW_FUNCTION: 'arrow_function',
    FUNCTION_EXPRESSION: 'function_expression',

    // Export wrapper
    EXPORT_STATEMENT: 'export_statement',

    // Async keyword
    ASYNC: 'async',
} as const

@injectable()
export class JavaScriptParser extends BaseParser {
    readonly supportedExtensions = ['.js', '.jsx', '.mjs', '.cjs'] as const
    protected readonly language = JSLanguage as TreeSitterLanguage
    protected readonly languageId: Language = 'javascript'

    protected extractNodes(rootNode: Parser.SyntaxNode, content: string, lines: string[]): ExtractedNode[] {
        const extracted: ExtractedNode[] = []

        this.walk(rootNode, (node) => {
            const target = this.unwrapExport(node)

            switch (target.type) {
                case JS_NODE_TYPES.FUNCTION_DECLARATION:
                case JS_NODE_TYPES.GENERATOR_FUNCTION:
                    extracted.push(
                        ...this.extractFunction(target, node, content, lines)
                    )
                    return false

                case JS_NODE_TYPES.CLASS_DECLARATION:
                    extracted.push(
                        ...this.extractClass(target, node, content, lines)
                    )
                    return false

                case JS_NODE_TYPES.LEXICAL_DECLARATION:
                case JS_NODE_TYPES.VARIABLE_DECLARATION:
                    extracted.push(
                        ...this.extractArrowFunctions(
                            target,
                            node,
                            content,
                            lines
                        )
                    )
                    return false

                default:
                    return undefined
            }
        })

        return extracted
    }

    private extractFunction(
        node: Parser.SyntaxNode,
        originalNode: Parser.SyntaxNode,
        content: string,
        lines: string[]
    ): ExtractedNode[] {
        const name = this.getFieldText(node, 'name', content)
        if (!name) {
            return []
        }

        const isAsync = this.hasAsyncKeyword(node)
        const isExported = this.isExported(originalNode)
        const docstring = this.extractDocstring(originalNode, lines)
        const signature = this.buildSignature(node, content)
        const parameters = this.extractParameters(node, content)

        return [
            {
                name,
                content: this.getNodeText(originalNode, content),
                chunkType: 'function',
                startLine: this.getStartLine(originalNode),
                endLine: this.getEndLine(originalNode),
                metadata: {
                    signature,
                    isAsync,
                    isExported,
                    parameters,
                    ...(docstring !== undefined && { docstring }),
                },
            },
        ]
    }

    private extractClass(
        node: Parser.SyntaxNode,
        originalNode: Parser.SyntaxNode,
        content: string,
        lines: string[]
    ): ExtractedNode[] {
        const name = this.getFieldText(node, 'name', content)
        if (!name) {
            return []
        }

        const isExported = this.isExported(originalNode)
        const docstring = this.extractDocstring(originalNode, lines)
        const results: ExtractedNode[] = []

        results.push({
            name,
            content: this.getNodeText(originalNode, content),
            chunkType: 'class',
            startLine: this.getStartLine(originalNode),
            endLine: this.getEndLine(originalNode),
            metadata: {
                isExported,
                ...(docstring !== undefined && { docstring }),
            },
        })

        const body = this.getChildByField(node, 'body')
        if (body) {
            for (let i = 0; i < body.childCount; i++) {
                const child = body.child(i)
                if (
                    child &&
                    child.type === JS_NODE_TYPES.METHOD_DEFINITION
                ) {
                    const method = this.extractMethod(
                        child,
                        name,
                        content,
                        lines
                    )
                    if (method) results.push(method)
                }
            }
        }

        return results
    }

    private extractMethod(
        node: Parser.SyntaxNode,
        parentClassName: string,
        content: string,
        lines: string[]
    ): ExtractedNode | null {
        const name = this.getFieldText(node, 'name', content)
        if (!name) {
            return null
        }

        if (name.startsWith('#') || name.startsWith('_')) {
            return null
        }

        const isAsync = this.hasAsyncKeyword(node)
        const docstring = this.extractDocstring(node, lines)
        const signature = this.buildSignature(node, content)
        const parameters = this.extractParameters(node, content)

        return {
            name: `${parentClassName}.${name}`,
            content: this.getNodeText(node, content),
            chunkType: 'method',
            startLine: this.getStartLine(node),
            endLine: this.getEndLine(node),
            metadata: {
                signature,
                isAsync,
                parentName: parentClassName,
                parameters,
                ...(docstring !== undefined && { docstring }),
            },
        }
    }

    private extractArrowFunctions(
        node: Parser.SyntaxNode,
        originalNode: Parser.SyntaxNode,
        content: string,
        lines: string[]
    ): ExtractedNode[] {
        const results: ExtractedNode[] = []

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (!child) continue

            if (child.type === JS_NODE_TYPES.VARIABLE_DECLARATOR) {
                const valueNode = this.getChildByField(child, 'value')
                if (!valueNode) continue

                const isArrow =
                    valueNode.type === JS_NODE_TYPES.ARROW_FUNCTION
                const isFuncExpr =
                    valueNode.type === JS_NODE_TYPES.FUNCTION_EXPRESSION

                if (isArrow || isFuncExpr) {
                    const name = this.getFieldText(child, 'name', content)
                    if (!name) continue

                    const isAsync = this.hasAsyncKeyword(valueNode)
                    const isExported = this.isExported(originalNode)
                    const docstring = this.extractDocstring(
                        originalNode,
                        lines
                    )
                    const parameters = this.extractParameters(
                        valueNode,
                        content
                    )

                    results.push({
                        name,
                        content: this.getNodeText(originalNode, content),
                        chunkType: 'function',
                        startLine: this.getStartLine(originalNode),
                        endLine: this.getEndLine(originalNode),
                        metadata: {
                            isAsync,
                            isExported,
                            parameters,
                            ...(docstring !== undefined && { docstring }),
                        },
                    })
                }
            }
        }

        return results
    }

    private buildSignature(node: Parser.SyntaxNode, content: string): string {
        const name = this.getFieldText(node, 'name', content)
        const params = this.getChildByField(node, 'parameters')
        const isAsync = this.hasAsyncKeyword(node)
        const asyncPrefix = isAsync ? 'async ' : ''
        const paramsText = params
            ? this.getNodeText(params, content)
            : '()'

        return `${asyncPrefix}${name ?? 'anonymous'}${paramsText}`.trim()
    }

    private hasAsyncKeyword(node: Parser.SyntaxNode): boolean {
        for (let i = 0; i < node.childCount; i++) {
            if (node.child(i)?.type === JS_NODE_TYPES.ASYNC) {
                return true
            }
        }
        return false
    }

    private extractParameters(node: Parser.SyntaxNode, content: string): string[] {
        const params = this.getChildByField(node, 'parameters')
        if (!params) {
            return []
        }

        const paramNames: string[] = []

        for (let i = 0; i < params.childCount; i++) {
            const param = params.child(i)
            if (!param || !param.isNamed) continue
            if (param.type === ',' || param.type === 'comment') continue

            const nameNode =
                param.childForFieldName('pattern') ??
                param.childForFieldName('name') ??
                param

            paramNames.push(this.getNodeText(nameNode, content))
        }

        return paramNames
    }

    private unwrapExport(node: Parser.SyntaxNode): Parser.SyntaxNode {
        if (node.type !== JS_NODE_TYPES.EXPORT_STATEMENT) {
            return node
        }
        for (let i = node.childCount - 1; i >= 0; i--) {
            const child = node.child(i)
            if (child && child.isNamed) return child
        }
        return node
    }
}