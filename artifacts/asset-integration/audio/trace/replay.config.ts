import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['artifacts/asset-integration/audio/trace/replay.check.ts'], testTimeout: 120000 } });
