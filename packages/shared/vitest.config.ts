import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    name: 'shared',
    globals: true,
    environment: 'node',
    root: path.resolve(__dirname),
    include: ['tests/**/*.test.ts'],
    setupFiles: [
      path.resolve(__dirname, '../../test-support/setup.ts'),
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@pathseekr/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
})