import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Bone, Quaternion, SkinnedMesh, Texture, Vector3, type Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_ASSETS, canonicalWalkSource } from '../src/assets/character-catalog';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { ImportedCharacter } from '../src/presentation/ImportedCharacter';
import { sampleCharacterGait } from '../src/presentation/CharacterMotion';

const baseURL = 'https://example.invalid/game/index.html';
const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach(fn => fn()));

/** Actual GLB skeleton/skin/clip data; image decode only is replaced for Node. */
async function template(source: ModelSource): Promise<ModelTemplate> {
  const bytes = readFileSync(new URL(`../public/models/${source.url.split('/models/')[1]}`, import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'node-image-decode-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
}
async function character(id = 'CH-LU') {
  const library = new ModelLibrary(template); cleanup.push(() => library.dispose());
  const asset = CHARACTER_ASSETS.find(asset => asset.id === id)!;
  const view = new ImportedCharacter(library, { id, name: asset.label, role: id === 'CH-LU-CHILD' ? 'child' : id === 'CH-ENEMY' ? 'enemy' : 'civilian' }, baseURL);
  cleanup.push(() => view.dispose()); await view.ready;
  expect(view.root.userData.assetStatus).toBe('ready'); expect(view.root.userData.assetId).toBe(asset.id); return view;
}
const idle = { walk: 0, aiming: false, down: false, armed: false };
function bones(root: Group) {
  const result = new Map<string, { position: Vector3; quaternion: Quaternion }>();
  root.updateWorldMatrix(true, true);
  root.traverse(object => {
    if (object instanceof Bone) result.set(object.name, { position: object.getWorldPosition(new Vector3()), quaternion: object.getWorldQuaternion(new Quaternion()).normalize() });
  });
  return result;
}
function difference(a: ReturnType<typeof bones>, b: ReturnType<typeof bones>) {
  let angle = 0, displacement = 0;
  for (const [name, pose] of a) {
    angle = Math.max(angle, pose.quaternion.angleTo(b.get(name)!.quaternion));
    displacement = Math.max(displacement, pose.position.distanceTo(b.get(name)!.position));
  }
  return { angle, displacement };
}
function skinPoints(root: Group) {
  const points: Vector3[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse(object => {
    if (object instanceof SkinnedMesh) {
      for (let i = 0; i < object.geometry.getAttribute('position').count; i += 31) {
        points.push(object.getVertexPosition(i, new Vector3()).applyMatrix4(object.matrixWorld));
      }
    }
  });
  return points;
}

describe('real character motion continuity', () => {
  it('measures the actual canonical in-place loop seam separately from forward root travel', async () => {
    const canonical = await template(canonicalWalkSource(baseURL));
    const clip = canonical.animations.find(clip => clip.name === 'walk_in_place')!;
    let maxAngle = 0, maxTranslation = 0;
    for (const track of clip.tracks) {
      const stride = track.getValueSize(), first = track.values.slice(0, stride), last = track.values.slice(-stride);
      if (track.name.endsWith('.quaternion')) maxAngle = Math.max(maxAngle, new Quaternion().fromArray(first).normalize().angleTo(new Quaternion().fromArray(last).normalize()));
      else if (track.name.endsWith('.position')) maxTranslation = Math.max(maxTranslation, new Vector3().fromArray(first).distanceTo(new Vector3().fromArray(last)));
    }
    expect(clip.tracks).toHaveLength(123); expect(maxAngle).toBeLessThan(0.001); expect(maxTranslation).toBeLessThan(0.0001);
  });

  it('does not change a rendered pose when a high-refresh renderer repeats one simulation frame', async () => {
    const view = await character();
    view.setPose({ ...idle, walk: 2.3 });
    const first = bones(view.root), points = skinPoints(view.root);
    for (let repeat = 0; repeat < 4; repeat++) {
      view.setPose({ ...idle, walk: 2.3 });
      const delta = difference(first, bones(view.root)), next = skinPoints(view.root);
      const vertexDisplacement = Math.max(...points.map((point, index) => point.distanceTo(next[index])));
      expect({ ...delta, vertexDisplacement }).toEqual({ angle: expect.closeTo(0, 6), displacement: expect.closeTo(0, 6), vertexDisplacement: expect.closeTo(0, 6) });
    }
  });

  it('recreates the same walk after another procedural pose and after an exact loop wrap', async () => {
    const view = await character('CH-LU-CHILD');
    const walk = view.root.userData.calibration.strideMeters * 4 * 0.38;
    view.setPose({ ...idle, walk }); const first = bones(view.root);
    view.setPose({ ...idle, walk, aiming: true, armed: true, lookAway: 0.4 });
    view.setPose({ ...idle, walk });
    expect(difference(first, bones(view.root)).angle).toBeLessThan(0.000001);
    view.setPose({ ...idle, walk: walk + view.root.userData.calibration.strideMeters * 4 });
    expect(difference(first, bones(view.root)).angle).toBeLessThan(0.000001);
  });

  it.each(CHARACTER_ASSETS)('$id has continuous, repeatable walk across two whole loops', async asset => {
    const view = await character(asset.id), stride = view.root.userData.calibration.strideMeters;
    let previous: ReturnType<typeof bones> | undefined, maxAngle = 0, maxDisplacement = 0;
    for (let frame = 0; frame <= 240; frame++) {
      const pose = { ...idle, walk: stride * 4 * (0.001 + frame / 120), moveSpeed: 2.1 };
      view.setPose(pose); const current = bones(view.root);
      if (previous) {
        const delta = difference(previous, current);
        maxAngle = Math.max(maxAngle, delta.angle); maxDisplacement = Math.max(maxDisplacement, delta.displacement);
      }
      view.setPose(pose); const repeat = difference(current, bones(view.root));
      expect(repeat.angle).toBeLessThan(0.000001); expect(repeat.displacement).toBeLessThan(0.000001);
      previous = current;
    }
    expect(maxAngle).toBeLessThan(0.2); expect(maxDisplacement).toBeLessThan(asset.heightMeters * 0.06);
    if (process.env.CHARACTER_MOTION_METRICS) console.log(JSON.stringify({ id: asset.id, maxWalkAngle: maxAngle, maxWalkDisplacement: maxDisplacement, strideMeters: stride }));
  });

  it('drives a distinct run, crouch travel and reload from actual motion/action inputs', async () => {
    const view = await character(), walk = 3.4;
    view.setPose({ ...idle, walk, moveSpeed: 2.1 }); const walking = bones(view.root);
    view.setPose({ ...idle, walk, moveSpeed: 4.5 }); const running = bones(view.root);
    expect(view.root.userData.motion.gait).toBe('run'); expect(difference(walking, running).angle).toBeGreaterThan(0.4);
    view.setPose({ ...idle, walk, moveSpeed: 4.5 }); expect(difference(running, bones(view.root)).angle).toBeLessThan(0.000001);
    view.setPose({ ...idle, walk, moveSpeed: 1.35, crouched: true }); const crouched = bones(view.root);
    view.setPose({ ...idle, walk: walk + 0.7, moveSpeed: 1.35, crouched: true });
    expect(view.root.userData.motion.gait).toBe('crouch-walk');
    expect(Math.max(...['L', 'R'].map(side => crouched.get(`${side}_Foot`)!.position.distanceTo(bones(view.root).get(`${side}_Foot`)!.position)))).toBeGreaterThan(0.10);
    view.setPose({ ...idle, walk, moveSpeed: 0 }); const stopped = bones(view.root);
    expect(view.root.userData.motion.gait).toBe('idle');
    view.setPose(idle); expect(difference(stopped, bones(view.root)).angle).toBeLessThan(0.000001);
    // Reload returns to the same armed idle. Its calibrated right-hand grip
    // deliberately differs from the unarmed, relaxed-hand pose above.
    view.setPose({ ...idle, armed: true }); const armedIdle = bones(view.root);
    view.setPose({ ...idle, armed: true, reloadFraction: 0.3 }); const pouch = bones(view.root);
    view.setPose({ ...idle, armed: true, reloadFraction: 0.78 }); const rack = bones(view.root);
    expect(pouch.get('L_Hand')!.position.distanceTo(rack.get('L_Hand')!.position)).toBeGreaterThan(0.2);
    view.setPose({ ...idle, armed: true, reloadFraction: 0.78 }); expect(difference(rack, bones(view.root)).angle).toBeLessThan(0.000001);
    view.setPose({ ...idle, armed: true, reloadFraction: 1 }); expect(difference(armedIdle, bones(view.root)).angle).toBeLessThan(0.000001);
    expect(view.root.position.toArray()).toEqual([0, 0, 0]);
  });

  it.each(['run', 'crouch'] as const)('%s gait keeps planted feet fixed against authoritative world travel and closes the loop', gait => {
    const height = 1.75, stride = sampleCharacterGait(0, height, gait).strideMeters;
    const first = sampleCharacterGait(stride * 0.1, height, gait), next = sampleCharacterGait(stride * 0.2, height, gait);
    expect(first.left.planted && next.left.planted).toBe(true);
    expect(first.left.forward + stride * 0.1).toBeCloseTo(next.left.forward + stride * 0.2, 8);
    const start = sampleCharacterGait(0, height, gait), end = sampleCharacterGait(stride, height, gait);
    expect(start).toEqual(end);
    const almostEnd = sampleCharacterGait(stride * (1 - 1e-6), height, gait);
    expect(Math.abs(start.left.forward - almostEnd.left.forward)).toBeLessThan(0.00001);
  });

  it.each(CHARACTER_ASSETS)('$id keeps procedural poses in its instance culling bounds and preserves skin segment lengths', async asset => {
    const view = await character(asset.id), rest = bones(view.root);
    const segments = ['L', 'R'].flatMap(side => [[`${side}_Thigh`, `${side}_Calf`], [`${side}_Calf`, `${side}_Foot`]]);
    let maxReachError = 0, maxRadiusRatio = 0, worst: unknown;
    for (const gait of ['run', 'crouch'] as const) {
      const legLength = view.root.userData.calibration.legLengthMeters;
      const stride = sampleCharacterGait(0, asset.heightMeters, gait, legLength).strideMeters;
      let first: ReturnType<typeof bones> | undefined, previous: ReturnType<typeof bones> | undefined;
      for (let frame = 0; frame <= 120; frame++) {
        const walk = (frame / 60 + 0.001) * stride * 4;
        const pose = { ...idle, walk, moveSpeed: gait === 'run' ? 4.5 : 1.35, crouched: gait === 'crouch' };
        view.setPose(pose); const current = bones(view.root);
        if (previous) expect(difference(previous, current).angle).toBeLessThan(0.45);
        if (!first) first = current;
        view.setPose(pose); expect(difference(current, bones(view.root)).angle).toBeLessThan(0.000001);
        previous = current;
      }
      expect(difference(first!, previous!).angle).toBeLessThan(0.000001);
      for (let phase = 0; phase < 12; phase++) {
        const distance = stride * phase / 12, sample = sampleCharacterGait(distance, asset.heightMeters, gait, legLength);
        view.setPose({ ...idle, walk: distance * 4, moveSpeed: gait === 'run' ? 4.5 : 1.35, crouched: gait === 'crouch' });
        const current = bones(view.root);
        for (const [start, end] of segments) expect(Math.abs(current.get(start)!.position.distanceTo(current.get(end)!.position)
          - rest.get(start)!.position.distanceTo(rest.get(end)!.position))).toBeLessThan(0.0001);
        for (const side of ['L', 'R'] as const) {
          const target = rest.get(`${side}_Foot`)!.position.clone(), step = side === 'L' ? sample.left : sample.right;
          target.z += step.forward; target.y += step.lift;
          const error = target.distanceTo(current.get(`${side}_Foot`)!.position);
          if (error > maxReachError) {
            maxReachError = error;
            worst = { gait, phase, side, error, target: target.toArray(), hip: current.get(`${side}_Thigh`)!.position.toArray(), actual: current.get(`${side}_Foot`)!.position.toArray(), leg: segments.filter(s => s[0].startsWith(side)).reduce((sum, [a, b]) => sum + rest.get(a)!.position.distanceTo(rest.get(b)!.position), 0) };
          }
        }
        view.root.traverse(object => {
          if (!(object instanceof SkinnedMesh)) return;
          expect(object.visible).toBe(true); expect(object.boundingSphere).not.toBeNull();
          for (let vertex = 0; vertex < object.geometry.getAttribute('position').count; vertex++) {
            const point = object.getVertexPosition(vertex, new Vector3()), sphere = object.boundingSphere!;
            maxRadiusRatio = Math.max(maxRadiusRatio, point.distanceTo(sphere.center) / sphere.radius);
          }
        });
      }
    }
    expect(maxRadiusRatio).toBeLessThan(1); expect(maxReachError, JSON.stringify(worst)).toBeLessThan(0.0001);
    if (process.env.CHARACTER_MOTION_METRICS) process.stdout.write(JSON.stringify({ id: asset.id, maxReachError, maxRadiusRatio }) + '\n');
  });
});
