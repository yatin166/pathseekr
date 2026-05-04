import 'reflect-metadata'
import Parser from 'tree-sitter'
import { injectable } from 'inversify'
const PythonLanguage = require('tree-sitter-python')
import type { Language } from '@spyglass/shared'
import {
    BaseParser,
    ClassDeclaration,
    type ExtractedNode,
    TreeSitterLanguage
} from './base/base-parser'


const PY_NODE_TYPES = {
    // Top level definitions
    FUNCTION_DEFINITION: 'function_definition',
    CLASS_DEFINITION: 'class_definition',
    DECORATED_DEFINITION: 'decorated_definition',

    // Inside classes
    // Python uses the same function_definition node for methods
    // We detect methods by checking if the parent is a class body

    // Async variant
    // In Python the AST has a separate node type for async functions
    // but tree-sitter-python uses function_definition with an
    // async keyword child — same node type, different child

    // Docstrings — first expression in a body block
    EXPRESSION_STATEMENT: 'expression_statement',
    STRING: 'string',

    // Block containing the body
    BLOCK: 'block',

    // Async keyword
    ASYNC: 'async',

    // Used to identify dunder methods to skip
    IDENTIFIER: 'identifier',
} as const

@injectable()
export class PythonParser extends BaseParser {

    readonly supportedExtensions = ['.py', '.pyw'] as const
    protected readonly language = PythonLanguage as TreeSitterLanguage
    protected readonly languageId: Language = 'python'

    protected extractNodes(
        rootNode: Parser.SyntaxNode,
        content: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _lines: string[]
    ): ExtractedNode[] {
        const extracted: ExtractedNode[] = []

        this.walk(rootNode, (node) => {
            switch (node.type) {
                case PY_NODE_TYPES.FUNCTION_DEFINITION: {
                    const isMethod = this.isInsideClass(node)
                    if (!isMethod) {
                        extracted.push(
                            ...this.extractFunction(node, content)
                        )
                    }
                    return false
                }

                case PY_NODE_TYPES.CLASS_DEFINITION:
                    extracted.push(
                        ...this.extractClass(node, content)
                    )
                    return false

                case PY_NODE_TYPES.DECORATED_DEFINITION: {
                    const inner = this.getDecoratedInner(node)
                    if (!inner) return undefined

                    if (inner.type === PY_NODE_TYPES.FUNCTION_DEFINITION) {
                        const isMethod = this.isInsideClass(node)
                        if (!isMethod) {
                            extracted.push(
                                ...this.extractFunction(node, content)
                            )
                        }
                    } else if (
                        inner.type === PY_NODE_TYPES.CLASS_DEFINITION
                    ) {
                        extracted.push(
                            ...this.extractClass(node, content)
                        )
                    }
                    return false
                }

                default:
                    return undefined
            }
        })

        return extracted
    }

    protected buildClassSummary(params: ClassDeclaration): string {
        const lines: string[] = []

        // Python class declaration
        const base = params.extendsClause
            ? `class ${params.name}(${params.extendsClause}):`
            : `class ${params.name}:`

        lines.push(base)

        // Class docstring if available
        if (params.methods[0]?.metadata.docstring) {
            lines.push(`    """${params.methods[0].metadata.docstring}"""`)
            lines.push('')
        }

        // Field declarations
        if (params.fields.length > 0) {
            for (const field of params.fields) {
                lines.push(`    ${field}`)
            }
            lines.push('')
        }

        // Method signatures as comments
        if (params.methods.length > 0) {
            for (const method of params.methods) {
                const sig = method.metadata.signature ?? method.name
                lines.push(`    # ${sig}`)
            }
        }

        return lines.join('\n')
    }

    private extractFunction(node: Parser.SyntaxNode, content: string): ExtractedNode[] {
        const funcNode =
            node.type === PY_NODE_TYPES.DECORATED_DEFINITION
                ? this.getDecoratedInner(node) ?? node
                : node

        const name = this.getFieldText(funcNode, 'name', content)
        if (!name) {
            return []
        }

        if (name.startsWith('__') && name.endsWith('__')) {
            return []
        }

        const isAsync = this.hasAsyncKeyword(funcNode)
        const docstring = this.extractPythonDocstring(funcNode, content)
        const signature = this.buildSignature(funcNode, content)
        const parameters = this.extractParameters(funcNode, content)

        return [
            {
                name,
                content: this.getNodeText(node, content),
                chunkType: 'function',
                startLine: this.getStartLine(node),
                endLine: this.getEndLine(node),
                metadata: {
                    signature,
                    isAsync,
                    isExported: true,
                    parameters,
                    ...(docstring !== undefined && { docstring }),
                },
            },
        ]
    }

