import type { UserConfig } from '@commitlint/types'

const VALID_TYPES  = ['feat', 'fix', 'refactor', 'chore', 'test', 'docs']
const VALID_SCOPES = ['shared', 'core', 'cli', 'mcp', 'api', 'web', 'config', 'deps']

const HELP_MESSAGE = `
  Commit messages must follow this format:
    type(scope): short description
  Example:
    feat(core): add breadcrumb field to chunks

  Valid types:   ${VALID_TYPES.join(' | ')}
  Valid scopes:  ${VALID_SCOPES.join(' | ')}
`

const config: UserConfig = {
    plugins: [
        {
            rules: {
                'spyglass-format': ({ type, scope, subject }) => {
                    const validType    = Boolean(type && VALID_TYPES.includes(type))
                    const validScope   = Boolean(scope && VALID_SCOPES.includes(scope))
                    const hasSubject   = Boolean(subject?.trim())

                    return [validType && validScope && hasSubject, HELP_MESSAGE]
                },
            },
        },
    ],
    rules: {
        'spyglass-format': [2, 'always'],
    },
}

export default config