import Table from 'cli-table3'
import chalk from 'chalk'


export function renderStatsTable(rows: Array<[string, string | number]>): string {
    const table = new Table({
        style: {
            head: [],
            border: ['dim'],
        },
        chars: {
            top: '─',
            'top-mid': '┬',
            'top-left': '┌',
            'top-right': '┐',
            bottom: '─',
            'bottom-mid': '┴',
            'bottom-left': '└',
            'bottom-right': '┘',
            left: '│',
            'left-mid': '├',
            mid: '─',
            'mid-mid': '┼',
            right: '│',
            'right-mid': '┤',
            middle: '│',
        },
    })

    for (const [label, value] of rows) {
        table.push([
            chalk.dim(label),
            chalk.white(String(value)),
        ])
    }

    return table.toString()
}

export function renderLanguageTable(byLanguage: Record<string, number>): string {
    const table = new Table({
        head: [
            chalk.dim('Language'),
            chalk.dim('Chunks'),
        ],
        style: { head: [], border: ['dim'] },
        chars: {
            top: '─',
            'top-mid': '┬',
            'top-left': '┌',
            'top-right': '┐',
            bottom: '─',
            'bottom-mid': '┴',
            'bottom-left': '└',
            'bottom-right': '┘',
            left: '│',
            'left-mid': '├',
            mid: '─',
            'mid-mid': '┼',
            right: '│',
            'right-mid': '┤',
            middle: '│',
        },
    })

    const sorted = Object.entries(byLanguage).sort(
        ([, a], [, b]) => b - a
    )

    for (const [language, count] of sorted) {
        table.push([chalk.cyan(language), String(count)])
    }

    return table.toString()
}