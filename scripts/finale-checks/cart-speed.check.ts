import { beforeAll, expect, it } from 'vitest';
import { buildEnvironment } from '../../src/presentation/environment';
import { Physics, initializePhysics, FIXED_DT as dt } from '../../src/runtime/Physics';
beforeAll(initializePhysics);
it('a full bed box maintains transport speed through small steering corrections on level ground', () => {
  const e = buildEnvironment('rescue'), p = new Physics(e.solids), start: [number, number, number] = [-120, 0, 244];
  const yaw = Math.atan2(-90, -54), speed = 5.5;
  try {
    p.addCart('probe', start, yaw);
    for (let i = 0; i < 1100; i++) {
      const at = p.foot('probe'), dx = -210 - at[0], dz = 190 - at[2], len = Math.hypot(dx, dz);
      p.orient('probe', Math.atan2(dx, dz));
      p.move('probe', dx / len * speed, dz / len * speed, dt); p.step();
    }
    const end = p.foot('probe'), traveled = Math.hypot(end[0] - start[0], end[2] - start[2]);
    // Commanded distance is 100.83m. A small controller tolerance is allowed;
    // the original unfiltered steering moved only about 38m in the same time.
    expect(traveled).toBeGreaterThan(95); expect(traveled).toBeLessThan(101);
    expect(end[1]).toBeGreaterThan(-0.05); expect(end[1]).toBeLessThan(0.05);
    console.info('S10 full-bed transport steering', { seconds: 1100 * dt, traveled, end });
  } finally { p.dispose(); e.dispose(); }
});
