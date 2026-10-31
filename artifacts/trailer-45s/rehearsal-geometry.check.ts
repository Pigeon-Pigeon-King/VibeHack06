import { beforeAll, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildEnvironment } from '../../src/presentation/environment';
import { initializePhysics, FIXED_DT } from '../../src/runtime/Physics';
import { emptyIntent, Simulation, distance } from '../../src/mission/Simulation';
import { SaveStore, SAVE_KEY_PREFIX } from '../../src/persistence/SaveStore';
import type { Vec3 } from '../../src/contracts';

beforeAll(initializePhysics);

// This is an automated route scout, not a browser recording or human rehearsal.
// It uses the existing checkpoint, world geometry and public Intent only.
it('scouts a native S10 wall approach and backing out without adding obstacles or task facts', () => {
  const fixture = readFileSync(new URL('../../tests/fixtures/finale/rescue-4.json', import.meta.url), 'utf8');
  const provenance = JSON.parse(readFileSync(new URL('../../tests/fixtures/finale/rescue-4.source.json', import.meta.url), 'utf8'));
  expect(createHash('sha256').update(fixture).digest('hex')).toBe(provenance.sha256);
  const saved = new SaveStore({
    getItem: (key: string) => key === `${SAVE_KEY_PREFIX}rescue` ? fixture : null,
    setItem() {}, removeItem() {},
  }).load('rescue');
  expect(saved.save).toBeDefined();
  const environment = buildEnvironment('rescue');
  const sim = new Simulation('rescue', environment.solids, saved.save!.snapshot);
  const meng = () => sim.actors.find(a => a.id === 'meng')!;
  const log: unknown[] = [];
  const record = (label: string) => log.push({ label, time: sim.mission.phaseTime,
    phase: sim.mission.phase, player: [...sim.player.position], patient: [...meng().position],
    partner: [...sim.actors.find(a => a.id === 'zheng')!.position], ammo: sim.player.ammo, fired: sim.ballistics.fired });
  const step = (seconds: number, yaw: number, forward = 1) => {
    for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) sim.step({ ...emptyIntent, yaw, forward, fire: true, reload: true });
  };
  const toward = (target: Vec3, budget = 15) => {
    for (let i = 0; i < budget / FIXED_DT && sim.mission.phase === 4; i++) {
      const dx = target[0] - sim.player.position[0], dz = target[2] - sim.player.position[2];
      if (Math.hypot(dx, dz) < 0.035) break;
      sim.step({ ...emptyIntent, yaw: Math.atan2(-dx, -dz), forward: 1, fire: true, reload: true });
    }
  };
  const ammo = sim.player.ammo;
  try {
    record('restored');
    toward([-39, 0, 225.9257]); record('before_native_wall');
    toward([-39, 0, 225.35], 3); record('narrow_margin');
    step(10, Math.PI / 2); record('west_approach');
    const stopped = [...sim.player.position] as Vec3;
    step(2, Math.PI / 2); record('held_west');
    const heldDrift = distance(stopped, sim.player.position);
    step(1.5, Math.PI / 2, -1); record('back_out');
    const reverseDistance = sim.player.position[0] - stopped[0];
    toward([sim.player.position[0], 0, 226.05], 4); record('clear_margin');
    toward([-54, 0, 226], 12); record('hard_cover_reached');
    const evidence = { kind: 'automated-public-intent-native-geometry-scout',
      humanRehearsal: 'NOT_RUN', browserRendering: 'NOT_RUN', injectedObstacles: false,
      modifiedTaskFacts: false, fixtureSha256: provenance.sha256, heldDrift, reverseDistance,
      playerAmmoSpent: ammo - sim.player.ammo, playerShots: sim.ballistics.fired,
      underCover: sim.has('rescue-meng-under-cover'), log };
    writeFileSync(new URL('./rehearsal-geometry.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
    console.info(JSON.stringify(evidence));
    expect(heldDrift).toBeLessThan(0.08);
    expect(reverseDistance).toBeGreaterThan(1);
    expect(sim.has('rescue-meng-under-cover')).toBe(true);
    expect(sim.player.ammo).toBe(ammo);
    expect(sim.ballistics.fired).toBe(0);
  } finally { sim.dispose(); environment.dispose(); }
});
