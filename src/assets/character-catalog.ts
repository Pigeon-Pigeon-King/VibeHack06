import type { CharacterRole } from '../contracts';
import type { ModelSource } from './model-contracts';

/** Exact approved production revisions; runtime URLs remain inside the game bundle. */
export const CHARACTER_ASSETS = [
  {
    "id": "CH-DOCTOR",
    "label": "医师",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-doctor-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-DOCTOR/rig-v1/rig/1f3fb503-1bd8-474b-b7ce-574f8f16b650-model.glb",
    "sourceSha256": "bdf7f567d245dc555393a53423a6ce7fb52d2a09c8ab82eb7b2e39fe17bb7a24",
    "sourceBytes": 7991068,
    "sha256": "ac40a5bd08473ccd844ec77146c264dfc0cdaea65fb28f314626f121d38cb8cd",
    "bytes": 1474328,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-ENEMY",
    "label": "敌兵",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-enemy-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-ENEMY/rig-v1/rig/5a26a6cd-f147-4e99-adfb-733d7c686c60-model.glb",
    "sourceSha256": "5f5d3f3fb12a31cae51954ff3e47e615fdd779bd461ee5c4add5b90e1530b3d0",
    "sourceBytes": 11880164,
    "sha256": "0242cf47abaf0d8692a9fcd40465913af64488f90f5186b02a058920eef83b6c",
    "bytes": 1871400,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-FATHER",
    "label": "陆建平",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-father-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-FATHER/rig-v1/rig/5d82f4cd-e9a9-4ba5-9ce9-49aa24a971c6-model.glb",
    "sourceSha256": "56f25bda8d2fe8a89475fdbeb142604d10c07d505b30663c83b48750093b82b3",
    "sourceBytes": 11585296,
    "sha256": "0f3e20b3a03cb3000e2fbf4bc9d06118c852433f7ad8e8f174899bea72a3a7f7",
    "bytes": 1862188,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-LU",
    "label": "陆闻川",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-lu-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-LU/rig-v1/rig/77ed8fb0-4b83-4c79-8bc8-f5cd7820c9d3-model.glb",
    "sourceSha256": "33579cb205c11d50c6fa6dfa42f93f022e387cbcf07b5a24c9a6be0b37961501",
    "sourceBytes": 9097540,
    "sha256": "6d6e12d9e23449ab24f260f2b33bdb30a1e48a179c625e0c9904992ac7b5737f",
    "bytes": 1636760,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-LU-CHILD",
    "label": "陆闻川 · 儿童独立模型",
    "bodyPlan": "child",
    "heightMeters": 1.15,
    "runtimePath": "models/characters/ch-lu-child-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-LU-CHILD/rig-v1/rig/1aeea69b-8de0-49c8-8028-b3fff31436be-model.glb",
    "sourceSha256": "1d33683fcf92e1db07de9ca73b059052d16fd841551d927f25022efc72cf83c1",
    "sourceBytes": 9603700,
    "sha256": "13f8f41d6852a69b6844c51118825e8a0017d7a86856daf6ba1cf1c51ca63f31",
    "bytes": 1673800,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-LUO",
    "label": "罗敬",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-luo-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-LUO/rig-v1/rig/b0df3e2a-e328-438e-af06-eca45f2a7510-model.glb",
    "sourceSha256": "99d550070d86e919ca780d58699d70daa8ed172f2e9696ee78d4a5a666cbb329",
    "sourceBytes": 10643556,
    "sha256": "d5e7dad0e2c4c0d4391af902474df2db1a197ff7d6668dc5184b52047c64b894",
    "bytes": 1774244,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-MENG",
    "label": "孟齐",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-meng-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-MENG/rig-v1/rig/f348dea9-0358-4eab-9208-1335e1768372-model.glb",
    "sourceSha256": "3c12c834d9efbc5fb15a731101e31f71872bc3f193f0c867f9d09508b7da2a1a",
    "sourceBytes": 10019672,
    "sha256": "c90132d7e2afa41b4ea2fdcf3186a149e4814487a45e08d10c742eb601b61d37",
    "bytes": 1680184,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-SHAO",
    "label": "邵原",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-shao-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-SHAO/rig-v1/rig/ae88fddf-945c-4716-9776-1758d063fb27-model.glb",
    "sourceSha256": "8b13b2f6aecc9689df545e93387cc82277775b53feca6ecd73b495376170358d",
    "sourceBytes": 9687232,
    "sha256": "b972baf3bb59fa52f25e7d449e913ae13d5a5dcc9c95c51d02644a67816c72d4",
    "bytes": 1656292,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-SHEN",
    "label": "沈玉芬",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-shen-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-SHEN/rig-v1/rig/771ca26e-fcc0-4f52-868b-7d7caeaf348c-model.glb",
    "sourceSha256": "00740e54780b3f6b06ffdeba1d68ca531b99638be6fa7bfd50bbfa50f305d0a3",
    "sourceBytes": 8582020,
    "sha256": "f79c3447a5c3d77bf4ab8abba48281fc696a45bc7db053dedc2e57f5dabaa75e",
    "bytes": 1491652,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-XU",
    "label": "许岚",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-xu-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-XU/rig-v1/rig/aa6d9286-2831-40bc-96f2-74877d95bedf-model.glb",
    "sourceSha256": "91851024995f6285c1a6c2cd7c4ac0be6bef80766e4124eb648a69938e9b0c8f",
    "sourceBytes": 9132952,
    "sha256": "a92899ff81b6ee64e8b9a36185ae2c0e56380c37eef243f14a3542167271e640",
    "bytes": 1578972,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-ZHAO",
    "label": "赵启明",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-zhao-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-ZHAO/rig-v1/rig/f959a172-f5d8-49b8-b783-b57917aa72a0-model.glb",
    "sourceSha256": "bb3feadbff89b2ea8bc4dd008cc5c6a4eee4b34c53d6018116003429a4f3af9e",
    "sourceBytes": 10827388,
    "sha256": "4f669c12b0fbe108e3080f2acf418d6402755cbc443af610b84dc3ddce56bb20",
    "bytes": 1764692,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-ZHENG",
    "label": "郑铎",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-zheng-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-ZHENG/rig-v1/rig/40053c3a-703e-454f-b015-3339d245489e-model.glb",
    "sourceSha256": "71465e2907f29cb26e4fd7927bf07a1f756e11fb511ebcc91ffdd1e78fc2e765",
    "sourceBytes": 10475064,
    "sha256": "5753250c0198f63d7a2b723e0e6c704189283870f330513f323635959ccddd09",
    "bytes": 1732376,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  },
  {
    "id": "CH-ZHOU",
    "label": "周延",
    "bodyPlan": "adult",
    "heightMeters": 1.75,
    "runtimePath": "models/characters/ch-zhou-rig-v1.glb",
    "sourcePath": "assets/source/tripo/CH-ZHOU/rig-v1/rig/9d29d053-843a-410e-9c67-1cd20c7435ea-model.glb",
    "sourceSha256": "1ec1a772922bf269612bb9b7edf0d1453e297ad41ff0a739603bd9c3a0abd38d",
    "sourceBytes": 10017412,
    "sha256": "e643df2c1bc4a42ebd35d7b1da52a769222c09aa501963f49cd53dcb0a7bcd98",
    "bytes": 1648864,
    "provider": "tripo",
    "revision": "rig-v1-tex1024"
  }
] as const;

