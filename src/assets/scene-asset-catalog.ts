import type { ScenarioId } from '../contracts';
import type { ModelSource } from './model-contracts';

/** Frozen 2026-10-31 source snapshot: original PBR and geometry, no runtime provider URLs. */
export const SCENE_ASSETS = {
  'BG-CRANE': {
    id: 'BG-CRANE', revision: 'production-20261031-tex1024-v1', provider: 'Hyper3D',
    runtimePath: 'assets/generated/production-20261031/BG-CRANE.glb',
    sourcePath: 'assets/source/hyper3d/BG-CRANE/v1/base_basic_pbr.glb',
    taskId: '0af41b69-a2f2-448d-ad4a-b8d348e8f0bb',
    sha256: 'bfec243ec25cf469ae3f2eb36a373f4d9737ff92cdfc8cdb2937811f4f1b2ca5', bytes: 3154172,
    sourceSha256: 'db2856bf9bf59c22ba408e98a35cf471871d21db2727659d5ec44c3470d0845d', sourceBytes: 5331512,
    sourceBounds: { min: [-0.44521310925483704, -0.7250379323959351, -0.9443587064743042], max: [0.44664904475212097, 0.7188607454299927, 0.9452332258224487] },
    sourceCost: { triangles: 19718, meshes: 1, materials: 1, embeddedImages: 3, animationClips: 0 },
    status: 'prepared-integration-candidate-rendering-pending',
  },
  'ENV-LIGHTKIT-POLE': {
    id: 'ENV-LIGHTKIT-POLE', revision: 'production-20261031-tex1024-v1', provider: 'Hyper3D',
    runtimePath: 'assets/generated/production-20261031/ENV-LIGHTKIT-POLE.glb',
    sourcePath: 'assets/source/hyper3d/ENV-LIGHTKIT-POLE/v1/base_basic_pbr.glb',
    taskId: '44be1ace-2da5-40d3-b990-a5e476aa1df9',
    sha256: 'afe2b14a3580fe5445f4cef5441acf9532a5b25c9f127236cfb3d6fa9e0f220d', bytes: 1393544,
    sourceSha256: 'c2b66359af56e25609032fa2f0826d89436e1ce76c9d6003713ba9ce1ff83248', sourceBytes: 2319412,
    sourceBounds: { min: [-0.435163289308548, -0.9479645490646362, -0.17805664241313934], max: [0.43270257115364075, 0.9481470584869385, 0.17822511494159698] },
    sourceCost: { triangles: 11374, meshes: 1, materials: 1, embeddedImages: 3, animationClips: 0 },
    status: 'prepared-integration-candidate-rendering-pending',
  },
  'PROP-BENCH': {
    id: 'PROP-BENCH', revision: 'production-20261031-tex1024-v1', provider: 'Tripo',
    runtimePath: 'assets/generated/production-20261031/PROP-BENCH.glb',
    sourcePath: 'assets/source/tripo/PROP-BENCH/f3ae5bd3-fcc8-4c4a-beaa-9c4826be9247-pbr-model.glb',
    taskId: 'f3ae5bd3-fcc8-4c4a-beaa-9c4826be9247',
    sha256: 'ce7d7df330953b12fb3adb079f49cfe5efdcf125676873824a93956190871d3f', bytes: 1256928,
    sourceSha256: 'bafcb58d9cd1d40badbbbf4a7bc05ad19b0e5df657a2dae423d156b82cd01022', sourceBytes: 11641764,
    sourceBounds: { min: [-0.12602274119853973, -0.1408012956380844, -0.5], max: [0.12602274119853973, 0.1408012956380844, 0.5] },
    sourceCost: { triangles: 4592, meshes: 1, materials: 1, embeddedImages: 3, animationClips: 0 },
    status: 'prepared-integration-candidate-rendering-pending',
  },
  'PROP-LIFE-MUG': {
    id: 'PROP-LIFE-MUG', revision: 'production-20261031-tex1024-v1', provider: 'Tripo',
    runtimePath: 'assets/generated/production-20261031/PROP-LIFE-MUG.glb',
    sourcePath: 'assets/source/tripo/PROP-LIFE-MUG/a509e55e-d414-42db-ba04-1c2b0a44b03b-pbr-model.glb',
    taskId: 'a509e55e-d414-42db-ba04-1c2b0a44b03b',
    sha256: 'bcc64d594526addb80dedb12f3768f430840fb033d7c1883bfe8ba1e021e1745', bytes: 834268,
    sourceSha256: 'fa95b4b2be647aad5a013b269077fb80579168ccddd559404ba1907a027f8d4f', sourceBytes: 8377524,
    sourceBounds: { min: [-0.43909358978271484, -0.3714621067047119, -0.5], max: [0.43909358978271484, 0.3714621067047119, 0.5] },
    sourceCost: { triangles: 3626, meshes: 1, materials: 1, embeddedImages: 3, animationClips: 0 },
    status: 'prepared-integration-candidate-rendering-pending',
  },
  'PROP-MEDICAL-BAG': {
    id: 'PROP-MEDICAL-BAG', revision: 'production-20261031-tex1024-v1', provider: 'Tripo',
    runtimePath: 'assets/generated/production-20261031/PROP-MEDICAL-BAG.glb',
    sourcePath: 'assets/source/tripo/PROP-MEDICAL-BAG/76629177-8de5-4c65-a8dc-34dcfd2b938b-pbr-model.glb',
    taskId: '76629177-8de5-4c65-a8dc-34dcfd2b938b',
    sha256: '68d06c25d534d0442aaceb6eb46795caa4f9fa1f09e47e96f5b426f540864020', bytes: 1569588,
    sourceSha256: '7f9ef520a1f5486aa507b7f0d504d4b75516c1601ad4423181d6e801b5071b9b', sourceBytes: 17454464,
    sourceBounds: { min: [-0.2999960780143738, -0.35750243067741394, -0.5], max: [0.2999960780143738, 0.35750243067741394, 0.5] },
    sourceCost: { triangles: 5518, meshes: 1, materials: 1, embeddedImages: 3, animationClips: 0 },
    status: 'prepared-integration-candidate-rendering-pending',
  },
  'PROP-TANK': {
    id: 'PROP-TANK', revision: 'production-20261031-tex1024-v1', provider: 'Hyper3D',
    runtimePath: 'assets/generated/production-20261031/PROP-TANK.glb',
    sourcePath: 'assets/source/hyper3d/PROP-TANK/v1/base_basic_pbr.glb',
    taskId: '222957ed-2b0b-4800-a022-a1244bc25e88',
    sha256: '03f4f654a3101d91247dcd0fc5dd7170999367c477075c470b4fd3ebe663bb1b', bytes: 1690788,
    sourceSha256: 'fa1688f012e5dfa93e28dc6147a9215e84334f855c7d850d1c68c5270574ee8c', sourceBytes: 3169960,
    sourceBounds: { min: [-0.8136574029922485, -0.9513395428657532, -0.809900164604187], max: [0.8130090236663818, 0.947274386882782, 0.8106244802474976] },
    sourceCost: { triangles: 15130, meshes: 1, materials: 1, embeddedImages: 3, animationClips: 0 },
    status: 'prepared-integration-candidate-rendering-pending',
  },
  'PROP-TERMINAL-CONSOLE': {
    id: 'PROP-TERMINAL-CONSOLE', revision: 'production-20261031-tex1024-v1', provider: 'Tripo',
    runtimePath: 'assets/generated/production-20261031/PROP-TERMINAL-CONSOLE.glb',
    sourcePath: 'assets/source/tripo/PROP-TERMINAL-CONSOLE/914701ef-9b63-4d3e-9064-b1cf113aa4fe-pbr-model.glb',
    taskId: '914701ef-9b63-4d3e-9064-b1cf113aa4fe',
    sha256: 'e187a83c21ea321c690193517c5551541ed2bef280d9a94fd90ab696d5fceff8', bytes: 1617188,
    sourceSha256: '8213a3b4a182c5df399dd56e06f7a9de31e1745d18aaafdf2f4bb36dbdf415a2', sourceBytes: 10952596,
    sourceBounds: { min: [-0.15724784135818481, -0.19664359092712402, -0.5], max: [0.15724784135818481, 0.19664359092712402, 0.5] },
    sourceCost: { triangles: 9819, meshes: 1, materials: 1, embeddedImages: 3, animationClips: 0 },
    status: 'prepared-integration-candidate-rendering-pending',
  },
  'PROP-VEH-TUG': {
    id: 'PROP-VEH-TUG', revision: 'production-20261031-tex1024-v1', provider: 'Tripo',
    runtimePath: 'assets/generated/production-20261031/PROP-VEH-TUG.glb',
    sourcePath: 'assets/source/tripo/PROP-VEH-TUG/561b30a3-8648-4ea8-84ef-7091de2d68a1-pbr-model.glb',
    taskId: '561b30a3-8648-4ea8-84ef-7091de2d68a1',
    sha256: '1fd793e2a4ae6ed2b958c9a441fdb55a97e8dc3394c76c252fc3dd60946b76ac', bytes: 2185792,
    sourceSha256: '41012891d28356f8e57810b96b1620af34aa81ea59ab98f386411ad408d428da', sourceBytes: 14286384,
    sourceBounds: { min: [-0.5, -0.23017218708992004, -0.26132938265800476], max: [0.5, 0.23017218708992004, 0.26132938265800476] },
    sourceCost: { triangles: 18122, meshes: 1, materials: 1, embeddedImages: 3, animationClips: 0 },
    status: 'prepared-integration-candidate-rendering-pending',
  },
} as const;

