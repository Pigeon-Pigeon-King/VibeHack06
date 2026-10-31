import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/finale-checks/*.check.ts'], testTimeout: 30000 } });
