import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mesh, PlaneGeometry, Raycaster, Vector3 } from 'three';
import type { Object3D } from 'three';
import { SCENARIO_IDS } from '../src/contracts';
import { buildEnvironment } from '../src/presentation/environment';

function signs(root: Object3D): Array<Mesh<PlaneGeometry>> {
  const result: Array<Mesh<PlaneGeometry>> = [];
  root.traverse(object => {
    if (object instanceof Mesh && object.geometry instanceof PlaneGeometry && object.name.startsWith('sign-')) result.push(object);
  });
  return result;
}

function visible(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}

describe('minimal physical world signage', () => {
  beforeEach(() => {
    // Only the drawing API is replaced. Production builders, meshes, transforms
    // and Three raycasts run unchanged; this is not a browser rendering test.
    vi.stubGlobal('document', {
      createElement(tag: string) {
        expect(tag).toBe('canvas');
        return { width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }) };
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(SCENARIO_IDS)('%s keeps brief signs against existing physical surfaces', scenario => {
    const environment = buildEnvironment(scenario);
    try {
      // The retained signs must stay on fixed structure when nearby doors open.
      environment.setFacts?.([
        'history-gate-open', 'checkpoint-open', 'yard-open', 'transfer-gate-open',
        'escort-convoy-started', 'reception-door-open',
      ]);
      environment.root.updateMatrixWorld(true);
      const textPlanes = signs(environment.root);
      const backing: Object3D[] = [];
      environment.root.traverse(object => {
        if (object instanceof Mesh && !object.name.startsWith('sign-') && visible(object)) backing.push(object);
      });
      // Eight includes the shared S05 and S06 entrances carried forward to S07.
      expect(textPlanes.length).toBeLessThanOrEqual(8);
      for (const sign of textPlanes) {
        const text = sign.name.slice('sign-'.length);
        expect(text.length, text).toBeLessThanOrEqual(8);
        expect(text, 'task commentary does not belong on world planes').not.toMatch(/接防线|观察位|接力位|补给|到站核对|机动力量|继续治疗|战斗通路|首批进场|维护中|交接|接应|\//);
        const { width, height } = sign.geometry.parameters;
        const direction = new Vector3(0, 0, -1).transformDirection(sign.matrixWorld);
        const supports = new Set<string>();
        for (const [x, y] of [[0, 0], [-0.49, -0.49], [-0.49, 0.49], [0.49, -0.49], [0.49, 0.49]]) {
          const origin = new Vector3(x * width, y * height, 0).applyMatrix4(sign.matrixWorld);
          const hit = new Raycaster(origin, direction, 0.001, 0.1).intersectObjects(backing, false)[0];
          expect(hit, `${scenario}: ${text} at local [${x}, ${y}] needs backing within 10 cm`).toBeDefined();
          if (hit) supports.add(`${hit.object.uuid}:${hit.instanceId ?? 'mesh'}`);
        }
        // A central pole or two edge posts do not make a complete signboard.
        expect(supports.size, `${scenario}: ${text} backing`).toBe(1);
      }
      if (scenario === 'rescue' || scenario === 'handover') expect(textPlanes).toHaveLength(0);
    } finally { environment.dispose(); }
  });

  it('retains useful real gate and exit signs instead of disabling all world text', () => {
    const gate = buildEnvironment('frontgate');
    const hall = buildEnvironment('mainhall');
    try {
      expect(gate.root.getObjectByName('sign-查验口')).toBeInstanceOf(Mesh);
      expect(gate.root.getObjectByName('sign-内门')).toBeInstanceOf(Mesh);
      expect(hall.root.getObjectByName('sign-正门')).toBeInstanceOf(Mesh);
      expect(hall.root.getObjectByName('sign-检修出口 ←')).toBeInstanceOf(Mesh);
    } finally { gate.dispose(); hall.dispose(); }
  });
});
