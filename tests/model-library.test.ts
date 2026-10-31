import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationClip, Bone, BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, ShaderMaterial, Skeleton, SkinnedMesh, Texture, Uint16BufferAttribute, VectorKeyframeTrack } from 'three';
import { ModelLibrary } from '../src/assets/ModelLibrary';
import type { ModelLoader, ModelLoadProgress, ModelSource, ModelTemplate } from '../src/assets/model-contracts';

const source: ModelSource = { id: 'test-model', revision: '1', url: './assets/models/test.glb' };
const libraries: ModelLibrary[] = [];
function library(loader?: ModelLoader): ModelLibrary {
  const value = new ModelLibrary(loader); libraries.push(value); return value;
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function model() {
  const image = { close: vi.fn() }, map = new Texture(image as unknown as ImageBitmap), normalMap = new Texture(image as unknown as ImageBitmap);
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial({ map, normalMap });
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const mesh = new SkinnedMesh(geometry, material); mesh.name = 'Body';
  const bone = new Bone(); bone.name = 'RigBone'; mesh.add(bone);
  const skeleton = new Skeleton([bone]); mesh.bind(skeleton); skeleton.computeBoneTexture();
  const scene = new Group(); scene.add(mesh);
  const inactive = new Group(), unusedGeometry = new BoxGeometry(), unusedMaterial = new MeshStandardMaterial({ map });
  inactive.add(new Mesh(unusedGeometry, unusedMaterial));
  const clip = new AnimationClip('move', 1, [new VectorKeyframeTrack('RigBone.position', [0, 1], [0, 0, 0, 2, 0, 0])]);
  const template: ModelTemplate = { scene, scenes: [scene, inactive], animations: [clip] };
  const disposed = {
    geometry: vi.fn(), material: vi.fn(), map: vi.fn(), normalMap: vi.fn(), bone: vi.fn(), unusedGeometry: vi.fn(), unusedMaterial: vi.fn(),
  };
  geometry.addEventListener('dispose', disposed.geometry); material.addEventListener('dispose', disposed.material);
  map.addEventListener('dispose', disposed.map); normalMap.addEventListener('dispose', disposed.normalMap);
  skeleton.boneTexture!.addEventListener('dispose', disposed.bone);
  unusedGeometry.addEventListener('dispose', disposed.unusedGeometry); unusedMaterial.addEventListener('dispose', disposed.unusedMaterial);
  return { template, mesh, bone, skeleton, geometry, material, map, image, clip, disposed };
}
afterEach(() => { for (const value of libraries.splice(0)) value.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ModelLibrary shared template ownership', () => {
  it('shares one in-flight load and GPU assets while cloning bones and animation state', async () => {
    const fixture = model(), pending = deferred<ModelTemplate>();
    const loader = vi.fn<ModelLoader>(() => pending.promise), assets = library(loader);
    const first = assets.acquire(source), second = assets.acquire({ ...source });
    expect(loader).toHaveBeenCalledTimes(1);
    pending.resolve(fixture.template);
    const [a, b] = await Promise.all([first, second]);
    const meshA = a.root.getObjectByName('Body') as SkinnedMesh, meshB = b.root.getObjectByName('Body') as SkinnedMesh;
    expect(a.root).not.toBe(b.root); expect(a.root).not.toBe(fixture.template.scene);
    expect(meshA.geometry).toBe(meshB.geometry); expect(meshA.geometry).toBe(fixture.geometry);
    expect(meshA.material).toBe(meshB.material); expect(meshA.material).toBe(fixture.material);
    expect((meshA.material as MeshStandardMaterial).map).toBe(fixture.map);
    expect(meshA.skeleton).not.toBe(meshB.skeleton); expect(meshA.skeleton).not.toBe(fixture.skeleton);
    expect(meshA.skeleton.bones[0]).toBe(a.root.getObjectByName('RigBone'));
    expect(meshB.skeleton.bones[0]).toBe(b.root.getObjectByName('RigBone'));
    expect(a.mixer).not.toBe(b.mixer);
    a.mixer.clipAction(a.animations[0]).play(); b.mixer.clipAction(b.animations[0]).play();
    a.mixer.update(0.25); b.mixer.update(0.75);
    expect(meshA.skeleton.bones[0].position.x).toBeCloseTo(0.5);
    expect(meshB.skeleton.bones[0].position.x).toBeCloseTo(1.5);
    expect(fixture.bone.position.x).toBe(0);

    meshA.skeleton.computeBoneTexture(); meshB.skeleton.computeBoneTexture();
    const boneA = vi.fn(), boneB = vi.fn();
    meshA.skeleton.boneTexture!.addEventListener('dispose', boneA); meshB.skeleton.boneTexture!.addEventListener('dispose', boneB);
    const parent = new Group(); parent.add(a.root, b.root);
    a.dispose(); a.dispose();
    expect(a.root.parent).toBeNull(); expect(b.root.parent).toBe(parent);
    expect(a.mixer.existingAction(fixture.clip)).toBeNull();
    expect(b.mixer.existingAction(fixture.clip)).not.toBeNull();
    expect(boneA).toHaveBeenCalledTimes(1); expect(boneB).not.toHaveBeenCalled();
    for (const spy of Object.values(fixture.disposed)) expect(spy).not.toHaveBeenCalled();
    expect(fixture.image.close).not.toHaveBeenCalled();
    b.dispose(); b.dispose();
    expect(boneB).toHaveBeenCalledTimes(1);
    for (const spy of Object.values(fixture.disposed)) expect(spy).toHaveBeenCalledTimes(1);
    expect(fixture.image.close).toHaveBeenCalledTimes(1);
  });

  it('reuses a ready template and reloads only after its last lease is released', async () => {
    const firstModel = model(), secondModel = model();
    const loader = vi.fn<ModelLoader>().mockResolvedValueOnce(firstModel.template).mockResolvedValueOnce(secondModel.template);
    const assets = library(loader), a = await assets.acquire(source), b = await assets.acquire(source);
    expect(loader).toHaveBeenCalledTimes(1);
    a.dispose(); expect(firstModel.disposed.geometry).not.toHaveBeenCalled();
    b.dispose(); expect(firstModel.disposed.geometry).toHaveBeenCalledTimes(1);
    const c = await assets.acquire(source); expect(loader).toHaveBeenCalledTimes(2); c.dispose();
    expect(secondModel.disposed.geometry).toHaveBeenCalledTimes(1);
  });

  it('separates entries by all of id, revision and URL', async () => {
    const loader = vi.fn<ModelLoader>(async () => model().template), assets = library(loader);
    const leases = await Promise.all([
      assets.acquire(source), assets.acquire({ ...source, id: 'other' }),
      assets.acquire({ ...source, revision: '2' }), assets.acquire({ ...source, url: './other.glb' }),
    ]);
    expect(loader).toHaveBeenCalledTimes(4); for (const lease of leases) lease.dispose();
  });

  it('disposes nested shader uniform textures and shared bitmap images only once', async () => {
    const scene = new Group(), image = { close: vi.fn() }, map = new Texture(image as unknown as ImageBitmap);
    const uniforms: Record<string, unknown> = { map: { value: [{ nested: map }, map] } }; uniforms.cycle = uniforms;
    const material = new ShaderMaterial(); material.uniforms = uniforms as ShaderMaterial['uniforms'];
    const mesh = new Mesh(new BoxGeometry(), material); scene.add(mesh);
    const textureDisposed = vi.fn(); map.addEventListener('dispose', textureDisposed);
    const assets = library(async () => ({ scene, scenes: [scene, scene], animations: [] }));
    const lease = await assets.acquire(source); lease.dispose(); assets.dispose();
    expect(textureDisposed).toHaveBeenCalledTimes(1); expect(image.close).toHaveBeenCalledTimes(1);
  });

  it('releases every live lease when the owner is disposed, and rejects future acquisition', async () => {
    const fixture = model(), assets = library(async () => fixture.template);
    const [a, b] = await Promise.all([assets.acquire(source), assets.acquire(source)]);
    const parent = new Group(); parent.add(a.root, b.root);
    assets.dispose(); assets.dispose(); a.dispose(); b.dispose();
    expect(parent.children).toHaveLength(0);
    for (const spy of Object.values(fixture.disposed)) expect(spy).toHaveBeenCalledTimes(1);
    expect(fixture.image.close).toHaveBeenCalledTimes(1);
    await expect(assets.acquire(source)).rejects.toThrow('已释放');
  });
});

describe('ModelLibrary asynchronous lifetime', () => {
  it('cancels one waiter without cancelling another or changing its progress', async () => {
    const fixture = model(), pending = deferred<ModelTemplate>();
    let sharedSignal!: AbortSignal, report!: (value: ModelLoadProgress) => void;
    const assets = library((_, signal, progress) => { sharedSignal = signal; report = progress; return pending.promise; });
    const cancel = new AbortController(), firstProgress = vi.fn(), secondProgress = vi.fn();
    const first = assets.acquire(source, { signal: cancel.signal, onProgress: firstProgress });
    report({ phase: 'download', received: 4 });
    const second = assets.acquire(source, { onProgress: secondProgress });
    expect(secondProgress).toHaveBeenLastCalledWith({ phase: 'download', received: 4 });
    cancel.abort(); await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(sharedSignal.aborted).toBe(false);
    report({ phase: 'download', received: 8, total: 10 });
    expect(firstProgress).toHaveBeenCalledTimes(1);
    expect(secondProgress).toHaveBeenLastCalledWith({ phase: 'download', received: 8, total: 10 });
    pending.resolve(fixture.template); const lease = await second;
    expect(fixture.disposed.geometry).not.toHaveBeenCalled(); lease.dispose();
  });

  it('aborts only when all waiters cancel, releases late success, and isolates a fresh attempt', async () => {
    const old = model(), fresh = model(), pendingOld = deferred<ModelTemplate>(), pendingFresh = deferred<ModelTemplate>();
    const signals: AbortSignal[] = [];
    const loader = vi.fn<ModelLoader>((_, signal) => { signals.push(signal); return signals.length === 1 ? pendingOld.promise : pendingFresh.promise; });
    const assets = library(loader), one = new AbortController(), two = new AbortController();
    const first = assets.acquire(source, { signal: one.signal }), second = assets.acquire(source, { signal: two.signal });
    one.abort(); await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(signals[0].aborted).toBe(false);
    two.abort(); await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(signals[0].aborted).toBe(true);
    const next = assets.acquire(source); expect(loader).toHaveBeenCalledTimes(2);
    pendingOld.resolve(old.template); await Promise.resolve();
    for (const spy of Object.values(old.disposed)) expect(spy).toHaveBeenCalledTimes(1);
    expect(old.image.close).toHaveBeenCalledTimes(1); expect(signals[1].aborted).toBe(false);
    pendingFresh.resolve(fresh.template); const lease = await next;
    expect(fresh.disposed.geometry).not.toHaveBeenCalled(); lease.dispose();
  });

  it('rejects pending callers on owner disposal and cleans a loader that ignores abort', async () => {
    const fixture = model(), pending = deferred<ModelTemplate>();
    let signal!: AbortSignal;
    const assets = library((_, value) => { signal = value; return pending.promise; });
    const result = assets.acquire(source); assets.dispose();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' }); expect(signal.aborted).toBe(true);
    pending.resolve(fixture.template); await Promise.resolve(); assets.dispose();
    for (const spy of Object.values(fixture.disposed)) expect(spy).toHaveBeenCalledTimes(1);
    expect(fixture.image.close).toHaveBeenCalledTimes(1);
  });

  it('rejects an already-aborted caller before invoking the loader', async () => {
    const loader = vi.fn<ModelLoader>(), assets = library(loader), controller = new AbortController(); controller.abort();
    await expect(assets.acquire(source, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(loader).not.toHaveBeenCalled();
  });

  it('does not retain failed entries and can retry the same source', async () => {
    const fixture = model(), loader = vi.fn<ModelLoader>().mockRejectedValueOnce(new Error('broken asset')).mockResolvedValueOnce(fixture.template);
    const assets = library(loader);
    await expect(assets.acquire(source)).rejects.toThrow('broken asset');
    const lease = await assets.acquire(source); expect(loader).toHaveBeenCalledTimes(2); lease.dispose();
  });

  it('handles a synchronous loader exception and a late rejection after cancellation', async () => {
    const pending = deferred<ModelTemplate>();
    const loader = vi.fn<ModelLoader>().mockImplementationOnce(() => { throw new Error('sync failure'); }).mockImplementationOnce(() => pending.promise);
    const assets = library(loader);
    await expect(assets.acquire(source)).rejects.toThrow('sync failure');
    const controller = new AbortController(), result = assets.acquire(source, { signal: controller.signal });
    controller.abort(); await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    pending.reject(new Error('late rejection')); await Promise.resolve();
  });

  it('isolates a throwing progress observer and permits cancellation inside progress', async () => {
    const fixture = model(), pending = deferred<ModelTemplate>();
    let report!: (value: ModelLoadProgress) => void, sharedSignal!: AbortSignal;
    const assets = library((_, signal, progress) => { report = progress; sharedSignal = signal; return pending.promise; });
    const controller = new AbortController();
    const first = assets.acquire(source, { onProgress: () => { throw new Error('UI failure'); } });
    const second = assets.acquire(source, { signal: controller.signal, onProgress: () => controller.abort() });
    expect(() => report({ phase: 'download', received: 5 })).not.toThrow();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' }); expect(sharedSignal.aborted).toBe(false);
    pending.resolve(fixture.template); (await first).dispose();
  });

  it('transfers ownership to the lease after success instead of retaining the acquire signal', async () => {
    const fixture = model(), controller = new AbortController(), assets = library(async () => fixture.template);
    const lease = await assets.acquire(source, { signal: controller.signal }); controller.abort();
    expect(fixture.disposed.geometry).not.toHaveBeenCalled(); lease.dispose();
    expect(fixture.disposed.geometry).toHaveBeenCalledTimes(1);
  });

  it('cleans success after the last caller cancels inside a synchronous progress callback', async () => {
    const fixture = model(), controller = new AbortController();
    const assets = library(async (_, signal, report) => {
      report({ phase: 'decode', received: 10, total: 10 });
      expect(signal.aborted).toBe(true);
      return fixture.template;
    });
    const result = assets.acquire(source, { signal: controller.signal, onProgress: () => controller.abort() });
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    for (const spy of Object.values(fixture.disposed)) expect(spy).toHaveBeenCalledTimes(1);
  });
});

function glb(json: Record<string, unknown>, binary?: Uint8Array): ArrayBuffer {
  const encoded = new TextEncoder().encode(JSON.stringify(json)), jsonLength = Math.ceil(encoded.length / 4) * 4;
  const binLength = binary ? Math.ceil(binary.length / 4) * 4 : 0;
  const buffer = new ArrayBuffer(20 + jsonLength + (binary ? 8 + binLength : 0));
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength); bytes.set(encoded, 20);
  if (binary) {
    view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
    bytes.set(binary, 28 + jsonLength);
  }
  return buffer;
}
function triangleGlb(): ArrayBuffer {
  const binary = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  return glb({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Triangle' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  }, binary);
}
function response(data: ArrayBuffer, knownLength: boolean, extraHeaders: Record<string, string> = {}): Response {
  const bytes = new Uint8Array(data), middle = Math.floor(bytes.length / 2);
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes.slice(0, middle)); controller.enqueue(bytes.slice(middle)); controller.close();
  } }), { headers: { ...(knownLength ? { 'Content-Length': String(data.byteLength) } : {}), ...extraHeaders } });
}

