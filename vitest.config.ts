import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
      exclude: [
        '**/dist/**',
        '**/node_modules/**',
        '**/*.config.*',
        '**/__tests__/**',
        '**/*.test.ts',
      ],
    },
  },
});
