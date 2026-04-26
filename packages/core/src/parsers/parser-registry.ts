import 'reflect-metadata'
import { injectable } from 'inversify'
import type { IDocumentParser } from '../interfaces/document-parser.interface'
import { TypeScriptParser } from './typescript-parser'


@injectable()
export class ParserRegistry {
    private readonly parsers: IDocumentParser[]

    private readonly ignoredExtensions = new Set([
        '.json',
        '.md',
        '.txt',
        '.yaml',
        '.yml',
        '.toml',
        '.lock',
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
        '.ico',
        '.woff',
        '.woff2',
        '.ttf',
        '.eot',
        '.mp4',
        '.mp3',
        '.pdf',
        '.zip',
        '.gz',
        '.tar',
    ])

    constructor() {
        this.parsers = [
            new TypeScriptParser(),
            // new JavaScriptParser(),
            // new PythonParser(),
            // new JavaParser(),
        ]
    }

    getParser(filePath: string): IDocumentParser | null {
        const ext = this.getExtension(filePath)

        if (this.ignoredExtensions.has(ext)) {
            return null
        }

        return (
            this.parsers.find((parser) => parser.supports(filePath)) ??
            null
        )
    }

    canParse(filePath: string): boolean {
        return this.getParser(filePath) !== null
    }

    getSupportedExtensions(): string[] {
        return this.parsers.flatMap((p) =>
            [...p.supportedExtensions]
        )
    }

    private getExtension(filePath: string): string {
        const parts = filePath.split('.')
        return parts.length > 1
            ? `.${parts[parts.length - 1]}`
            : ''
    }
}