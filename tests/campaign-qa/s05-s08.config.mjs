import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { transformWithOxc } from 'vite';

const candidate = process.env.QA_CANDIDATE_ROOT;
if (!candidate) throw new Error('QA_CANDIDATE_ROOT must name the locked candidate.');
const here = fileURLToPath(new URL('.', import.meta.url));
const routes = {
  escort: { file: 'escort-paths.test.ts', marker: "describe('S08 escort:", function: 'playEscort' },
  frontgate: { file: 'frontgate-paths.test.ts', marker: "describe('S05 continuous", function: 'run' },
  transfer: { file: 'transfer-paths.test.ts', marker: "describe('S06 transfer:", function: 'playTransfer' },
  flank: { file: 'flank-paths.test.ts', marker: "describe('S07 flank:", function: 'playFlank' },
};
const moduleId = name => `\0s05-s08-${name}-route.ts`;
const caseFile = process.env.QA_CASE_MODE === 'baseline' ? 's05-s08.baseline.check.mjs'
  : process.env.QA_CASE_MODE === 'remaining-natural' ? 's05-s08.remaining-natural.check.mjs' : 's05-s08.check.mjs';

export default defineConfig({
  root: resolve(here, '../..'),
  cacheDir: resolve(process.env.QA_EVIDENCE_DIR, '.cache'),
  plugins: [{
    name: 'locked-s05-s08-public-routes',
    resolveId(id) {
      const name = Object.keys(routes).find(name => id === `virtual:s05-s08-${name}-route`);
      if (name) return moduleId(name);
    },
    async load(id) {
      const name = Object.keys(routes).find(name => id === moduleId(name));
      if (!name) return;
      const description = routes[name], file = resolve(candidate, 'tests', description.file);
      const source = readFileSync(file, 'utf8');
      const index = source.indexOf(description.marker);
      if (index < 0) throw new Error(`Locked ${name} route extraction marker changed.`);
      // Reuse the unmodified public-input route and its assertions once. The
      // original test registration (three long replays) is intentionally absent.
      const route = source.slice(0, index).replace('beforeAll(initializePhysics);', '')
        .replaceAll("from '../src/", "from 'candidate-src/")
        + `\nexport { ${description.function}, ${description.function} as playRoute };\n`;
      return transformWithOxc(route, file);
    },
  }],
  resolve: { alias: { 'candidate-src': resolve(candidate, 'src') } },
  test: {
    include: [resolve(here, caseFile)],
    setupFiles: [resolve(here, 's05-s08.observe.mjs')],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 120000,
    hookTimeout: 30000,
    reporters: ['default', 'json'],
    outputFile: { json: resolve(process.env.QA_EVIDENCE_DIR, `${process.env.QA_CASE_MODE}-results.json`) },
  },
});
