import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      thresholds: {
        statements: 40,
        branches: 30,
        functions: 35,
        lines: 40,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
