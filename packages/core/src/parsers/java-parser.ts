import 'reflect-metadata'
import Parser from 'tree-sitter'
import { injectable } from 'inversify'
const JavaLanguage = require('tree-sitter-java')
import type { Language } from '@spyglass/shared'
import {
    BaseParser,
    ClassDeclaration,
    type ExtractedNode,
    TreeSitterLanguage
} from './base/base-parser'


const JAVA_NODE_TYPES = {
    CLASS_DECLARATION: 'class_declaration',
    INTERFACE_DECLARATION: 'interface_declaration',
    ENUM_DECLARATION: 'enum_declaration',
    METHOD_DECLARATION: 'method_declaration',
    MODIFIERS: 'modifiers',
    CLASS_BODY: 'class_body',
    INTERFACE_BODY: 'interface_body',
    FORMAL_PARAMETERS: 'formal_parameters',
    FORMAL_PARAMETER: 'formal_parameter',
    IDENTIFIER: 'identifier',
    // Modifier keywords
    PUBLIC: 'public',
    PRIVATE: 'private',
    PROTECTED: 'protected',
    STATIC: 'static',
} as const

const JAVA_TYPE_NODES = new Set([
    'void_type',
    'integral_type',
    'floating_point_type',
    'boolean_type',
    'type_identifier',
    'generic_type',
    'array_type',
    'scoped_type_identifier',
])

@injectable()
export class JavaParser extends BaseParser {

    readonly supportedExtensions = ['.java'] as const
    protected readonly language = JavaLanguage as TreeSitterLanguage
    protected readonly languageId: Language = 'java'

    protected extractNodes(rootNode: Parser.SyntaxNode, content: string, lines: string[]): ExtractedNode[] {
        const extracted: ExtractedNode[] = []

        this.walk(rootNode, (node) => {
            switch (node.type) {
                case JAVA_NODE_TYPES.CLASS_DECLARATION:
                    extracted.push(
                        ...this.extractClass(node, content, lines)
                    )
                    return false

                case JAVA_NODE_TYPES.INTERFACE_DECLARATION:
                    extracted.push(
                        ...this.extractInterface(node, content, lines)
                    )
                    return false

                case JAVA_NODE_TYPES.ENUM_DECLARATION:
                    extracted.push(
                        ...this.extractEnum(node, content, lines)
                    )
                    return false

                default:
                    return undefined
            }
        })

        return extracted
    }

    protected buildClassSummary(params: ClassDeclaration): string {
        const lines: string[] = []

        // Java class declaration
        const declaration = [
            params.accessModifier ?? 'public',
            'class',
            params.name,
            params.extendsClause ? `extends ${params.extendsClause}` : null,
            params.implementsClause ? `implements ${params.implementsClause}` : null,
        ].filter(Boolean).join(' ')

        lines.push(`${declaration} {`)

        // Method signatures as comments
        if (params.methods.length > 0) {
            lines.push('')
            for (const method of params.methods) {
                const sig = method.metadata.signature ?? method.name
                lines.push(`    // ${sig}`)
            }
            lines.push('')
        }

        lines.push('}')

        return lines.join('\n')
    }

    protected extractImports(rootNode: Parser.SyntaxNode, content: string): string[] {
        const imports: string[] = []

        for (let i = 0; i < rootNode.childCount; i++) {
            const node = rootNode.child(i)
            if (!node) {
                continue
            }

            if (node.type === 'import_declaration') {
                for (let j = 0; j < node.childCount; j++) {
                    const child = node.child(j)
                    if (!child) {
                        continue
                    }
                    if (child.type === 'scoped_identifier' || child.type === 'identifier') {
                        imports.push(this.getNodeText(child, content).trim())
                        break
                    }
                }
            }
        }

        return [...new Set(imports)]
    }

