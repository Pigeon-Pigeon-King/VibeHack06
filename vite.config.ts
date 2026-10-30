import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { watch: { ignored: ['**/release/**', '**/.nativue/**', '**/artifacts/**', '**/assets/concepts/**'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1800 },
});