export type SceneAssetId = keyof typeof SCENE_ASSETS;
export type SceneAssetPoint = readonly [number, number, number];

export interface SceneAssetPlacement {
  readonly id: string;
  readonly assetId: SceneAssetId;
  /** Bottom-centre in metres, in the untransformed environment root. */
  readonly position: SceneAssetPoint;
  /** One uniform scale, measured along an inspected source-space axis. */
  readonly size: { readonly axis: 'x' | 'y' | 'z'; readonly metres: number };
  readonly yaw: number;
  /** An independently constructed PortKit.visualSlot; all members swap atomically. */
  readonly fallbackSlot?: string;
  readonly role: 'replacement' | 'surface-prop' | 'background';
  readonly support: string;
  readonly castShadow?: boolean;
  /** An owned visual foundation outside traversable bounds, top at position.y. */
  readonly foundation?: { readonly width: number; readonly depth: number; readonly height: number };
}

export function sceneAssetSource(id: SceneAssetId, baseURL: string): ModelSource {
  const asset = SCENE_ASSETS[id];
  return { id, revision: asset.revision, url: new URL(asset.runtimePath, baseURL).href };
}

const frontPlacements: readonly SceneAssetPlacement[] = [
  { id: 'front-tug', assetId: 'PROP-VEH-TUG', position: [21, 0, 20], size: { axis: 'x', metres: 4.35 },
    yaw: Math.PI / 2 - 0.15, fallbackSlot: 'front-tug', role: 'replacement', support: 'front-ground / existing tractor solid' },
  { id: 'front-east-tank', assetId: 'PROP-TANK', position: [43, 0, 10], size: { axis: 'x', metres: 6.2 },
    yaw: 0, fallbackSlot: 'front-east-tank', role: 'replacement', support: 'front-ground / existing tank solid' },
  { id: 'front-background-crane', assetId: 'BG-CRANE', position: [78, 0, 60], size: { axis: 'y', metres: 30 },
    yaw: Math.PI / 2, role: 'background', support: 'outside front-boundary-x-54 and front-boundary-z-52', castShadow: false,
    foundation: { width: 43, depth: 22, height: 0.4 } },
  { id: 'front-background-light', assetId: 'ENV-LIGHTKIT-POLE', position: [58, 0, 36], size: { axis: 'y', metres: 5 },
    yaw: 0, role: 'background', support: 'outside front-boundary-x-54', castShadow: false,
    foundation: { width: 3.2, depth: 2.0, height: 0.3 } },
];

