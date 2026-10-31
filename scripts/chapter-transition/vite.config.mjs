import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  root,
  base: './',
  publicDir: false,
  server: { host: '127.0.0.1', port: 5198, strictPort: true, watch: { ignored: ['**/artifacts/**', '**/release/**', '**/.nativue/**'] } },
  build: {
    target: 'es2022',
    outDir: 'artifacts/chapter-transition/preview-dist',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('../../dev/chapter-transition/index.html', import.meta.url)) },
  },
});