export type CharacterAsset = typeof CHARACTER_ASSETS[number];
export type CharacterAssetId = CharacterAsset['id'];
export interface CharacterIdentity { id: string; name: string; role: CharacterRole }

export const CANONICAL_WALK = {
  "id": "ANIM-WALK-CANONICAL",
  "revision": "canonical-v1",
  "runtimePath": "models/animations/walk-canonical-v1.glb",
  "sourcePath": "assets/source/tripo/shared-animations/walk-v1/walk-canonical.glb",
  "sha256": "8281b6b9d7563805e9fffed3a0db6657eefe42fac0d8d86c9a4357e193b0aa78",
  "bytes": 532296
} as const;

const identities: Readonly<Record<string, CharacterAssetId>> = {
  lu: 'CH-LU', '陆闻川': 'CH-LU', 'young-lu': 'CH-LU-CHILD',
  zhou: 'CH-ZHOU', 'young-zhou': 'CH-ZHOU', '周延': 'CH-ZHOU',
  father: 'CH-FATHER', '陆建平': 'CH-FATHER', zhao: 'CH-ZHAO', '赵启明': 'CH-ZHAO',
  xu: 'CH-XU', '许岚': 'CH-XU', meng: 'CH-MENG', '孟齐': 'CH-MENG',
  luo: 'CH-LUO', '罗敬': 'CH-LUO', shao: 'CH-SHAO', '邵原': 'CH-SHAO',
  zheng: 'CH-ZHENG', '郑铎': 'CH-ZHENG', shen: 'CH-SHEN', '沈玉芬': 'CH-SHEN',
  evacuator: 'CH-SHEN', doctor: 'CH-DOCTOR', '医师': 'CH-DOCTOR',
};
const roleAssets: Readonly<Partial<Record<CharacterRole, CharacterAssetId>>> = {
  enemy: 'CH-ENEMY', opponent: 'CH-ENEMY', ally: 'CH-ZHOU', worker: 'CH-LUO',
  father: 'CH-FATHER', child: 'CH-LU-CHILD', medic: 'CH-DOCTOR', civilian: 'CH-SHEN',
};

/** Named identities win over generic role skins. Carts retain their patient/vehicle view. */
export function characterAssetFor(actor: CharacterIdentity): CharacterAsset | undefined {
  if (actor.role === 'cart') return undefined;
  const id: CharacterAssetId = actor.role === 'child' ? 'CH-LU-CHILD'
    : actor.id.startsWith('hall-invader-') ? 'CH-ENEMY'
      : identities[actor.id] ?? identities[actor.name.split(' · ')[0]] ?? roleAssets[actor.role]!;
  return CHARACTER_ASSETS.find(asset => asset.id === id);
}

export function characterSource(asset: CharacterAsset, baseURL: string): ModelSource {
  return { id: asset.id, revision: `${asset.revision}-${asset.sha256.slice(0, 12)}`, url: new URL(asset.runtimePath, baseURL).href };
}
export function canonicalWalkSource(baseURL: string): ModelSource {
  return { id: CANONICAL_WALK.id, revision: `${CANONICAL_WALK.revision}-${CANONICAL_WALK.sha256.slice(0, 12)}`, url: new URL(CANONICAL_WALK.runtimePath, baseURL).href };
}
