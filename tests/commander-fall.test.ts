import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Bone, PerspectiveCamera, Quaternion, SkinnedMesh, Texture, Vector3, type Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelSource, ModelTemplate } from '../src/assets/model-contracts';
import { OPENING_TIMELINE } from '../src/content/opening-timeline';
import { HISTORY as H } from '../src/content/history-layout';
import { OPENING_COMMANDER_FALL_SECONDS, OPENING_JAM_VERSION, openingHallGaze, openingShaoPosition } from '../src/content/OpeningStaging';
import { ImportedCharacter } from '../src/presentation/ImportedCharacter';
import { openingView } from '../src/presentation/OpeningView';
import { createCharacter } from '../src/presentation/characters';

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach(fn => fn()));
const T = OPENING_TIMELINE.mainhall;
const facts = ['history-timeline-v2', OPENING_JAM_VERSION, 'history-collapse', 'zhao-captured', 'zhao-executed'];
const frame = (time: number) => ({ scenario: 'mainhall' as const, phase: 4, phaseTime: time, lowMotion: false });
const base = { walk: 0, aiming: false, armed: false, down: false, kneeling: true, restrained: true };
async function template(source: ModelSource): Promise<ModelTemplate> {
  const bytes = readFileSync(new URL(`../public/models/${source.url.split('/models/')[1]}`, import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'node-image-decode-only', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { scene: gltf.scene, scenes: gltf.scenes, animations: gltf.animations };
}
function sample(root: Group) {
  root.updateWorldMatrix(true, true);
  const joints = new Map<string, { p: Vector3; q: Quaternion }>(), skin: Vector3[] = [];
  root.traverse(object => {
    if (object instanceof Bone) joints.set(object.name, { p: object.getWorldPosition(new Vector3()), q: object.getWorldQuaternion(new Quaternion()).normalize() });
    if (object instanceof SkinnedMesh) for (let i = 0; i < object.geometry.getAttribute('position').count; i += 37) {
      skin.push(object.getVertexPosition(i, new Vector3()).applyMatrix4(object.matrixWorld));
    }
  });
  return { joints, skin };
}
function delta(a: ReturnType<typeof sample>, b: ReturnType<typeof sample>) {
  return { angle: Math.max(...[...a.joints].map(([name, joint]) => joint.q.angleTo(b.joints.get(name)!.q))),
    joint: Math.max(...[...a.joints].map(([name, joint]) => joint.p.distanceTo(b.joints.get(name)!.p))),
    skin: Math.max(...a.skin.map((point, i) => point.distanceTo(b.skin[i]))) };
}

describe('commander hit, support loss and landing', () => {
  it('uses saved story time, keeps the kneel origin, and never replays an old executed save', () => {
    const before = openingView(frame(T.execution - 0.01), facts.filter(f => f !== 'zhao-executed'));
    expect(before.commanderFallProgress).toBe(0); expect(before.commanderKneeling && before.commanderRestrained).toBe(true);
    const middle = openingView(frame(T.execution + OPENING_COMMANDER_FALL_SECONDS / 2), facts);
    expect(middle.commanderFallProgress).toBeCloseTo(0.5); expect(middle.commanderKneeling && middle.commanderRestrained).toBe(true);
    expect(openingView(frame(T.execution + OPENING_COMMANDER_FALL_SECONDS / 2), structuredClone(facts))).toEqual(middle);
    expect(openingView(frame(T.execution + OPENING_COMMANDER_FALL_SECONDS), facts).commanderFallProgress).toBe(1);
    for (const old of [facts.filter(f => f !== OPENING_JAM_VERSION), facts.filter(f => f !== 'history-timeline-v2')]) {
      expect(openingView(frame(0), old).commanderFallProgress).toBe(1);
    }
    expect(openingView({ ...frame(0), phase: 5 }, facts).commanderFallProgress).toBe(1);
    expect(openingView({ ...frame(T.execution), scenario: 'childhood' }, facts).commanderKneeling).toBe(false);
  });

  it('starts from the actual Zhao restrained mesh, stays continuous at 60Hz, and ends in the shared fallen pose', async () => {
    const library = new ModelLibrary(template); cleanup.push(() => library.dispose());
    const view = new ImportedCharacter(library, { id: 'zhao', name: '赵启明', role: 'ally' }, 'https://example.invalid/game/index.html');
    cleanup.push(() => view.dispose()); await view.ready;
    expect(view.root.userData.assetStatus).toBe('ready'); expect(view.root.userData.assetId).toBe('CH-ZHAO');
    view.setPose(base); const kneel = sample(view.root);
    expect(kneel.joints.size).toBe(41); expect(kneel.skin.length).toBeGreaterThan(50);
    view.setPose({ ...base, down: true, fallProgress: 0 });
    for (const value of Object.values(delta(kneel, sample(view.root)))) expect(value).toBeLessThan(0.000001);
    let previous = kneel, maxStep = 0, maxAngle = 0, maxHeight = -Infinity;
    const segments = ['L', 'R'].flatMap(side => [[`${side}_Thigh`, `${side}_Calf`], [`${side}_Calf`, `${side}_Foot`], [`${side}_Upperarm`, `${side}_Forearm`]]);
    for (let tick = 0; tick <= 75; tick++) {
      const pose = { ...base, down: true, fallProgress: tick / 75 };
      view.setPose(pose); const current = sample(view.root), difference = delta(previous, current);
      maxStep = Math.max(maxStep, difference.skin); maxAngle = Math.max(maxAngle, difference.angle);
      maxHeight = Math.max(maxHeight, current.joints.get('Head')!.p.y);
      for (const [a, b] of segments) expect(current.joints.get(a)!.p.distanceTo(current.joints.get(b)!.p))
        .toBeCloseTo(kneel.joints.get(a)!.p.distanceTo(kneel.joints.get(b)!.p), 5);
      view.setPose(pose);
      for (const value of Object.values(delta(current, sample(view.root)))) expect(value).toBeLessThan(0.000001);
      previous = current;
    }
    if (process.env.OPENING_JAM_METRICS) console.log(JSON.stringify({ maxStep, maxAngle, kneelHead: kneel.joints.get('Head')!.p.y, maxHeight,
      landedHead: previous.joints.get('Head')!.p.y, lowestSkin: Math.min(...previous.skin.map(point => point.y)) }));
    expect(maxStep).toBeLessThan(0.09); expect(maxAngle).toBeLessThan(0.15);
    expect(maxHeight).toBeLessThan(kneel.joints.get('Head')!.p.y + 0.06);
    expect(previous.joints.get('Head')!.p.y).toBeLessThan(0.45);
    expect(Math.min(...previous.skin.map(point => point.y))).toBeGreaterThan(-0.02);
    view.setPose({ ...base, down: true, fallProgress: 1, kneeling: false, restrained: false });
    for (const value of Object.values(delta(previous, sample(view.root)))) expect(value).toBeLessThan(0.000001);

    const shao = new ImportedCharacter(library, { id: 'shao', name: '邵原', role: 'opponent' }, 'https://example.invalid/game/index.html');
    cleanup.push(() => shao.dispose()); await shao.ready; expect(shao.root.userData.assetStatus).toBe('ready');
    const projection: unknown[] = [];
    for (const aspect of [16 / 9, 9 / 16]) for (const time of [T.recognition, T.execution, T.execution + 0.625, T.execution + 1.25]) {
      const camera = new PerspectiveCamera(75, aspect, 0.045, 1000), gaze = openingHallGaze(time);
      camera.position.set(H.rubblePlayer[0], 0.51, H.rubblePlayer[2]); camera.rotation.set(gaze.pitch, gaze.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
      view.root.position.fromArray(H.zhaoCaptured); view.root.rotation.y = Math.PI / 2;
      view.setPose({ ...base, down: time >= T.execution, fallProgress: Math.max(0, (time - T.execution) / 1.25) });
      shao.root.position.fromArray(openingShaoPosition(time)); shao.root.rotation.y = -Math.PI / 2;
      shao.setPose({ walk: 0, aiming: time >= T.execution, down: false, armed: true });
      for (const [id, character] of [['zhao', view], ['shao', shao]] as const) {
        const projected = sample(character.root).skin.map(point => point.project(camera));
        expect(projected.every(point => Math.abs(point.x) < 0.95 && Math.abs(point.y) < 0.95 && point.z > -1 && point.z < 1), `${id} at ${time}, aspect ${aspect}`).toBe(true);
        const height = (Math.max(...projected.map(point => point.y)) - Math.min(...projected.map(point => point.y))) / 2;
        if (time === T.execution && id === 'zhao') expect(height).toBeGreaterThan(0.07);
        if (time === T.recognition && id === 'shao') expect(height).toBeGreaterThan(0.025);
        projection.push({ id, aspect, time, heightFraction: height });
      }
    }
    if (process.env.OPENING_JAM_METRICS) console.log(JSON.stringify({ projection }));
  }, 15000);

  it('also preserves a kneeling origin while the GLB is unavailable', () => {
    const fallback = createCharacter('ally'); cleanup.push(() => fallback.dispose());
    const state = () => {
      const values: number[] = [];
      fallback.root.traverse(object => values.push(...object.position.toArray(), ...object.quaternion.toArray())); return values;
    };
    fallback.setPose(base); const kneel = state();
    fallback.setPose({ ...base, down: true, fallProgress: 0 }); expect(state()).toEqual(kneel);
    fallback.setPose({ ...base, down: true, fallProgress: 0.55 });
    const middle = fallback.root.getObjectByName('pose-root')!.rotation.x;
    expect(middle).toBeGreaterThan(0.2); expect(middle).toBeLessThan(Math.PI / 2);
    fallback.setPose({ ...base, down: true, fallProgress: 1 });
    expect(fallback.root.getObjectByName('pose-root')!.rotation.x).toBeCloseTo(Math.PI / 2);
  });
});
