import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'server-only': resolve(__dirname, 'tests/server-only.ts'),
    },
  },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 20000, hookTimeout: 30000 },
});
