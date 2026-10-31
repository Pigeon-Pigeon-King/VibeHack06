import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const candidate = process.env.CAMPAIGN_QA_CANDIDATE ?? fileURLToPath(new URL('../../artifacts/campaign-qa/node_modules/locked-candidate-20261031/', import.meta.url));
export default defineConfig({
  root: candidate,
  base: './',
  cacheDir: `${candidate}/.browser-vite-cache`,
  server: { host: '127.0.0.1', port: 5197, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1800 },
});
