import 'reflect-metadata'
import { injectable } from 'inversify'
import type { ITokenizer, TokenizeResult } from './tokenizer.interface'

const UNIVERSAL_STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'it', 'to', 'of', 'in', 'on',
    'at', 'by', 'be', 'has', 'had', 'was', 'are', 'were',
    'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'can', 'than', 'that', 'this', 'with', 'not',
    'and', 'or', 'but', 'for', 'from', 'as', 'into', 'if',
    'else', 'do', 'new', 'true', 'false', 'null', 'void',
    'return', 'import', 'export',
])

const LANGUAGE_STOP_WORDS = new Set([
    // TypeScript / JavaScript
    'const', 'let', 'var', 'function', 'class', 'interface',
    'type', 'enum', 'namespace', 'declare', 'abstract',
    'async', 'await', 'typeof', 'instanceof', 'super',
    'extends', 'implements', 'readonly', 'static',
    'public', 'private', 'protected', 'get', 'set',
    'in', 'of', 'yield', 'default',

    // Python
    'def', 'self', 'cls', 'pass', 'lambda', 'with',
    'raise', 'except', 'assert', 'del', 'global',
    'nonlocal', 'none',

    // Java
    'final', 'synchronized', 'volatile', 'transient',
    'throws', 'package', 'int', 'long', 'double', 'float',
    'boolean', 'char', 'byte', 'short',

    // Common across many languages
    'switch', 'case', 'break', 'continue', 'try',
    'catch', 'finally', 'throw', 'while', 'for',
])

const CODE_STOP_WORDS = new Set([
    ...UNIVERSAL_STOP_WORDS,
    ...LANGUAGE_STOP_WORDS,
])

const MIN_TERM_LENGTH = 2
const MAX_TERM_LENGTH = 50

const DELIMITER_PATTERN = /[\s\n\r\t.,;:!?(){}\[\]<>'"\/\\|@#$%^&*+=`~-]+/

@injectable()
export class CodeTokenizer implements ITokenizer {

    tokenize(text: string): TokenizeResult {
        const allTerms = this.extractTerms(text)
        const termFrequencies = new Map<string, number>()

        for (const term of allTerms) {
            const count = termFrequencies.get(term) ?? 0
            termFrequencies.set(term, count + 1)
        }

        return {
            terms: Array.from(termFrequencies.keys()),
            termFrequencies,
        }
    }

    private extractTerms(text: string): string[] {
        const terms: string[] = []
        const rawTokens = text.split(DELIMITER_PATTERN)

        for (const token of rawTokens) {
            if (!token) continue

            const subTokens = this.splitCamelCase(token)

            // Add individual sub-tokens
            for (const subToken of subTokens) {
                const normalized = subToken.toLowerCase()
                if (this.isValidTerm(normalized)) {
                    terms.push(normalized)
                }
            }

            // Add intermediate compounds for better matching
            // TypeScriptParser → ['typescript', 'typescriptparser']
            for (let i = 0; i < subTokens.length - 1; i++) {
                const compound = subTokens
                    .slice(i, i + 2)
                    .join('')
                    .toLowerCase()
                if (this.isValidTerm(compound)) {
                    terms.push(compound)
                }
            }

            // Add the full token as-is
            const wholeToken = token.toLowerCase()
            const firstSubToken = subTokens[0]?.toLowerCase()
            if (
                this.isValidTerm(wholeToken) &&
                wholeToken !== firstSubToken
            ) {
                terms.push(wholeToken)
            }
        }

        return terms
    }

    private splitCamelCase(token: string): string[] {
        return token
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .replace(/([0-9])([A-Z])/g, '$1 $2')
            .split(' ')
            .filter(Boolean)
    }

    private isValidTerm(term: string): boolean {
        if (term.length < MIN_TERM_LENGTH) {
            return false
        }
        if (term.length > MAX_TERM_LENGTH) {
            return false
        }
        if (CODE_STOP_WORDS.has(term)) {
            return false
        }
        return !this.isNumeric(term);
    }

    private isNumeric(str: string): boolean {
        return /^\d+$/.test(str)
    }
}