import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, DirectionalLight, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { RendererQualityAdapter } from '../../src/mobile-performance/RendererQualityAdapter';
import { planRenderQuality, type RenderQuality } from '../../src/mobile-performance/RenderQualityPolicy';

const plan = (quality: RenderQuality, width = 844, height = 390, devicePixelRatio = 3) =>
  planRenderQuality(quality, { width, height, devicePixelRatio })!;

function rendererDouble() {
  const renderer = {
    setDrawingBufferSize: vi.fn(),
    domElement: { style: { width: '', height: '' } },
    shadowMap: { enabled: true, needsUpdate: false },
  };
  return { renderer, adapter: new RendererQualityAdapter(renderer as unknown as WebGLRenderer) };
}

function sceneWithShadow() {
  const root = new Group(), light = new DirectionalLight();
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.map = new WebGLRenderTarget(2048, 2048);
  light.shadow.mapPass = new WebGLRenderTarget(2048, 2048);
  const disposeMap = vi.spyOn(light.shadow.map, 'dispose'), disposePass = vi.spyOn(light.shadow.mapPass, 'dispose');
  root.add(light);
  return { root, light, disposeMap, disposePass };
}

describe('renderer quality application without a WebGL context', () => {
  it('applies a new buffer once and ignores identical or invalid plans', () => {
    const { renderer, adapter } = rendererDouble();
    expect(adapter.apply(plan('balanced')).viewportChanged).toBe(true);
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledWith(844, 390, 1);
    expect(renderer.domElement.style).toEqual({ width: '844px', height: '390px' });
    expect(adapter.apply(plan('balanced'))).toEqual({ viewportChanged: false, shadowsChanged: false });
    expect(adapter.apply(null)).toEqual({ viewportChanged: false, shadowsChanged: false });
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(1);
  });

  it('reallocates on rotation and DPR change, not on every frame', () => {
    const { renderer, adapter } = rendererDouble();
    adapter.apply(plan('high', 844, 390, 1));
    adapter.apply(plan('high', 844, 390, 3));
    adapter.apply(plan('high', 390, 844, 3));
    for (let i = 0; i < 100; i++) adapter.apply(plan('high', 390, 844, 3));
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(3);
    expect(renderer.domElement.style).toEqual({ width: '390px', height: '844px' });
  });

  it('releases old shadow targets once before reducing map dimensions', () => {
    const { renderer, adapter } = rendererDouble(), scene = sceneWithShadow();
    adapter.bindScene(scene.root);
    adapter.apply(plan('balanced'));
    expect(scene.disposeMap).toHaveBeenCalledTimes(1);
    expect(scene.disposePass).toHaveBeenCalledTimes(1);
    expect(scene.light.shadow.map).toBeNull();
    expect(scene.light.shadow.mapPass).toBeNull();
    expect(scene.light.shadow.mapSize.toArray()).toEqual([1024, 1024]);
    expect(scene.light.castShadow).toBe(true);
    expect(renderer.shadowMap).toEqual({ enabled: true, needsUpdate: true });
    adapter.apply(plan('balanced'));
    scene.light.shadow.dispose();
    expect(scene.disposeMap).toHaveBeenCalledTimes(1);
    expect(scene.disposePass).toHaveBeenCalledTimes(1);
  });

  it('disables and releases shadows in low, then can restore them on manual selection', () => {
    const { renderer, adapter } = rendererDouble(), scene = sceneWithShadow();
    adapter.bindScene(scene.root);
    adapter.apply(plan('low'));
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(scene.disposeMap).toHaveBeenCalledTimes(1);
    expect(scene.light.castShadow).toBe(true);
    adapter.apply(plan('high'));
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(scene.light.shadow.needsUpdate).toBe(true);
    expect(scene.light.shadow.mapSize.toArray()).toEqual([2048, 2048]);
  });

  it('does not enable lights authored without shadows or dispose retained targets at the same size', () => {
    const { adapter } = rendererDouble(), scene = sceneWithShadow();
    const unshadowed = new DirectionalLight();
    scene.root.add(unshadowed);
    adapter.bindScene(scene.root);
    adapter.apply(plan('high'));
    expect(scene.disposeMap).not.toHaveBeenCalled();
    expect(scene.disposePass).not.toHaveBeenCalled();
    expect(unshadowed.castShadow).toBe(false);
    expect(unshadowed.shadow.mapSize.toArray()).toEqual([512, 512]);
  });

  it('handles a new chapter with the same quality and leaves old-scene teardown to its owner', () => {
    const { renderer, adapter } = rendererDouble(), oldScene = sceneWithShadow(), nextScene = sceneWithShadow();
    adapter.bindScene(oldScene.root);
    adapter.apply(plan('high'));
    adapter.detachScene();
    adapter.bindScene(nextScene.root);
    adapter.apply(plan('balanced'));
    expect(oldScene.disposeMap).not.toHaveBeenCalled();
    expect(nextScene.disposeMap).toHaveBeenCalledTimes(1);
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(2);
  });

  it('can reapply after context restoration and does not double-dispose an aliased target', () => {
    const { renderer, adapter } = rendererDouble(), scene = sceneWithShadow();
    scene.light.shadow.mapPass?.dispose();
    scene.light.shadow.mapPass = scene.light.shadow.map;
    adapter.bindScene(scene.root);
    adapter.apply(plan('balanced'));
    expect(scene.disposeMap).toHaveBeenCalledTimes(1);
    adapter.invalidate();
    adapter.apply(plan('balanced'));
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(2);
    expect(scene.disposeMap).toHaveBeenCalledTimes(1);
  });

  it('invalidates shared and late-attached scene materials only when shadows are enabled or disabled', () => {
    const { adapter } = rendererDouble(), scene = sceneWithShadow();
    const geometry = new BoxGeometry(), shared = new MeshStandardMaterial(), unlit = new MeshBasicMaterial();
    const hidden = new Mesh(geometry, shared); hidden.visible = false;
    scene.root.add(new Mesh(geometry, shared), hidden);
    adapter.bindScene(scene.root);
    // A viewmodel/actor can arrive after bindScene; traverse current contents at the switch.
    scene.root.add(new Mesh(geometry, [shared, unlit]));
    adapter.apply(plan('high'));
    expect([shared.version, unlit.version]).toEqual([0, 0]);
    adapter.apply(plan('low'));
    expect([shared.version, unlit.version]).toEqual([1, 1]);
    adapter.apply(plan('low'));
    expect([shared.version, unlit.version]).toEqual([1, 1]);
    adapter.apply(plan('high'));
    expect([shared.version, unlit.version]).toEqual([2, 2]);
    adapter.apply(plan('balanced'));
    expect([shared.version, unlit.version]).toEqual([2, 2]);
    geometry.dispose(); shared.dispose(); unlit.dispose();
  });

  it('defers program invalidation if quality was applied before a scene was bound', () => {
    const { adapter } = rendererDouble(), root = new Group();
    const geometry = new BoxGeometry(), material = new MeshStandardMaterial();
    root.add(new Mesh(geometry, material));
    adapter.apply(plan('low'));
    adapter.bindScene(root);
    adapter.apply(plan('low'));
    expect(material.version).toBe(1);
    adapter.apply(plan('low'));
    expect(material.version).toBe(1);
    geometry.dispose(); material.dispose();
  });
});