    private extractClass(node: Parser.SyntaxNode, content: string, lines: string[]): ExtractedNode[] {
        const name = this.findIdentifier(node, content)
        if (!name) {
            return []
        }

        const isPublic = this.hasModifier(node, JAVA_NODE_TYPES.PUBLIC)
        if (!isPublic) {
            return []
        }

        const javadoc = this.extractJavadoc(node, lines)
        const results: ExtractedNode[] = []
        const methods: ExtractedNode[] = []

        const body = this.findChildByType(node, JAVA_NODE_TYPES.CLASS_BODY)
        if (body) {
            for (let i = 0; i < body.childCount; i++) {
                const child = body.child(i)
                if (!child) {
                    continue
                }

                if (child.type === JAVA_NODE_TYPES.METHOD_DECLARATION) {
                    const method = this.extractMethod(child, name, content, lines)
                    if (method) {
                        methods.push(method)
                        results.push(method)
                    }
                }
            }
        }

        // Find extends and implements
        const { extendsClause, implementsClause } = this.extractJavaHeritage(node, content)

        const declaration: ClassDeclaration = {
            name,
            methods,
            fields: [],
            bodyStyle: 'brace',
            commentPrefix: '//',
            accessModifier: 'public',
            ...(extendsClause !== undefined && { extendsClause }),
            ...(implementsClause !== undefined && { implementsClause }),
            ...(javadoc !== undefined && { docstring: javadoc }),
        }
        const summary = this.buildClassSummary(declaration)

        results.unshift({
            name,
            content: summary,
            chunkType: 'class',
            startLine: this.getStartLine(node),
            endLine: this.getEndLine(node),
            metadata: {
                isExported: isPublic,
                ...(javadoc !== undefined && { docstring: javadoc }),
                ...(extendsClause !== undefined && {
                    extendsNames: [this.stripJavaGenerics(extendsClause)],
                }),
                ...(implementsClause !== undefined && {
                    implementsNames: implementsClause
                        .split(',')
                        .map((s) => this.stripJavaGenerics(s.trim()))
                        .filter(Boolean),
                }),
            },
        })

        return results
    }

    private stripJavaGenerics(typeName: string): string {
        const idx = typeName.indexOf('<')
        return idx >= 0 ? typeName.slice(0, idx).trim() : typeName.trim()
    }

    private extractJavaHeritage(node: Parser.SyntaxNode, content: string): { extendsClause?: string; implementsClause?: string } {
        let extendsClause: string | undefined
        let implementsClause: string | undefined

        const superclass = this.findChildByType(node, 'superclass')
        if (superclass) {
            const typeNode = superclass.child(1)
            if (typeNode) {
                extendsClause = this.getNodeText(typeNode, content).trim()
            }
        }

        const superInterfaces = this.findChildByType(
            node,
            'super_interfaces'
        )
        if (superInterfaces) {
            const types: string[] = []
            for (let i = 1; i < superInterfaces.childCount; i++) {
                const child = superInterfaces.child(i)
                if (child && child.type !== ',') {
                    types.push(this.getNodeText(child, content).trim())
                }
            }
            if (types.length > 0) {
                implementsClause = types.join(', ')
            }
        }

        return { extendsClause, implementsClause }
    }

    private extractInterface(node: Parser.SyntaxNode, content: string, lines: string[]): ExtractedNode[] {
        const name = this.findIdentifier(node, content)
        if (!name) {
            return []
        }

        const isPublic = this.hasModifier(node, JAVA_NODE_TYPES.PUBLIC)
        if (!isPublic) {
            return []
        }

        const javadoc = this.extractJavadoc(node, lines)

        return [
            {
                name,
                content: this.getNodeText(node, content),
                chunkType: 'interface',
                startLine: this.getStartLine(node),
                endLine: this.getEndLine(node),
                metadata: {
                    isExported: isPublic,
                    ...(javadoc !== undefined && { docstring: javadoc }),
                },
            },
        ]
    }

    private extractEnum(node: Parser.SyntaxNode, content: string, lines: string[]): ExtractedNode[] {
        const name = this.findIdentifier(node, content)
        if (!name) {
            return []
        }

        const isPublic = this.hasModifier(node, JAVA_NODE_TYPES.PUBLIC)
        if (!isPublic) {
            return []
        }

        const javadoc = this.extractJavadoc(node, lines)

        return [
            {
                name,
                content: this.getNodeText(node, content),
                chunkType: 'type',
                startLine: this.getStartLine(node),
                endLine: this.getEndLine(node),
                metadata: {
                    isExported: isPublic,
                    ...(javadoc !== undefined && { docstring: javadoc }),
                },
            },
        ]
    }

