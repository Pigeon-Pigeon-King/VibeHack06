import type { Group } from 'three';
import type { ScenarioId } from '../contracts';
import { automaticArchitecture } from './architecture-auto-bindings';
import type { ArchitectureAsset, ArchitecturePlacement, ModuleSemantic, V3, VisualTarget } from './ArchitectureTransactions';
import { architectureCatalog, SOURCE_PROFILES, type ProfileId } from './architecture-placement-plan';

export interface BoundArchitectureGroup { id: string; targets: VisualTarget[]; placements: ArchitecturePlacement[]; error?: string; }
const EXTRA = {
  'BG-CRANE': { semantic: 'landmark', size: [0.891862, 1.443899, 1.889592] },
  'BG-SHIP': { semantic: 'landmark', size: [0.794420, 0.550143, 1.891632] },
  'ENV-BRIDGEKIT-DECK': { semantic: 'bridge-deck', size: [0.883221, 0.215912, 1.897539] },
  'ENV-LIGHTKIT-POLE': { semantic: 'landmark', size: [0.867866, 1.896112, 0.356282] },
  'ENV-PIPEKIT-ELBOW': { semantic: 'pipe-elbow', size: [1.044530, 1.843092, 1.891701] },
  'MAP-A-ARCH-01': { semantic: 'arch-shell', size: [1.901770, 1.595701, 0.381619] },
  'MAP-B-CORRIDOR-01': { semantic: 'arch-shell', size: [1.244916, 0.987584, 1.899415] },
  'MAP-E-PIER-01': { semantic: 'pier', size: [1.311136, 1.890110, 1.310689] },
  'MAP-F-ROOF-01': { semantic: 'arch-shell', size: [1.893160, 0.929554, 1.427892] },
  'PROP-BOOTH': { semantic: 'booth', size: [1.895350, 1.652386, 1.862850] },
  'PROP-TANK': { semantic: 'landmark', size: [1.626666, 1.898614, 1.620525] },
} as const;
export function allArchitectureAssets(): ArchitectureAsset[] {
  return [...architectureCatalog(Object.keys(SOURCE_PROFILES) as ProfileId[]), ...Object.entries(EXTRA).map(([id, profile]): ArchitectureAsset => ({
    id, sourceId: `${id}:lod0`, semantic: profile.semantic, materialContract: 'same-node-material-slots', fit: 'uniform',
    basis: { quaternion: [0, 0, 0, 1], description: 'glTF +Y up; source hierarchy retained', evidence: 'Frozen runtime-ready POSITION accessors and identity nodes, 2026-10-31' },
    lods: [{ sourceId: `${id}:lod1`, distance: 24 }, { sourceId: `${id}:lod2`, distance: 70 }], castShadow: false,
  }))];
}
export function uniformPlacement(id: string, assetId: keyof typeof EXTRA | ProfileId, at: V3, axis: 0 | 1 | 2, metres: number, yaw = 0): ArchitecturePlacement {
  const profile = assetId in EXTRA ? EXTRA[assetId as keyof typeof EXTRA] : SOURCE_PROFILES[assetId as ProfileId];
  return { id, assetId, semantic: profile.semantic as ModuleSemantic, position: at, size: profile.size.map(n => n * metres / profile.size[axis]) as [number, number, number], anchor: 'bottom-center', yaw };
}

/** Semantic records are captured before flush. No coordinate-based scan can steal
 * an instance from a neighbouring prop or a different scene's shared batch. */
export function bindArchitecture(root: Group, scenario: ScenarioId): BoundArchitectureGroup[] {
  const plan = automaticArchitecture(root, scenario), groups = plan.groups;
  root.userData.architectureCoveragePlan = { uncovered: plan.uncovered,
    informationPrimitives: plan.informationPrimitives, delegatedPrimitives: plan.delegatedPrimitives };
  const add = (id: string, placements: ArchitecturePlacement[]) => groups.push({ id, placements, targets: [] });
  // These are intentionally additive landmarks, never counted as replacement.
  if (scenario === 'childhood' || scenario === 'mainhall') add('S01-S02-entry-arch-crown',
    [uniformPlacement('history-arch', 'MAP-A-ARCH-01', [30.45, 7.8, -2], 0, 12.5, Math.PI / 2)]);
  if (scenario === 'transfer' || scenario === 'flank') add('S06-S07-cargo-corridor',
    [uniformPlacement('cargo-corridor', 'MAP-B-CORRIDOR-01', [-42, 0, 63], 2, 18)]);
  if (['frontgate', 'transfer', 'flank'].includes(scenario)) {
    add('S05-pipe-return-elbow', [uniformPlacement('pipe-elbow', 'ENV-PIPEKIT-ELBOW', [37, 2.15, 29.65], 1, .7)]);
    add('S05-external-inspection-booth', [uniformPlacement('booth', 'PROP-BOOTH', [-60, 0, -65], 1, 3.2, Math.PI / 2)]);
    add('S05-dock-crane', [uniformPlacement('dock-crane', 'BG-CRANE', [88, 0, -48], 1, 24, .45)]);
  }
  if (scenario === 'epilogue') add('S12-offshore-receiving-ship',
    [uniformPlacement('receiving-ship', 'BG-SHIP', [-180, -1.5, 139], 2, 68, Math.PI / 2)]);
  return groups;
}