describe('default embedded GLB loader', () => {
  it.each([true, false])('parses a real local GLB with streamed progress (known length: %s)', async knownLength => {
    const data = triangleGlb(), fetcher = vi.fn().mockResolvedValue(response(data, knownLength)); vi.stubGlobal('fetch', fetcher);
    const progress = vi.fn(), assets = library(), lease = await assets.acquire(source, { onProgress: progress });
    expect(fetcher).toHaveBeenCalledWith(source.url, expect.objectContaining({ signal: expect.any(AbortSignal), credentials: 'same-origin', redirect: 'error' }));
    const mesh = lease.root.getObjectByName('Triangle') as Mesh;
    expect(mesh.isMesh).toBe(true); expect(mesh.geometry.getAttribute('position').count).toBe(3);
    const updates = progress.mock.calls.map(([value]) => value as ModelLoadProgress);
    expect(updates.some(value => value.phase === 'download' && value.received > 0 && value.received < data.byteLength)).toBe(true);
    const downloaded = updates.filter(value => value.phase === 'download').at(-1)!;
    expect(downloaded.received).toBe(data.byteLength);
    expect(downloaded.total).toBe(knownLength ? data.byteLength : undefined);
    expect(updates.at(-1)).toEqual({ phase: 'decode', received: data.byteLength, total: data.byteLength });
    lease.dispose();
  });

  it('does not report encoded Content-Length as a decoded download total', async () => {
    const data = triangleGlb(), fetcher = vi.fn().mockResolvedValue(response(data, true, { 'Content-Encoding': 'gzip' })); vi.stubGlobal('fetch', fetcher);
    const progress = vi.fn(), lease = await library().acquire(source, { onProgress: progress });
    expect(progress.mock.calls.map(([value]) => value as ModelLoadProgress).filter(value => value.phase === 'download').every(value => value.total === undefined)).toBe(true);
    lease.dispose();
  });

  it('retries one transient HTTP failure without creating a second shared load', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('busy', { status: 503 })).mockResolvedValueOnce(response(triangleGlb(), true));
    vi.stubGlobal('fetch', fetcher); const assets = library();
    const [a, b] = await Promise.all([assets.acquire(source), assets.acquire(source)]);
    expect(fetcher).toHaveBeenCalledTimes(2); a.dispose(); b.dispose();
  });

  it('surfaces a permanent HTTP failure and allows a later explicit retry', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('missing', { status: 404 })).mockResolvedValueOnce(response(triangleGlb(), false));
    vi.stubGlobal('fetch', fetcher); const assets = library();
    await expect(assets.acquire(source)).rejects.toThrow('HTTP 404'); expect(fetcher).toHaveBeenCalledTimes(1);
    const lease = await assets.acquire(source); expect(fetcher).toHaveBeenCalledTimes(2); lease.dispose();
  });

  it('bounds transient retry attempts and exposes the final download error', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('busy', { status: 503 })); vi.stubGlobal('fetch', fetcher);
    await expect(library().acquire(source)).rejects.toThrow('HTTP 503'); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('cancels an unfinished response stream when the last caller leaves', async () => {
    const streamCancelled = vi.fn(), started = deferred<void>();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3, 4])); }, cancel: streamCancelled });
    const fetcher = vi.fn().mockResolvedValue(new Response(stream)); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController(), result = library().acquire(source, { signal: controller.signal, onProgress: value => {
      if (value.received > 0) started.resolve();
    } });
    await started.promise; controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(streamCancelled).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('rejects external model URLs without fetching them', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(library().acquire({ ...source, url: 'https://cdn.example.com/model.glb' })).rejects.toThrow('同源');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('loads and parses a real GLB from the packaged game://local protocol', async () => {
    vi.stubGlobal('document', { baseURI: 'game://local/index.html' });
    vi.stubGlobal('location', new URL('game://local/index.html'));
    const fetcher = vi.fn().mockResolvedValue(response(triangleGlb(), true)); vi.stubGlobal('fetch', fetcher);
    const lease = await library().acquire({ ...source, url: 'game://local/models/test.glb' });
    expect((lease.root.getObjectByName('Triangle') as Mesh).geometry.getAttribute('position').count).toBe(3);
    expect(fetcher).toHaveBeenCalledWith('game://local/models/test.glb', expect.objectContaining({ redirect: 'error' }));
    lease.dispose();
  });

  it.each(['game://other/models/test.glb', 'https://local/models/test.glb', 'custom://local/models/test.glb', 'game://local:9000/models/test.glb'])('rejects %s from the packaged document despite opaque origins', async url => {
    vi.stubGlobal('document', { baseURI: 'game://local/index.html' });
    vi.stubGlobal('location', new URL('game://local/index.html'));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(library().acquire({ ...source, url })).rejects.toThrow('同源');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['game://other/index.html', 'https://local/index.html'])('does not trust a game://local resource from %s', async pageUrl => {
    vi.stubGlobal('document', { baseURI: pageUrl }); vi.stubGlobal('location', new URL(pageUrl));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(library().acquire({ ...source, url: 'game://local/models/test.glb' })).rejects.toThrow('同源');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['game://user:secret@local/models/test.glb', 'https://user:secret@local/models/test.glb'])('rejects credential-bearing URLs even on their trusted host', async url => {
    const pageUrl = url.startsWith('game:') ? 'game://local/index.html' : 'https://local/index.html';
    vi.stubGlobal('document', { baseURI: pageUrl }); vi.stubGlobal('location', new URL(pageUrl));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(library().acquire({ ...source, url })).rejects.toThrow('凭据');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resolves a relative web resource against the document and enforces its actual page origin', async () => {
    vi.stubGlobal('document', { baseURI: 'https://game.example/path/index.html' });
    vi.stubGlobal('location', new URL('https://game.example/path/index.html'));
    const fetcher = vi.fn().mockResolvedValue(response(triangleGlb(), false)); vi.stubGlobal('fetch', fetcher);
    const assets = library(), lease = await assets.acquire(source);
    expect(fetcher).toHaveBeenCalledWith('https://game.example/path/assets/models/test.glb', expect.any(Object));
    lease.dispose();
    vi.stubGlobal('document', { baseURI: 'https://cdn.example/path/index.html' });
    await expect(assets.acquire(source)).rejects.toThrow('同源');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { buffers: [{ byteLength: 4, uri: 'https://cdn.example.com/mesh.bin' }] },
    { images: [{ uri: './texture.png' }] },
  ])('rejects external GLB dependencies before parsing', async extra => {
    const data = glb({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], ...extra });
    const fetcher = vi.fn().mockResolvedValue(response(data, true)); vi.stubGlobal('fetch', fetcher);
    await expect(library().acquire(source)).rejects.toThrow('内嵌'); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'])('reports the unsupported %s decoder without downloading one', async extension => {
    const data = glb({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], extensionsUsed: [extension] });
    const fetcher = vi.fn().mockResolvedValue(response(data, true)); vi.stubGlobal('fetch', fetcher);
    await expect(library().acquire(source)).rejects.toThrow('未配置'); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed GLB with a visible error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new ArrayBuffer(8), true)));
    await expect(library().acquire(source)).rejects.toThrow('GLB');
  });

  it('treats a swallowed embedded-image decoder error as a visible model failure', async () => {
    const nativeFetch = globalThis.fetch;
    const binary = new Uint8Array(40); binary.set(new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer));
    binary.set([1, 2, 3, 4], 36);
    const data = glb({
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], buffers: [{ byteLength: 40 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 4 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
      images: [{ bufferView: 1, mimeType: 'image/png' }], textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    }, binary);
    vi.stubGlobal('self', { URL }); vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('invalid image')));
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.startsWith('blob:') ? nativeFetch(url, init) : Promise.resolve(response(data, true))));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await expect(library().acquire(source)).rejects.toThrow('图片解码失败');
    expect(revoke).toHaveBeenCalledWith(expect.stringMatching(/^blob:/));
  });
});
