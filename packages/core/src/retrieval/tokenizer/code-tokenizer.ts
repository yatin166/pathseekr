import 'reflect-metadata'
import { injectable } from 'inversify'
import type { ITokenizer, TokenizeResult } from '../interfaces/tokenizer.interface'


const CODE_STOP_WORDS = new Set([
    // JavaScript / TypeScript keywords
    'const', 'let', 'var', 'function', 'return', 'class',
    'import', 'export', 'default', 'from', 'new', 'this',
    'if', 'else', 'for', 'while', 'do', 'switch', 'case',
    'break', 'continue', 'try', 'catch', 'finally', 'throw',
    'async', 'await', 'typeof', 'instanceof', 'void', 'null',
    'undefined', 'true', 'false', 'super', 'extends',
    'implements', 'interface', 'type', 'enum', 'namespace',
    'declare', 'abstract', 'public', 'private', 'protected',
    'static', 'readonly', 'get', 'set', 'in', 'of', 'yield',

    // Python keywords
    'def', 'self', 'cls', 'pass', 'lambda', 'with', 'as',
    'raise', 'except', 'assert', 'del', 'global', 'nonlocal',
    'not', 'and', 'or', 'is', 'none',

    // Java keywords
    'final', 'synchronized', 'volatile', 'transient',
    'throws', 'package', 'int', 'long', 'double', 'float',
    'boolean', 'char', 'byte', 'short',

    // Common low-signal words
    'the', 'a', 'an', 'is', 'it', 'to', 'of', 'in', 'on',
    'at', 'by', 'be', 'has', 'had', 'was', 'are', 'were',
    'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'can', 'than', 'that', 'with',
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
            if (!token) {
                continue
            }

            const subTokens = this.splitCamelCase(token)

            for (const subToken of subTokens) {
                const normalized = subToken.toLowerCase()
                if (this.isValidTerm(normalized)) {
                    terms.push(normalized)
                }
            }

            const wholeToken = token.toLowerCase()
            const firstSubToken = subTokens[0]?.toLowerCase()

            if (this.isValidTerm(wholeToken) && wholeToken !== firstSubToken) {
                terms.push(wholeToken)
            }
        }

        return terms
    }

    private splitCamelCase(token: string): string[] {
        return token
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
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