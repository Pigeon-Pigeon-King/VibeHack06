import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const candidate = process.env.QA_CANDIDATE_ROOT;
if (!candidate) throw new Error('QA_CANDIDATE_ROOT must name the frozen candidate.');
const own = resolve(import.meta.dirname, 's01-s04.check.mjs');
export default defineConfig({
  root: candidate,
  cacheDir: resolve(import.meta.dirname, '../../artifacts/campaign-qa/s01-s04/.vite'),
  test: {
    include: [own, 'tests/opening-paths.test.ts', 'tests/opening-autonomy.test.ts', 'tests/chapter-paths.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 90000,
    hookTimeout: 30000,
  },
});
