import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/escort-checks/*.check.ts'], testTimeout: 30000 } });
