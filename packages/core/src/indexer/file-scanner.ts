import 'reflect-metadata'
import { injectable, inject } from 'inversify'
import * as fs from 'fs'
import * as path from 'path'
import type { PathseekrConfig } from '@pathseekr/shared'
import { TYPES } from '../container/types'


export interface ScannedFile {
    readonly absolutePath: string
    readonly relativePath: string
    readonly sizeBytes: number
    readonly extension: string
}

export interface ScanResult {
    readonly files: ScannedFile[]
    readonly totalScanned: number
    readonly skippedCount: number
    readonly skippedReasons: Record<string, number>
    readonly skippedExtensions: string[]
    readonly skippedDirectories: string[]
}

const IGNORED_DIRECTORIES = new Set([
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'dist',
    'build',
    'out',
    '.turbo',
    '.next',
    '.nuxt',
    '.output',
    'coverage',
    '.nyc_output',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    'target',
    '.gradle',
    '.idea',
    '.vscode',
    'vendor',
    '.bundle',
    'Pods',
    'DerivedData',
])

const IGNORED_EXTENSIONS = new Set([
    // Data
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.csv',
    '.tsv',
    // Docs
    '.md',
    '.mdx',
    '.txt',
    '.rst',
    '.pdf',
    // Images
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.ico',
    '.webp',
    // Fonts
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.otf',
    // Video / audio
    '.mp4',
    '.mp3',
    '.wav',
    '.avi',
    '.mov',
    // Archives
    '.zip',
    '.tar',
    '.gz',
    '.rar',
    '.7z',
    // Binary / compiled
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.class',
    '.pyc',
    // Lock files
    '.lock',
    // Environment
    '.env',
    // Generated
    '.min.js',
    '.min.css',
    '.d.ts',
    '.map',
])


@injectable()
export class FileScanner {
    private readonly maxFileSizeBytes: number
    private readonly extraIgnoredPatterns: string[]

    constructor(
        @inject(TYPES.PathseekrConfig)
        private readonly config: PathseekrConfig
    ) {
        this.maxFileSizeBytes = this.config.indexing.maxFileSizeBytes
        this.extraIgnoredPatterns = this.config.indexing.excludePatterns
    }

    scan(sourcePath: string): ScanResult {
        const absolutePath = path.resolve(sourcePath)

        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Path does not exist: ${absolutePath}`)
        }

        const stat = fs.statSync(absolutePath)
        const files: ScannedFile[] = []
        const skippedReasons: Record<string, number> = {}
        const skippedExtensions = new Set<string>()
        const skippedDirectories = new Set<string>()
        let totalScanned = 0

        if (stat.isFile()) {
            totalScanned = 1
            const result = this.processFile(
              absolutePath,
              absolutePath,
              stat,
              skippedExtensions
            )

            if (result.file) {
                files.push(result.file)
            } else if (result.reason) {
                skippedReasons[result.reason] = (skippedReasons[result.reason] ?? 0) + 1
            }
        } else if (stat.isDirectory()) {
            this.walkDirectory(
                absolutePath,
                absolutePath,
                files,
                skippedReasons,
                skippedExtensions,
                skippedDirectories,
                (count) => { totalScanned += count }
            )
        }

        return {
            files,
            totalScanned,
            skippedCount: totalScanned - files.length,
            skippedReasons,
            skippedExtensions: [...skippedExtensions].sort(),
            skippedDirectories: [...skippedDirectories].sort(),
        }
    }

    private walkDirectory(
        dirPath: string,
        rootPath: string,
        files: ScannedFile[],
        skippedReasons: Record<string, number>,
        skippedExtensions: Set<string>,
        skippedDirectories: Set<string>,
        onScanned: (count: number) => void
    ): void {
        let entries: fs.Dirent[]

        try {
            entries = fs.readdirSync(dirPath, { withFileTypes: true })
        } catch {
            skippedReasons['unreadable_directory'] = (skippedReasons['unreadable_directory'] ?? 0) + 1
            return
        }

        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry.name)

            if (entry.isDirectory()) {
                if (this.shouldSkipDirectory(entry.name)) {
                    skippedDirectories.add(entry.name)
                    skippedReasons['ignored_directory'] = (skippedReasons['ignored_directory'] ?? 0) + 1
                    continue
                }
                this.walkDirectory(
                    entryPath,
                    rootPath,
                    files,
                    skippedReasons,
                    skippedExtensions,
                    skippedDirectories,
                    onScanned
                )
                continue
            }

            if (!entry.isFile()) {
                continue
            }

            onScanned(1)

            let stat: fs.Stats
            try {
                stat = fs.statSync(entryPath)
            } catch {
                skippedReasons['stat_error'] = (skippedReasons['stat_error'] ?? 0) + 1
                continue
            }

            const result = this.processFile(entryPath, rootPath, stat, skippedExtensions)

            if (result.file) {
                files.push(result.file)
            } else if (result.reason) {
                skippedReasons[result.reason] = (skippedReasons[result.reason] ?? 0) + 1
            }
        }
    }

    private processFile(
        absolutePath: string,
        rootPath: string,
        stat: fs.Stats,
        skippedExtensions: Set<string>   // ← add parameter
    ): { file?: ScannedFile; reason?: string } {
        const fileName = path.basename(absolutePath)
        const extension = this.getExtension(absolutePath)

        if (fileName.startsWith('.')) {
            return { reason: 'hidden_file' }
        }

        if (IGNORED_EXTENSIONS.has(extension)) {
            skippedExtensions.add(extension)
            return { reason: 'ignored_extension' }
        }

        if (absolutePath.endsWith('.d.ts')) {
            skippedExtensions.add('.d.ts')
            return { reason: 'declaration_file' }
        }

        if (stat.size > this.maxFileSizeBytes) {
            return { reason: 'too_large' }
        }

        if (stat.size === 0) {
            return { reason: 'empty_file' }
        }

        if (this.matchesExcludePattern(absolutePath)) {
            return { reason: 'exclude_pattern' }
        }

        const relativePath = path.relative(rootPath, absolutePath)

        return {
            file: {
                absolutePath,
                relativePath,
                sizeBytes: stat.size,
                extension,
            },
        }
    }

    private shouldSkipDirectory(dirName: string): boolean {
        if (dirName.startsWith('.')) {
            return true
        }
        return IGNORED_DIRECTORIES.has(dirName);
    }

    private matchesExcludePattern(filePath: string): boolean {
        for (const pattern of this.extraIgnoredPatterns) {
            const regexStr = pattern
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')

            try {
                const regex = new RegExp(regexStr)
                if (regex.test(filePath)) return true
            } catch {
                // Invalid pattern — skip it
            }
        }
        return false
    }

    private getExtension(filePath: string): string {
        const base = path.basename(filePath)
        const dotIndex = base.indexOf('.')
        if (dotIndex === -1) return ''
        return base.slice(dotIndex).toLowerCase()
    }
}