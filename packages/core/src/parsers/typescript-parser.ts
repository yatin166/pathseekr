import 'reflect-metadata'

import { injectable } from 'inversify'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TSLanguage = require('tree-sitter-typescript').typescript

import type { Language } from '@spyglass/shared'
import {
    BaseParser,
    type ExtractedNode, TreeSitterLanguage,
} from './base/base-parser'
import Parser from 'tree-sitter'


const TS_NODE_TYPES = {
    FUNCTION_DECLARATION: 'function_declaration',
    CLASS_DECLARATION: 'class_declaration',
    INTERFACE_DECLARATION: 'interface_declaration',
    TYPE_ALIAS: 'type_alias_declaration',
    ENUM_DECLARATION: 'enum_declaration',
    METHOD_DEFINITION: 'method_definition',
    PUBLIC_FIELD: 'public_field_definition',
    LEXICAL_DECLARATION: 'lexical_declaration',
    VARIABLE_DECLARATION: 'variable_declaration',
    VARIABLE_DECLARATOR: 'variable_declarator',
    ARROW_FUNCTION: 'arrow_function',
    FUNCTION_EXPRESSION: 'function_expression',
    EXPORT_STATEMENT: 'export_statement',
    ASYNC: 'async',
} as const

@injectable()
export class TypeScriptParser extends BaseParser {
    readonly supportedExtensions = ['.ts', '.tsx'] as const
    protected readonly language = TSLanguage as TreeSitterLanguage
    protected readonly languageId: Language = 'typescript'

    protected extractNodes(
        rootNode: Parser.SyntaxNode,
        content: string,
        lines: string[]
    ): ExtractedNode[] {
        const extracted: ExtractedNode[] = []

        this.walk(rootNode, (node) => {
            const target = this.unwrapExport(node)

            switch (target.type) {
                case TS_NODE_TYPES.FUNCTION_DECLARATION:
                    extracted.push(
                        ...this.extractFunction(target, node, content, lines)
                    )
                    return false

                case TS_NODE_TYPES.CLASS_DECLARATION:
                    extracted.push(
                        ...this.extractClass(target, node, content, lines)
                    )
                    return false

                case TS_NODE_TYPES.INTERFACE_DECLARATION:
                    extracted.push(
                        ...this.extractInterface(target, node, content, lines)
                    )
                    return false

                case TS_NODE_TYPES.TYPE_ALIAS:
                    extracted.push(
                        ...this.extractTypeAlias(target, node, content)
                    )
                    return false

                case TS_NODE_TYPES.LEXICAL_DECLARATION:
                case TS_NODE_TYPES.VARIABLE_DECLARATION:
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
        const signature = this.extractFunctionSignature(node, content)
        const parameters = this.extractParameters(node, content)
        const returnType = this.extractReturnType(node, content)

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
                    ...(returnType !== undefined && { returnType }),
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
                    child.type === TS_NODE_TYPES.METHOD_DEFINITION
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
        if (!name) return null
        if (name.startsWith('#') || name.startsWith('_')) return null

        const isAsync = this.hasAsyncKeyword(node)
        const docstring = this.extractDocstring(node, lines)
        const signature = this.extractFunctionSignature(node, content)
        const parameters = this.extractParameters(node, content)
        const returnType = this.extractReturnType(node, content)

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
                ...(returnType !== undefined && { returnType }),
            },
        }
    }

    private extractInterface(
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

        return [
            {
                name,
                content: this.getNodeText(originalNode, content),
                chunkType: 'interface',
                startLine: this.getStartLine(originalNode),
                endLine: this.getEndLine(originalNode),
                metadata: {
                    isExported,
                    ...(docstring !== undefined && { docstring }),
                },
            },
        ]
    }

    private extractTypeAlias(
        node: Parser.SyntaxNode,
        originalNode: Parser.SyntaxNode,
        content: string
    ): ExtractedNode[] {
        const name = this.getFieldText(node, 'name', content)
        if (!name) {
            return []
        }

        const isExported = this.isExported(originalNode)

        return [
            {
                name,
                content: this.getNodeText(originalNode, content),
                chunkType: 'type',
                startLine: this.getStartLine(originalNode),
                endLine: this.getEndLine(originalNode),
                metadata: {
                    isExported,
                },
            },
        ]
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

            if (child.type === TS_NODE_TYPES.VARIABLE_DECLARATOR) {
                const valueNode = this.getChildByField(child, 'value')
                if (!valueNode) continue

                const isArrow =
                    valueNode.type === TS_NODE_TYPES.ARROW_FUNCTION
                const isFuncExpr =
                    valueNode.type === TS_NODE_TYPES.FUNCTION_EXPRESSION

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
                    const returnType = this.extractReturnType(
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
                            ...(returnType !== undefined && { returnType }),
                        },
                    })
                }
            }
        }

        return results
    }

    private unwrapExport(
        node: Parser.SyntaxNode
    ): Parser.SyntaxNode {
        if (node.type !== TS_NODE_TYPES.EXPORT_STATEMENT) {
            return node
        }
        for (let i = node.childCount - 1; i >= 0; i--) {
            const child = node.child(i)
            if (child && child.isNamed) return child
        }
        return node
    }

    private hasAsyncKeyword(node: Parser.SyntaxNode): boolean {
        for (let i = 0; i < node.childCount; i++) {
            if (node.child(i)?.type === TS_NODE_TYPES.ASYNC) {
                return true
            }
        }
        return false
    }

    private extractFunctionSignature(
        node: Parser.SyntaxNode,
        content: string
    ): string {
        const params = this.getChildByField(node, 'parameters')
        const returnType = this.getChildByField(node, 'return_type')
        const name = this.getFieldText(node, 'name', content)
        const isAsync = this.hasAsyncKeyword(node)
        const asyncPrefix = isAsync ? 'async ' : ''
        const paramsText = params
            ? this.getNodeText(params, content)
            : '()'
        const returnText = returnType
            ? this.getNodeText(returnType, content)
            : ''

        return `${asyncPrefix}${name ?? 'anonymous'}${paramsText}${returnText}`.trim()
    }

    private extractParameters(
        node: Parser.SyntaxNode,
        content: string
    ): string[] {
        const params = this.getChildByField(node, 'parameters')
        if (!params) {
            return []
        }

        const paramNames: string[] = []

        for (let i = 0; i < params.childCount; i++) {
            const param = params.child(i)
            if (!param || !param.isNamed) {
                continue
            }
            if (param.type === ',' || param.type === 'comment') {
                continue
            }

            const nameNode =
                param.childForFieldName('pattern') ??
                param.childForFieldName('name') ??
                param

            paramNames.push(this.getNodeText(nameNode, content))
        }

        return paramNames
    }

    private extractReturnType(
        node: Parser.SyntaxNode,
        content: string
    ): string | undefined {
        const returnType = this.getChildByField(node, 'return_type')
        if (!returnType) return undefined
        return this.getNodeText(returnType, content)
            .replace(/^:\s*/, '')
            .trim()
    }
}