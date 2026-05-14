import path from 'path'

export function fixturePath(...segments: string[]): string {
  return path.resolve(__dirname, '../fixtures', ...segments)
}