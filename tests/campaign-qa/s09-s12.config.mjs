import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const candidate = process.env.CAMPAIGN_QA_CANDIDATE ?? resolve(workspace, 'artifacts/campaign-qa/node_modules/locked-candidate-20261031');
const evidence = process.env.QA_EVIDENCE_DIR ?? resolve(workspace, `artifacts/campaign-qa/replays/s09-s12-${Date.now()}`);
export default defineConfig({
  root: workspace,
  cacheDir: resolve(evidence, '.vite'),
  resolve: { alias: { '@candidate': resolve(candidate, 'src') } },
  test: {
    include: ['tests/campaign-qa/s09-s12.check.mjs'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 240_000,
    hookTimeout: 30_000,
    env: { CAMPAIGN_QA_CANDIDATE: candidate, QA_EVIDENCE_DIR: evidence },
    reporters: ['default', 'json'],
    outputFile: resolve(evidence, 'vitest-results.json'),
  },
});
