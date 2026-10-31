import type { ModelSource } from './model-contracts';

/** The original and runtime GLBs are byte-identical; calibration is a runtime transform. */
export const AK47_ASSET = {
  id: 'WP-AK47',
  revision: 'world-r1-d121eb62491e',
  name: 'AK-47',
  runtimePath: 'models/weapons/ak47-world-r1.glb',
  sourcePath: 'assets/source/WP-AK47/ak47_reloadable_world.glb',
  sha256: 'd121eb62491e7f2cc573cd7bdb04e4a482f1eca3b16df7976b2ee2306ea4e1c1',
  bytes: 2_046_524,
  provenance: {
    creator: 'taradavies',
    adapter: 'Operation Steel Tide / AetherRadar',
    source: 'https://opengameart.org/content/ak-47-1',
    adaptationRevision: '7ef7b539af1e0166e1d2735dc0ba200a08ba6492',
    geometryLicense: 'CC0-1.0',
    adaptationLicense: 'MIT',
    licensePath: 'licenses/WP-AK47/',
  },
  sourceCost: { uniqueTriangles: 24_488, meshResources: 11, materials: 6, embeddedImages: 6, textureEntries: 10, animationClips: 0 },
  defaultHiddenNodes: ['SpareMagazine', 'Suppressor', 'OpticMount', 'OpticRailAdapterGeometry', 'OpticRailContact'],
  requiredNodes: ['Magazine', 'ChargingHandle', 'FrontIronSight', 'RearIronSight', 'MuzzleDeviceTip', 'FurnitureGeometry', 'Stock'],
  // Project presentation calibration, not a claim of manufacturer-exact dimensions.
  presentationLengthMeters: 0.89,
  status: 'imported-geometry-checked-rendering-pending',
} as const;

export function ak47Source(baseURL: string): ModelSource {
  return { id: AK47_ASSET.id, revision: AK47_ASSET.revision, url: new URL(AK47_ASSET.runtimePath, baseURL).href };
}
