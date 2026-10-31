import type { DirectionalLight, Material, Object3D, WebGLRenderer } from 'three';
import type { RenderQualityPlan } from './RenderQualityPolicy';

type RendererPort = Pick<WebGLRenderer, 'setDrawingBufferSize' | 'domElement' | 'shadowMap'>;

/**
 * Renderer-only adapter for this project's current directional shadow light.
 * The environment remains the owner of lights and their final teardown.
 * Bind once after constructing a scene; apply only when the plan may change.
 * No asset substitution, simulation throttling, context recreation or own loop.
 */
export class RendererQualityAdapter {
  private viewport: RenderQualityPlan | undefined;
  private lights: DirectionalLight[] = [];
  private root: Object3D | undefined;
  private appliedShadowSize: number | undefined;
  private shadowProgramsDirty = false;

  constructor(private readonly renderer: RendererPort) {}

  bindScene(root: Object3D): void {
    // Supply the complete Game.scene, including camera/viewmodel and actors.
    this.root = root;
    this.lights = [];
    root.traverse(object => {
      const light = object as DirectionalLight;
      if (light.isDirectionalLight && light.castShadow) this.lights.push(light);
    });
    this.appliedShadowSize = undefined;
  }

  /** Drop references before the environment owner disposes/replaces its scene. */
  detachScene(): void {
    this.root = undefined;
    this.lights = [];
    this.appliedShadowSize = undefined;
  }

  /** Use after a restored context; this method does not restore a lost context. */
  invalidate(): void { this.viewport = undefined; this.appliedShadowSize = undefined; }

  apply(plan: RenderQualityPlan | null): { viewportChanged: boolean; shadowsChanged: boolean } {
    if (!plan) return { viewportChanged: false, shadowsChanged: false };
    const previous = this.viewport;
    const viewportChanged = !previous || previous.cssWidth !== plan.cssWidth || previous.cssHeight !== plan.cssHeight
      || previous.pixelRatio !== plan.pixelRatio;
    if (viewportChanged) {
      // One allocation/viewport update, unlike setPixelRatio followed by setSize.
      // Supported by the installed Three.js version; this project has no renderer effects pipeline.
      this.renderer.setDrawingBufferSize(plan.cssWidth, plan.cssHeight, plan.pixelRatio);
      this.renderer.domElement.style.width = `${plan.cssWidth}px`;
      this.renderer.domElement.style.height = `${plan.cssHeight}px`;
      this.viewport = plan;
    }

    const enabled = plan.shadowMapSize > 0;
    const enabledChanged = this.renderer.shadowMap.enabled !== enabled;
    const shadowsChanged = this.appliedShadowSize !== plan.shadowMapSize || enabledChanged;
    if (shadowsChanged) {
      for (const light of this.lights) {
        const shadow = light.shadow;
        if (!enabled || shadow.mapSize.x !== plan.shadowMapSize || shadow.mapSize.y !== plan.shadowMapSize) {
          // Dispose the old targets before replacing their dimensions; do not leave
          // a disposed target referenced for the next renderer or environment pass.
          shadow.map?.dispose();
          if (shadow.mapPass !== shadow.map) shadow.mapPass?.dispose();
          shadow.map = null;
          shadow.mapPass = null;
          if (enabled) shadow.mapSize.set(plan.shadowMapSize, plan.shadowMapSize);
        }
        if (enabled) shadow.needsUpdate = true;
      }
      this.renderer.shadowMap.enabled = enabled;
      if (enabledChanged) this.shadowProgramsDirty = true;
      if (enabled) this.renderer.shadowMap.needsUpdate = true;
      this.appliedShadowSize = plan.shadowMapSize;
    }
    if (this.shadowProgramsDirty && this.root) {
      // Three.js 0.186 includes shadowMap.enabled in program parameters, but
      // setProgram does not automatically invalidate a material when only this
      // flag changes. Refresh all current scene materials once, including late
      // actor/viewmodel attachments and currently hidden meshes.
      const materials = new Set<Material>();
      this.root.traverse(object => {
        const material = (object as Object3D & { material?: Material | Material[] }).material;
        if (Array.isArray(material)) material.forEach(value => materials.add(value));
        else if (material) materials.add(material);
      });
      for (const material of materials) material.needsUpdate = true;
      this.shadowProgramsDirty = false;
    }
    return { viewportChanged, shadowsChanged };
  }
}