    private extractMethod(
        node: Parser.SyntaxNode,
        parentClassName: string,
        content: string,
        lines: string[]
    ): ExtractedNode | null {
        const name = this.findIdentifier(node, content)
        if (!name) {
            return null
        }

        const isPublic = this.hasModifier(node, JAVA_NODE_TYPES.PUBLIC)
        if (!isPublic) {
            return null
        }

        const isStatic = this.hasModifier(
            node,
            JAVA_NODE_TYPES.STATIC
        )
        const returnType = this.findReturnType(node, content)
        const javadoc = this.extractJavadoc(node, lines)
        const signature = this.buildSignature(
            node,
            name,
            content,
            isStatic,
            returnType
        )
        const parameters = this.extractParameters(node, content)

        return {
            name: `${parentClassName}.${name}`,
            content: this.getNodeText(node, content),
            chunkType: 'method',
            startLine: this.getStartLine(node),
            endLine: this.getEndLine(node),
            metadata: {
                signature,
                isExported: isPublic,
                parentName: parentClassName,
                parameters,
                ...(javadoc !== undefined && { docstring: javadoc }),
                ...(returnType !== undefined && { returnType }),
            },
        }
    }

    private findIdentifier(node: Parser.SyntaxNode, content: string): string | null {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (child?.type === JAVA_NODE_TYPES.IDENTIFIER) {
                return this.getNodeText(child, content)
            }
        }
        return null
    }

    private findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (child?.type === type) {
                return child
            }
        }
        return null
    }

    private findReturnType(node: Parser.SyntaxNode, content: string): string | undefined {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (!child) {
                continue
            }
            if (JAVA_TYPE_NODES.has(child.type)) {
                return this.getNodeText(child, content)
            }
        }
        return undefined
    }

    private hasModifier(node: Parser.SyntaxNode, modifier: string): boolean {
        const modifiers = this.findChildByType(
            node,
            JAVA_NODE_TYPES.MODIFIERS
        )
        if (!modifiers) {
            return false
        }

        for (let i = 0; i < modifiers.childCount; i++) {
            if (modifiers.child(i)?.type === modifier) return true
        }
        return false
    }

    private extractJavadoc(
        node: Parser.SyntaxNode,
        lines: string[]
    ): string | undefined {
        const docstring = this.extractDocstring(node, lines)
        if (!docstring?.startsWith('/**')) return undefined

        return docstring
            .replace(/^\/\*\*/, '')
            .replace(/\*\/$/, '')
            .split('\n')
            .map((line) => line.replace(/^\s*\*\s?/, ''))
            .join('\n')
            .trim()
    }

    private buildSignature(
        node: Parser.SyntaxNode,
        name: string,
        content: string,
        isStatic: boolean,
        returnType?: string
    ): string {
        const params = this.findChildByType(
            node,
            JAVA_NODE_TYPES.FORMAL_PARAMETERS
        )
        const staticPrefix = isStatic ? 'static ' : ''
        const returnText = returnType ? `${returnType} ` : ''
        const paramsText = params
            ? this.getNodeText(params, content)
            : '()'

        return `public ${staticPrefix}${returnText}${name}${paramsText}`.trim()
    }

    private extractParameters(node: Parser.SyntaxNode, content: string): string[] {
        const params = this.findChildByType(
            node,
            JAVA_NODE_TYPES.FORMAL_PARAMETERS
        )
        if (!params) {
            return []
        }

        const paramNames: string[] = []

        for (let i = 0; i < params.childCount; i++) {
            const param = params.child(i)
            if (!param) {
                continue
            }
            if (param.type !== JAVA_NODE_TYPES.FORMAL_PARAMETER) {
                continue
            }

            let lastName: string | null = null
            for (let j = 0; j < param.childCount; j++) {
                const child = param.child(j)
                if (child?.type === JAVA_NODE_TYPES.IDENTIFIER) {
                    lastName = this.getNodeText(child, content)
                }
            }
            if (lastName) paramNames.push(lastName)
        }

        return paramNames
    }
}