const medicalPlacements: readonly SceneAssetPlacement[] = [
  { id: 'medical-bench-left', assetId: 'PROP-BENCH', position: [-414.5, 0, 63.5], size: { axis: 'z', metres: 1.8 },
    yaw: Math.PI / 2, fallbackSlot: 'medical-rest-bench', role: 'replacement', support: 'medical-ground / calibrated left bench solid' },
  { id: 'medical-bench-right', assetId: 'PROP-BENCH', position: [-412.5, 0, 63.5], size: { axis: 'z', metres: 1.8 },
    yaw: Math.PI / 2, fallbackSlot: 'medical-rest-bench', role: 'replacement', support: 'medical-ground / calibrated right bench solid' },
  { id: 'medical-supply-bag', assetId: 'PROP-MEDICAL-BAG', position: [-417, 1.062, 56], size: { axis: 'z', metres: 0.4 },
    yaw: Math.PI / 2, role: 'surface-prop', support: 'medical-supply-bin--417-56 amber lid top y=1.06' },
  { id: 'medical-water-mug', assetId: 'PROP-LIFE-MUG', position: [-414.16, 0.962, 60.39], size: { axis: 'y', metres: 0.1 },
    yaw: 0, role: 'surface-prop', support: 'medical-water-table top y=0.96; clear of existing vessel at [-414.5,60.2]' },
];

const epiloguePlacements: readonly SceneAssetPlacement[] = [
  { id: 'epilogue-reception-console', assetId: 'PROP-TERMINAL-CONSOLE', position: [2.2, 0, 6], size: { axis: 'z', metres: 3.5 },
    yaw: Math.PI / 2, fallbackSlot: 'epilogue-reception-console', role: 'replacement', support: 'epilogue-ground / existing reception-table solid' },
];

/** Static dressing only: no transport, lamp-state, screen interaction or movable-part claim. */
export function generatedScenePlacements(scenario: ScenarioId): readonly SceneAssetPlacement[] {
  if (scenario === 'frontgate' || scenario === 'transfer' || scenario === 'flank') return frontPlacements;
  if (scenario === 'medical') return medicalPlacements;
  if (scenario === 'epilogue') return epiloguePlacements;
  return [];
}
