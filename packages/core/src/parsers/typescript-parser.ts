import 'reflect-metadata'
import { injectable } from 'inversify'
const TSLanguage = require('tree-sitter-typescript').typescript
import type { Language } from '@spyglass/shared'
import {
    BaseParser,
    ClassDeclaration,
    type ExtractedNode,
    TreeSitterLanguage
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
    ABSTRACT_CLASS_DECLARATION: 'abstract_class_declaration',
} as const

@injectable()
export class TypeScriptParser extends BaseParser {
    readonly supportedExtensions = ['.ts', '.tsx'] as const
    protected readonly language = TSLanguage as TreeSitterLanguage
    protected readonly languageId: Language = 'typescript'

    protected extractNodes(rootNode: Parser.SyntaxNode, content: string, lines: string[]): ExtractedNode[] {
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
                case TS_NODE_TYPES.ABSTRACT_CLASS_DECLARATION:
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

    protected extractImports(rootNode: Parser.SyntaxNode, content: string): string[] {
        const imports: string[] = []

        for (let i = 0; i < rootNode.childCount; i++) {
            const node = rootNode.child(i)
            if (!node) continue

            // import x from './x'  |  import type { X } from './x'
            if (node.type === 'import_statement') {
                const source = node.childForFieldName('source')
                if (source) {
                    imports.push(this.stripQuotes(this.getNodeText(source, content)))
                }
                continue
            }

            // const x = require('./x')
            if (
                node.type === TS_NODE_TYPES.LEXICAL_DECLARATION ||
                node.type === TS_NODE_TYPES.VARIABLE_DECLARATION
            ) {
                for (let j = 0; j < node.childCount; j++) {
                    const declarator = node.child(j)
                    if (declarator?.type !== TS_NODE_TYPES.VARIABLE_DECLARATOR) continue
                    const value = declarator.childForFieldName('value')
                    if (value?.type === 'call_expression') {
                        const fn = value.childForFieldName('function')
                        if (fn && this.getNodeText(fn, content) === 'require') {
                            const args = value.childForFieldName('arguments')
                            const firstArg = args?.child(1)
                            if (firstArg?.type === 'string') {
                                imports.push(this.stripQuotes(this.getNodeText(firstArg, content)))
                            }
                        }
                    }
                }
            }
        }

        return [...new Set(imports)]
    }

    private stripGenerics(typeName: string): string {
        const idx = typeName.indexOf('<')
        return idx >= 0 ? typeName.slice(0, idx).trim() : typeName.trim()
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
        const methods: ExtractedNode[] = []
        const fields: string[] = []

        // Extract body members
        const body = this.getChildByField(node, 'body')
        if (body) {
            for (let i = 0; i < body.childCount; i++) {
                const child = body.child(i)
                if (!child) continue

                if (child.type === TS_NODE_TYPES.METHOD_DEFINITION) {
                    const method = this.extractMethod(
                        child,
                        name,
                        content,
                        lines
                    )
                    if (method) {
                        methods.push(method)
                        results.push(method)
                    }
                }

                if (child.type === TS_NODE_TYPES.PUBLIC_FIELD || child.type === 'property_signature') {
                    const fieldText = this.getNodeText(child, content).split('\n')[0]?.trim()
                    if (fieldText) {
                        fields.push(fieldText)
                    }
                }
            }
        }

        // Extract heritage clauses
        const { extendsClause, implementsClause } = this.extractHeritageClause(node, content)

        // Build structured declaration
        const declaration: ClassDeclaration = {
            name,
            methods,
            fields,
            bodyStyle: 'brace',
            commentPrefix: '//',
            ...(extendsClause !== undefined && { extendsClause }),
            ...(implementsClause !== undefined && { implementsClause }),
            ...(docstring !== undefined && { docstring }),
        }

        // Class chunk uses structural summary — not full source
        results.unshift({
            name,
            content: this.buildClassSummary(declaration),
            chunkType: 'class',
            startLine: this.getStartLine(originalNode),
            endLine: this.getEndLine(originalNode),
            metadata: {
                isExported,
                ...(docstring !== undefined && { docstring }),
                ...(extendsClause !== undefined && {
                    extendsNames: [this.stripGenerics(extendsClause)],
                }),
                ...(implementsClause !== undefined && {
                    implementsNames: implementsClause
                        .split(',')
                        .map((s) => this.stripGenerics(s.trim()))
                        .filter(Boolean),
                }),
            },
        })

        return results
    }

    private extractHeritageClause(node: Parser.SyntaxNode, content: string): { extendsClause?: string; implementsClause?: string } {
        let extendsClause: string | undefined
        let implementsClause: string | undefined

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (!child) {
                continue
            }

            if (child.type === 'class_heritage') {
                for (let j = 0; j < child.childCount; j++) {
                    const heritage = child.child(j)
                    if (!heritage) {
                        continue
                    }

                    if (heritage.type === 'extends_clause') {
                        // Skip 'extends' keyword, get the type
                        const typeNode = heritage.child(1)
                        if (typeNode) {
                            extendsClause = this.getNodeText(
                                typeNode,
                                content
                            ).trim()
                        }
                    }

                    if (heritage.type === 'implements_clause') {
                        // Collect all types after 'implements' keyword
                        const types: string[] = []
                        for (let k = 1; k < heritage.childCount; k++) {
                            const typeChild = heritage.child(k)
                            if (typeChild && typeChild.type !== ',') {
                                types.push(
                                    this.getNodeText(typeChild, content).trim()
                                )
                            }
                        }
                        if (types.length > 0) {
                            implementsClause = types.join(', ')
                        }
                    }
                }
            }
        }

        return { extendsClause, implementsClause }
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

    private extractTypeAlias(node: Parser.SyntaxNode, originalNode: Parser.SyntaxNode, content: string): ExtractedNode[] {
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

    private unwrapExport(node: Parser.SyntaxNode): Parser.SyntaxNode {
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

    private extractFunctionSignature(node: Parser.SyntaxNode, content: string): string {
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

    private extractParameters(node: Parser.SyntaxNode, content: string): string[] {
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

    private extractReturnType(node: Parser.SyntaxNode, content: string): string | undefined {
        const returnType = this.getChildByField(node, 'return_type')
        if (!returnType) return undefined
        return this.getNodeText(returnType, content)
            .replace(/^:\s*/, '')
            .trim()
    }
}