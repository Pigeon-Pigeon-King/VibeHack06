import { describe, expect, it } from 'vitest';
import { Raycaster, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { EnvironmentModel, ScenarioId, SolidSpec } from '../src/contracts';
import { ESCORT } from '../src/content/escort-layout';
import { buildEnvironment } from '../src/presentation/environment';

function visible(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}

function oneSurface(environment: EnvironmentModel, x: number, z: number, y = 0): void {
  environment.root.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(x, y + 0.35, z), new Vector3(0, -1, 0), 0, 0.7);
  const hits = ray.intersectObject(environment.root, true).filter(hit => visible(hit.object) && Math.abs(hit.point.y - y) < 0.0001);
  // A ray on a triangle diagonal may hit both triangles of one face. Separate
  // meshes/instances at the same height are the competing surfaces in this bug.
  const surfaces = new Map(hits.map(hit => [`${hit.object.uuid}:${hit.instanceId ?? 'mesh'}`, hit.object.name]));
  expect([...surfaces.values()], `unique rendered surface at [${x}, ${y}, ${z}]`).toHaveLength(1);
}

function solid(environment: EnvironmentModel, id: string, position: SolidSpec['position'], size: SolidSpec['size']): void {
  const matches = environment.solids.filter(value => value.id === id);
  expect(matches, id).toHaveLength(1);
  expect(matches[0].position, `${id} position`).toEqual(position);
  expect(matches[0].size, `${id} size`).toEqual(size);
  expect(matches[0].rotationY ?? 0, `${id} rotation`).toBe(0);
}

describe('single rendered ground surface without changing collision support', () => {
  it.each(['childhood', 'mainhall'] as const)('%s has one surface through the west doorway, landing and stair transitions', scenario => {
    const environment = buildEnvironment(scenario);
    try {
      environment.setFacts?.(['history-gate-open']);
      oneSurface(environment, -21.7, 6); // Old foundation/main-floor overlap.
      oneSurface(environment, -22.2, 6); // Old foundation/landing overlap.
      oneSurface(environment, -24.97, 6);
      oneSurface(environment, -25.25, 6, -0.15);
      oneSurface(environment, -32.25, 6, -2.25);
      oneSurface(environment, -32.55, 6, -2.4);
      solid(environment, 'history-main-floor', [6, -0.2, -1], [56, 0.4, 54]);
      solid(environment, 'history-lower-floor', [-35, -2.6, -1], [26, 0.4, 54]);
      solid(environment, 'history-west-foundation', [-22, -1.2, -1], [0.7, 2.4, 54]);
      solid(environment, 'history-west-landing', [-23.5, -1.2, 6], [3, 2.4, 6]);
      expect(environment.solids.filter(value => value.id.startsWith('history-stair-'))).toHaveLength(15);
      expect(environment.solids.find(value => value.id === 'history-stair-0')).toMatchObject({
        position: [-25.25, expect.closeTo(-1.275, 8), 6], size: [0.5, 2.25, 6],
      });
      expect(environment.solids.find(value => value.id === 'history-stair-14')).toMatchObject({
        position: [-32.25, expect.closeTo(-2.325, 8), 6], size: [0.5, expect.closeTo(0.15, 8), 6],
      });
    } finally { environment.dispose(); }
  });

  it('has one surface on both sides of all six bridge ends, including the exposed support corners', () => {
    const environment = buildEnvironment('escort');
    try {
      ESCORT.bridgeSpans.forEach((span, index) => {
        const z = (span.minZ + span.maxZ) / 2;
        for (const [end, outward] of [[span.minX, -1], [span.maxX, 1]]) {
          oneSurface(environment, end + outward * 0.03, z); // Bank side inside the old 6 cm overlap.
          oneSurface(environment, end - outward * 0.03, z); // Bridge side must remain covered.
          for (const cornerZ of [span.minZ + 0.1, span.maxZ - 0.1]) oneSurface(environment, end + outward * 0.1, cornerZ);
        }
        solid(environment, `escort-bridge-${index}-deck`, [(span.minX + span.maxX) / 2, -0.23, z],
          [span.maxX - span.minX + 0.12, 0.46, span.maxZ - span.minZ]);
      });
      solid(environment, 'escort-bank--132', [-51, -0.2, -6], [162, 0.4, 124]);
      solid(environment, 'escort-bank--308', [-241, -0.2, -6], [134, 0.4, 124]);
      solid(environment, 'escort-bank--430', [-390, -0.2, -6], [80, 0.4, 124]);
    } finally { environment.dispose(); }
  });

  it.each([
    { scenario: 'rescue', x: -8, z: 182 },
    { scenario: 'medical', x: -398, z: 72 },
    { scenario: 'epilogue', x: -390, z: 94 },
  ] satisfies Array<{ scenario: ScenarioId; x: number; z: number }>)('$scenario no longer draws a second world-sized ground box', ({ scenario, x, z }) => {
    const environment = buildEnvironment(scenario);
    try {
      oneSurface(environment, x, z);
      if (scenario === 'rescue') {
        expect(environment.solids.filter(value => value.id.startsWith('rescue-ground-'))).toHaveLength(91);
        solid(environment, 'rescue-ground--430-40', [-410, -0.2, 60], [40.04, 0.4, 40.04]);
        solid(environment, 'rescue-ground-50-280', [60, -0.2, 290], [20.04, 0.4, 20.04]);
      } else if (scenario === 'medical') {
        solid(environment, 'medical-ground', [-402, -0.2, 58], [44, 0.4, 52]);
      } else {
        solid(environment, 'epilogue-ground', [-200, -0.2, 45], [460, 0.4, 110]);
      }
    } finally { environment.dispose(); }
  });
});
