import { defineConfig } from 'vitest/config';

// Focused geometry checks are separate from the default task/persistence regressions.
export default defineConfig({
  test: { include: ['scripts/transport-checks/transport-geometry.check.ts', 'scripts/transport-checks/platform-muzzle.check.ts'] },
});
