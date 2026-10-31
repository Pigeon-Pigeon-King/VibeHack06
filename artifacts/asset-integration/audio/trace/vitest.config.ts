import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
 include: ['tests/opening-paths.test.ts', 'tests/chapter-paths.test.ts', 'tests/frontgate-paths.test.ts', 'tests/transfer-paths.test.ts', 'tests/flank-paths.test.ts', 'tests/escort-paths.test.ts', 'tests/relief-paths.test.ts', 'tests/finale-paths.test.ts'],
 setupFiles: ['artifacts/asset-integration/audio/trace/collect.ts'],
 testTimeout: 60000, fileParallelism: false,
} });