    private extractClass(node: Parser.SyntaxNode, content: string): ExtractedNode[] {
        // Unwrap decorated definitions
        const classNode = node.type === PY_NODE_TYPES.DECORATED_DEFINITION
            ? this.getDecoratedInner(node) ?? node
            : node

        const name = this.getFieldText(classNode, 'name', content)
        if (!name) {
            return []
        }

        // Extract class docstring from the class node body
        // Must be called on classNode not on the body directly
        const docstring = this.extractPythonDocstring(classNode, content)

        const results: ExtractedNode[] = []
        const methods: ExtractedNode[] = []
        const fields: string[] = []

        const body = this.getChildByField(classNode, 'body')
        if (body) {
            for (let i = 0; i < body.childCount; i++) {
                const child = body.child(i)
                if (!child) {
                    continue
                }

                // Extract plain methods
                if (child.type === PY_NODE_TYPES.FUNCTION_DEFINITION) {
                    const method = this.extractMethod(child, name, content)
                    if (method) {
                        methods.push(method)
                        results.push(method)
                    }
                    continue
                }

                // Extract decorated methods (@property, @staticmethod etc)
                if (child.type === PY_NODE_TYPES.DECORATED_DEFINITION) {
                    const inner = this.getDecoratedInner(child)
                    if (inner && inner.type === PY_NODE_TYPES.FUNCTION_DEFINITION) {
                        const method = this.extractMethod(child, name, content, inner)
                        if (method) {
                            methods.push(method)
                            results.push(method)
                        }
                    }
                    continue
                }

                // Capture class-level annotated assignments
                // e.g. api_key: str or count: int = 0
                if (child.type === 'expression_statement') {
                    const text = this.getNodeText(child, content)
                        .split('\n')[0]
                        ?.trim()
                    // Skip the docstring expression — already captured above
                    if (
                        text &&
                        !text.startsWith('"""') &&
                        !text.startsWith("'''") &&
                        !text.startsWith('#')
                    ) {
                        fields.push(text)
                    }
                    continue
                }
            }
        }

        // Extract base classes from argument_list node
        const extendsClause = this.extractBaseClasses(classNode, content)

        const declaration: ClassDeclaration = {
            name,
            methods,
            fields,
            bodyStyle: 'colon',
            commentPrefix: '#',
            docstring,
            extendsClause,
        }

        results.unshift({
            name,
            content: this.buildClassSummary(declaration),
            chunkType: 'class',
            startLine: this.getStartLine(node),
            endLine: this.getEndLine(node),
            metadata: {
                isExported: true,
                ...(docstring !== undefined && { docstring }),
            },
        })

        return results
    }

    private extractBaseClasses(node: Parser.SyntaxNode, content: string): string | undefined {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (child?.type === 'argument_list') {
                const text = this.getNodeText(child, content)
                    .replace(/^\(/, '')
                    .replace(/\)$/, '')
                    .trim()
                return text || undefined
            }
        }
        return undefined
    }

    private extractMethod(
        node: Parser.SyntaxNode,
        parentClassName: string,
        content: string,
        innerNode?: Parser.SyntaxNode
    ): ExtractedNode | null {
        const funcNode = innerNode ?? node
        const name = this.getFieldText(funcNode, 'name', content)
        if (!name) {
            return null
        }

        if (name.startsWith('__') && name.endsWith('__')) {
            return null
        }

        if (name.startsWith('_')) {
            return null
        }

        const isAsync = this.hasAsyncKeyword(funcNode)
        const docstring = this.extractPythonDocstring(funcNode, content)
        const signature = this.buildSignature(funcNode, content)
        const parameters = this.extractParameters(funcNode, content)

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

    private extractPythonDocstring(node: Parser.SyntaxNode, content: string): string | undefined {
        const body = this.getChildByField(node, 'body')
        if (!body) {
            return undefined
        }

        const firstStatement = body.child(0)
        if (!firstStatement) {
            return undefined
        }

        if (firstStatement.type !== PY_NODE_TYPES.EXPRESSION_STATEMENT) {
            return undefined
        }

        const firstExpr = firstStatement.child(0)
        if (!firstExpr) {
            return undefined
        }

        if (firstExpr.type !== PY_NODE_TYPES.STRING) {
            return undefined
        }

        const raw = this.getNodeText(firstExpr, content)
        return raw
            .replace(/^['"`]{1,3}/, '')
            .replace(/['"`]{1,3}$/, '')
            .trim()
    }

    private hasAsyncKeyword(node: Parser.SyntaxNode): boolean {
        for (let i = 0; i < node.childCount; i++) {
            if (node.child(i)?.type === PY_NODE_TYPES.ASYNC) {
                return true
            }
        }
        return false
    }

    private buildSignature(node: Parser.SyntaxNode, content: string): string {
        const name = this.getFieldText(node, 'name', content)
        const params = this.getChildByField(node, 'parameters')
        const returnType = this.getChildByField(
            node,
            'return_type'
        )

        const isAsync = this.hasAsyncKeyword(node)
        const asyncPrefix = isAsync ? 'async ' : ''
        const paramsText = params
            ? this.getNodeText(params, content)
            : '()'
        const returnText = returnType
            ? ` -> ${this.getNodeText(returnType, content)}`
            : ''

        return `${asyncPrefix}${name ?? 'unknown'}${paramsText}${returnText}`.trim()
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

            // Skip self and cls — they're noise in search results
            const text = this.getNodeText(param, content)
            if (text === 'self' || text === 'cls') {
                continue
            }

            paramNames.push(text)
        }

        return paramNames
    }

    private getDecoratedInner(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
        for (let i = node.childCount - 1; i >= 0; i--) {
            const child = node.child(i)
            if (!child) {
                continue
            }
            if (
                child.type === PY_NODE_TYPES.FUNCTION_DEFINITION ||
                child.type === PY_NODE_TYPES.CLASS_DEFINITION
            ) {
                return child
            }
        }
        return null
    }

    private isInsideClass(node: Parser.SyntaxNode): boolean {
        let current = node.parent
        while (current) {
            if (current.type === PY_NODE_TYPES.CLASS_DEFINITION) {
                return true
            }
            if (current.type === 'module') {
                return false
            }
            current = current.parent
        }
        return false
    }
}