import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: 'artifacts/npc-pace/.q-cover-cache',
  test: {
    include: ['artifacts/npc-pace/q-cover-diagnostic.check.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 30000,
  },
});
