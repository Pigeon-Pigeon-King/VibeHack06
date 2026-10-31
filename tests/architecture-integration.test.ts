/// <reference types="node" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARCHITECTURE_SOURCES } from '../src/assets/architecture-catalog';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import { GeneratedArchitecture } from '../src/presentation/GeneratedArchitecture';
import { bindArchitecture } from '../src/presentation/architecture-bindings';
import { buildEnvironment } from '../src/presentation/environment';

import { disposeModelTree } from '../src/presentation/model-tools';
import { SCENARIO_IDS } from '../src/contracts';

const baseURL = new URL('../public/', import.meta.url).href;
const reportDir = new URL('../artifacts/asset-coverage-fix-20261031/', import.meta.url);
const reportURL = new URL('architecture-runtime-checks.json', reportDir);
const parsed: string[] = [];
const library = () => new ModelLibrary(async source => {
  const bytes = readFileSync(fileURLToPath(source.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.revision);
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'test-image-decode-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  parsed.push(source.id);
  return { scene: gltf.scene, animations: gltf.animations };
});
const generatedDraws = (root: Group) => { const draws: InstancedMesh[] = []; root.traverse(o => { if (o instanceof InstancedMesh && o.userData.generatedArchitecture) draws.push(o); }); return draws; };

describe('frozen architecture runtime integration', () => {
  it('publishes every level at a local source URL and preserves all frozen hashes', () => {
    expect(ARCHITECTURE_SOURCES).toHaveLength(66);
    expect(new Set(ARCHITECTURE_SOURCES.map(s => s.assetId)).size).toBe(22);
    for (const source of ARCHITECTURE_SOURCES) {
      const bytes = readFileSync(new URL(source.url, baseURL));
      expect(bytes.byteLength).toBe(source.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.revision);
      expect(source.geometryOnly).toBe(!source.id.endsWith(':lod0'));
    }
  });
  it('binds actual structures in every scenario with real GLB geometry and shared LOD materials, preserving colliders', async () => {
    const lib = library(), evidence: unknown[] = [], used = new Set<string>();
    for (const scenario of SCENARIO_IDS) {
      const env = buildEnvironment(scenario), solids = JSON.stringify(env.solids), bindings = bindArchitecture(env.root, scenario);
      expect(bindings.filter(b => b.error)).toEqual([]);
      expect(bindings.some(g => g.targets.length)).toBe(true);
      const owner = new GeneratedArchitecture(lib, { parent: env.root, scenario, baseURL });
      const statuses = await owner.ready;
      expect(statuses.filter(s => s.state !== 'ready')).toEqual([]);
      expect(JSON.stringify(env.solids)).toBe(solids);
      const coverage = owner.coverage();
      for (const source of coverage.sources) used.add(source.sourceId.split(':')[0]);
      const near = new Vector3(scenario === 'medical' ? -402 : 0, 1.7, scenario === 'medical' ? 58 : 0);
      owner.update(near); const draws = generatedDraws(env.root);
      for (const draw of draws) {
        const base = draws.find(d => d.userData.generatedArchitecture.assetId === draw.userData.generatedArchitecture.assetId && d.userData.generatedArchitecture.sourceId.endsWith(':lod0'));
        expect(draw.material).toBe(base!.material);
      }
      const budget = { lod0: { instances: 0, drawBatches: 0, triangles: 0 }, lod1: { instances: 0, drawBatches: 0, triangles: 0 }, lod2: { instances: 0, drawBatches: 0, triangles: 0 } };
      for (const draw of draws) {
        const level = draw.userData.generatedArchitecture.sourceId.split(':').at(-1) as keyof typeof budget;
        // The full per-LOD capacity is the maximum if every placement selected that
        // level, before view-frustum culling; it is not a measured render cost.
        const count = draw.instanceMatrix.count;
        budget[level].instances += count; budget[level].drawBatches++;
        budget[level].triangles += count * (draw.geometry.index?.count ?? draw.geometry.getAttribute('position').count) / 3;
      }
      const nearEstimate = draws.filter(d => d.visible).reduce((r, d) => ({ drawBatches: r.drawBatches + 1, triangles: r.triangles + d.count * (d.geometry.index?.count ?? d.geometry.getAttribute('position').count) / 3 }), { drawBatches: 0, triangles: 0 });
      owner.update(new Vector3(10000, 10000, 10000));
      expect(draws.filter(d => d.visible).every(d => d.userData.generatedArchitecture.sourceId.endsWith(':lod2'))).toBe(true);
      evidence.push({ scenario, statuses, sourceCount: coverage.sources.length, placements: statuses.reduce((n, s) => n + (s.placements ?? 0), 0), sourceIds: coverage.sources.map(s => s.sourceId), ownedDrawBatches: draws.length, maximumByLOD: budget, nearPointBeforeFrustum: { point: near.toArray(), ...nearEstimate }, unchangedSolids: true,
        fallbackTargets: bindings.map(b => ({ id: b.id, targets: b.targets.map(t => ({ name: t.mesh.name, indices: t.indices })) })), uncoveredVisualScopes: coverage.visible.length, plan: coverage.plan });
      owner.dispose(); expect(generatedDraws(env.root)).toHaveLength(0); env.dispose();
    }
    lib.dispose();
    expect(used.has('ARCH-FLOOR-METAL')).toBe(true); expect(used.has('ARCH-WALL-PAINT')).toBe(true);
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(reportURL, JSON.stringify({ scope: 'Real GLB node/index/attribute/material parsing, image decode mocked; no WebGL/browser/visual/performance acceptance', uniqueAssets: used.size, uniqueSourcesParsed: new Set(parsed).size, actualScenarios: evidence }, null, 2) + '\n');
  }, 60000);
  it('cancels a preparing owner, preserves all fallback matrices and releases late source results', async () => {
    const env = buildEnvironment('medical'), before = new Map<InstancedMesh, Float32Array>();
    env.root.traverse(o => { if (o instanceof InstancedMesh) before.set(o, new Float32Array(o.instanceMatrix.array)); });
    let finish!: () => void;
    const late = new Promise<void>(resolve => { finish = resolve; });
    const geometry = new BoxGeometry(), material = new MeshStandardMaterial();
    const geometryDisposed = vi.spyOn(geometry, 'dispose'), materialDisposed = vi.spyOn(material, 'dispose');
    const lib = new ModelLibrary(async () => { await late; const scene = new Group(); scene.add(new Mesh(geometry, material)); return { scene, animations: [] }; });
    const owner = new GeneratedArchitecture(lib, { parent: env.root, scenario: 'medical', baseURL });
    await new Promise(resolve => setTimeout(resolve, 0));
    owner.dispose(); finish();
    expect((await owner.ready).every(s => s.state === 'cancelled')).toBe(true);
    for (const [mesh, matrix] of before) expect([...mesh.instanceMatrix.array]).toEqual([...matrix]);
    expect(generatedDraws(env.root)).toHaveLength(0); env.dispose(); lib.dispose();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(geometryDisposed).toHaveBeenCalled(); expect(materialDisposed).toHaveBeenCalled();
  });
  it('keeps shared library materials live while a second environment still owns a lease', async () => {
    const a = buildEnvironment('medical'), b = buildEnvironment('medical'), lib = library();
    const one = new GeneratedArchitecture(lib, { parent: a.root, scenario: 'medical', baseURL });
    const two = new GeneratedArchitecture(lib, { parent: b.root, scenario: 'medical', baseURL });
    await Promise.all([one.ready, two.ready]);
    const first = generatedDraws(a.root)[0], second = generatedDraws(b.root)[0];
    expect(first.material).toBe(second.material);
    const material = Array.isArray(second.material) ? second.material[0] : second.material;
    const released = vi.spyOn(material, 'dispose');
    one.dispose(); a.dispose(); expect(released).not.toHaveBeenCalled();
    two.update(new Vector3(-402, 1.7, 58)); expect(generatedDraws(b.root).some(draw => draw.visible)).toBe(true);
    two.dispose(); b.dispose(); expect(released).toHaveBeenCalledTimes(1); lib.dispose();
  }, 30000);
  it('generic environment disposal invokes architecture cancellation before shared geometry traversal', async () => {
    const env = buildEnvironment('medical'), lib = library();
    const owner = new GeneratedArchitecture(lib, { parent: env.root, scenario: 'medical', baseURL });
    expect((await owner.ready).every(s => s.state === 'ready')).toBe(true);
    disposeModelTree(env.root); expect(generatedDraws(env.root)).toHaveLength(0); owner.dispose(); lib.dispose();
  }, 30000);
});
