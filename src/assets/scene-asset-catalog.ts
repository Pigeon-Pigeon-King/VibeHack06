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
  "PROP-TRANSFER": {
    "id": "PROP-TRANSFER",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-TRANSFER.glb",
    "sourcePath": "assets/source/tripo/PROP-TRANSFER/1c388cb1-fe48-4263-a1e0-7210e4451aa3-pbr-model.glb",
    "taskId": "1c388cb1-fe48-4263-a1e0-7210e4451aa3",
    "sha256": "03264ef2c1cb3282924679778db4081f033bb527a1bcc0364c75f22ec40be18b",
    "bytes": 1647596,
    "sourceSha256": "3f029558fb380a475fae91e5ed09700224445dc445fdae4f7d8495338ed9a56d",
    "sourceBytes": 9200768,
    "sourceBounds": {
      "min": [
        -0.5,
        -0.23441840708255768,
        -0.25887173414230347
      ],
      "max": [
        0.5,
        0.23441840708255768,
        0.25887173414230347
      ]
    },
    "sourceCost": {
      "triangles": 17042,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-STRETCHER": {
    "id": "PROP-STRETCHER",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-STRETCHER.glb",
    "sourcePath": "assets/source/tripo/PROP-STRETCHER/8d8192a4-2414-497c-9ef3-019dc604fce0-pbr-model.glb",
    "taskId": "8d8192a4-2414-497c-9ef3-019dc604fce0",
    "sha256": "6ad2cb7989e26c1e6e01921a3f87418ffb44bc6f05c4b984a9f14fcc17b5f4f9",
    "bytes": 1350900,
    "sourceSha256": "f82188ebd6f314a80a28f1719f466dd6a61c4873afa29c617a20c9281538a8a6",
    "sourceBytes": 10915136,
    "sourceBounds": {
      "min": [
        -0.5,
        -0.031084980815649033,
        -0.17940440773963928
      ],
      "max": [
        0.5,
        0.031084980815649033,
        0.17940440773963928
      ]
    },
    "sourceCost": {
      "triangles": 7168,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-DOOR-LEAF": {
    "id": "PROP-DOOR-LEAF",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-DOOR-LEAF.glb",
    "sourcePath": "assets/source/tripo/PROP-DOOR-LEAF/ce8b2327-8995-44d0-9fe5-e3551e06009e-pbr-model.glb",
    "taskId": "ce8b2327-8995-44d0-9fe5-e3551e06009e",
    "sha256": "e01e2ebd2db78d58ee372e3588fd7cc42e4d71ee48157a21e9c32f77141931b1",
    "bytes": 1604400,
    "sourceSha256": "df28de7339fc37401088b2deeadae2aac7779c61d344134b4f55c79ec0bb75f3",
    "sourceBytes": 11420968,
    "sourceBounds": {
      "min": [
        -0.1281512826681137,
        -0.5,
        -0.3024097979068756
      ],
      "max": [
        0.1281512826681137,
        0.5,
        0.3024097979068756
      ]
    },
    "sourceCost": {
      "triangles": 8730,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-DOOR-LOCK": {
    "id": "PROP-DOOR-LOCK",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-DOOR-LOCK.glb",
    "sourcePath": "assets/source/tripo/PROP-DOOR-LOCK/6caff16f-c506-44e0-afb8-db653121a67d-pbr-model.glb",
    "taskId": "6caff16f-c506-44e0-afb8-db653121a67d",
    "sha256": "e786f8eddae672f6f23599fdab5efc84ad05844aa55cdf6f2e06ea4929de1955",
    "bytes": 1402304,
    "sourceSha256": "52ff81fdb82013c7f52c31a36ae2277d234d8358a745bfb6a42211f4ea59e8d5",
    "sourceBytes": 11095424,
    "sourceBounds": {
      "min": [
        -0.25948432087898254,
        -0.15692640841007233,
        -0.5
      ],
      "max": [
        0.25948432087898254,
        0.15692640841007233,
        0.5
      ]
    },
    "sourceCost": {
      "triangles": 4691,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-TERMINAL-HANDHELD": {
    "id": "PROP-TERMINAL-HANDHELD",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-TERMINAL-HANDHELD.glb",
    "sourcePath": "assets/source/tripo/PROP-TERMINAL-HANDHELD/f8f981a5-3714-4010-a0d8-c263a49b46ba-pbr-model.glb",
    "taskId": "f8f981a5-3714-4010-a0d8-c263a49b46ba",
    "sha256": "f12960843c199fbcc8bfd2cbee586f817472659b1b5e3e2c21e459e0d4f9e459",
    "bytes": 1576612,
    "sourceSha256": "234b2bea3fc26466eae954075d9cc9e02db6fa0e9d6f2dc68666fad19c614c3d",
    "sourceBytes": 15435756,
    "sourceBounds": {
      "min": [
        -0.1957043707370758,
        -0.5,
        -0.3151775896549225
      ],
      "max": [
        0.1957043707370758,
        0.5,
        0.3151775896549225
      ]
    },
    "sourceCost": {
      "triangles": 4196,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-VEH-TRANSPORT": {
    "id": "PROP-VEH-TRANSPORT",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-VEH-TRANSPORT.glb",
    "sourcePath": "assets/source/tripo/PROP-VEH-TRANSPORT/711110bd-b12a-4cf3-863a-376aa825f30d-pbr-model.glb",
    "taskId": "711110bd-b12a-4cf3-863a-376aa825f30d",
    "sha256": "4fa477429e68cc40f8cd65d6ec3ee9c288cbaaeb652c8d91318a230020092a10",
    "bytes": 1785076,
    "sourceSha256": "cc936c5892774b3c6d569ba9181a7b72cf1c56da32b5293b632031643c4e9864",
    "sourceBytes": 11384668,
    "sourceBounds": {
      "min": [
        -0.5,
        -0.2035214751958847,
        -0.19288723170757294
      ],
      "max": [
        0.5,
        0.2035214751958847,
        0.19288723170757294
      ]
    },
    "sourceCost": {
      "triangles": 17959,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-FILTER": {
    "id": "PROP-FILTER",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-FILTER.glb",
    "sourcePath": "assets/source/tripo/PROP-FILTER/a6423fe0-9719-45d4-b285-4ee37ae409b5-pbr-model.glb",
    "taskId": "a6423fe0-9719-45d4-b285-4ee37ae409b5",
    "sha256": "c5b51ec1c1bc3f0fc34e20b0485077047f03bea2a742a920660180d701e5256f",
    "bytes": 1611708,
    "sourceSha256": "232bf081736435438f871a860680232a47287f12616bfa8e880acced07d1c6e2",
    "sourceBytes": 11934652,
    "sourceBounds": {
      "min": [
        -0.23325049877166748,
        -0.2907179296016693,
        -0.5
      ],
      "max": [
        0.23325049877166748,
        0.2907179296016693,
        0.5
      ]
    },
    "sourceCost": {
      "triangles": 10809,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-CARGO": {
    "id": "PROP-CARGO",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-CARGO.glb",
    "sourcePath": "assets/source/tripo/PROP-CARGO/72ca2db1-f3d0-4a3b-9555-3a8be0109392-pbr-model.glb",
    "taskId": "72ca2db1-f3d0-4a3b-9555-3a8be0109392",
    "sha256": "b7447d27ad2bbb417c7ecb7760bb9a6776e8edc1d55b979eccb59d3205ed9783",
    "bytes": 1880176,
    "sourceSha256": "a036cefdf7c9a92edb81f5908986b9b2701245511f3bece3540a68b8d52581ef",
    "sourceBytes": 17572088,
    "sourceBounds": {
      "min": [
        -0.31533247232437134,
        -0.33937782049179077,
        -0.5
      ],
      "max": [
        0.31533247232437134,
        0.33937782049179077,
        0.5
      ]
    },
    "sourceCost": {
      "triangles": 5039,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-PUMP": {
    "id": "PROP-PUMP",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-PUMP.glb",
    "sourcePath": "assets/source/tripo/PROP-PUMP/30ddf85f-f5f3-44d5-9b84-3535a0f1425e-pbr-model.glb",
    "taskId": "30ddf85f-f5f3-44d5-9b84-3535a0f1425e",
    "sha256": "ea37539ae6da8e0c56cd99001471de30b7ab55f8eab2586549dba0c66c392890",
    "bytes": 1842348,
    "sourceSha256": "4de2d7d9a2fc84316ae24c8fe9c512a64a3d8eb2284137035467b8f9e50ef7c9",
    "sourceBytes": 13377124,
    "sourceBounds": {
      "min": [
        -0.2847839295864105,
        -0.23878398537635803,
        -0.5
      ],
      "max": [
        0.2847839295864105,
        0.23878398537635803,
        0.5
      ]
    },
    "sourceCost": {
      "triangles": 10485,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-FAN": {
    "id": "PROP-FAN",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-FAN.glb",
    "sourcePath": "assets/source/tripo/PROP-FAN/f6b963d0-cdc7-4ea2-939c-b4ed3b437fea-pbr-model.glb",
    "taskId": "f6b963d0-cdc7-4ea2-939c-b4ed3b437fea",
    "sha256": "8a0b1f1ad9bfcac49d8aa0587ad94409f758e5ffc34a2c8e5f5f956b19d97910",
    "bytes": 1460432,
    "sourceSha256": "247508f6c9680631d86e679e3370d1caa069c36562fd36a81eade680775816a6",
    "sourceBytes": 10345464,
    "sourceBounds": {
      "min": [
        -0.25746995210647583,
        -0.497150719165802,
        -0.5
      ],
      "max": [
        0.25746995210647583,
        0.497150719165802,
        0.5
      ]
    },
    "sourceCost": {
      "triangles": 9437,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-TOOL-BAG": {
    "id": "PROP-TOOL-BAG",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-TOOL-BAG.glb",
    "sourcePath": "assets/source/tripo/PROP-TOOL-BAG/0cdefaa6-2a0f-4b4e-aede-2ca6e319b6d5-pbr-model.glb",
    "taskId": "0cdefaa6-2a0f-4b4e-aede-2ca6e319b6d5",
    "sha256": "936b657dd2151be5ae36c3a65b7625b6fc1752299a7e35716a03ab5153d31650",
    "bytes": 1652892,
    "sourceSha256": "b1e5648ce9369f954f910e4b93aa4d1d2005cbf38f88ece011cc790100ebf2b7",
    "sourceBytes": 17039144,
    "sourceBounds": {
      "min": [
        -0.31173914670944214,
        -0.397460013628006,
        -0.5
      ],
      "max": [
        0.31173914670944214,
        0.397460013628006,
        0.5
      ]
    },
    "sourceCost": {
      "triangles": 5496,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-TOOL-ROLL": {
    "id": "PROP-TOOL-ROLL",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-TOOL-ROLL.glb",
    "sourcePath": "assets/source/tripo/PROP-TOOL-ROLL/ad2d5d2a-a635-4a84-8341-be625ac6cae5-pbr-model.glb",
    "taskId": "ad2d5d2a-a635-4a84-8341-be625ac6cae5",
    "sha256": "ca5d918c44c649e0149d63b3eb68c6e5a61981b16c3d4e25509a8fe64a1722bd",
    "bytes": 1682284,
    "sourceSha256": "56c03b2ce98ca994e5ef6c98348c3a86e15f7fba19dc684c82ddd39e48b4b4b3",
    "sourceBytes": 16894308,
    "sourceBounds": {
      "min": [
        -0.23423536121845245,
        -0.20957869291305542,
        -0.5
      ],
      "max": [
        0.23423536121845245,
        0.20957869291305542,
        0.5
      ]
    },
    "sourceCost": {
      "triangles": 4787,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-TOOL-LUNCHBOX": {
    "id": "PROP-TOOL-LUNCHBOX",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-TOOL-LUNCHBOX.glb",
    "sourcePath": "assets/source/tripo/PROP-TOOL-LUNCHBOX/f4f7bc35-beb3-4806-b0b0-d0ac2c02c0ec-pbr-model.glb",
    "taskId": "f4f7bc35-beb3-4806-b0b0-d0ac2c02c0ec",
    "sha256": "b84562c1a10554721ab50b58e7f0d2f9b8ad1eae03d04d19efca2738376e63b4",
    "bytes": 1649228,
    "sourceSha256": "b78ffa416f0e2995970011de78a1865ef5f247f96e33a1071fc0c7a215212925",
    "sourceBytes": 17181560,
    "sourceBounds": {
      "min": [
        -0.3599480986595154,
        -0.40197446942329407,
        -0.5
      ],
      "max": [
        0.3599480986595154,
        0.40197446942329407,
        0.5
      ]
    },
    "sourceCost": {
      "triangles": 3328,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-RADIO-PACK": {
    "id": "PROP-RADIO-PACK",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-RADIO-PACK.glb",
    "sourcePath": "assets/source/tripo/PROP-RADIO-PACK/1301e9a7-c909-4b44-9218-0160fbd9a0cb-pbr-model.glb",
    "taskId": "1301e9a7-c909-4b44-9218-0160fbd9a0cb",
    "sha256": "3bbd93d8b01ba472883a74aa2958b547f3a3f4728202ce807d6ba8be50d843d4",
    "bytes": 1417512,
    "sourceSha256": "0ec3cb9ff4b2b28dae7f4957b72d7d2b7ef3c3324c12e2d01bb01025842d48f6",
    "sourceBytes": 12347788,
    "sourceBounds": {
      "min": [
        -0.21003249287605286,
        -0.5,
        -0.3248141407966614
      ],
      "max": [
        0.21003249287605286,
        0.5,
        0.3248141407966614
      ]
    },
    "sourceCost": {
      "triangles": 7124,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-RADIO-HEADSET": {
    "id": "PROP-RADIO-HEADSET",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-RADIO-HEADSET.glb",
    "sourcePath": "assets/source/tripo/PROP-RADIO-HEADSET/ce2057ec-310e-4711-a656-ab74a7d5f73f-pbr-model.glb",
    "taskId": "ce2057ec-310e-4711-a656-ab74a7d5f73f",
    "sha256": "d071ed9172d4f889883bf625c9d0e572287e8e177d0122f14c206c836f26f6fa",
    "bytes": 1349396,
    "sourceSha256": "115f17e668682f67f14bda4855885065bcd43dd6f570fd2982fb2dd0af208304",
    "sourceBytes": 11850600,
    "sourceBounds": {
      "min": [
        -0.21589766442775726,
        -0.40636977553367615,
        -0.5
      ],
      "max": [
        0.21589766442775726,
        0.40636977553367615,
        0.5
      ]
    },
    "sourceCost": {
      "triangles": 4656,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-ARMOR-CHEST": {
    "id": "PROP-ARMOR-CHEST",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-ARMOR-CHEST.glb",
    "sourcePath": "assets/source/tripo/PROP-ARMOR-CHEST/840ece9e-0e2f-4a39-933f-68729b55ffa4-pbr-model.glb",
    "taskId": "840ece9e-0e2f-4a39-933f-68729b55ffa4",
    "sha256": "c32c8cf8660603f30fa8ad8bab558c2b659a08c3401af92e67a45997fe6d51b7",
    "bytes": 1219540,
    "sourceSha256": "fbdac8521d6078cb7c6aed001d81042bd0d7e180e0b0a3800dd7079675a63079",
    "sourceBytes": 10557232,
    "sourceBounds": {
      "min": [
        -0.39480137825012207,
        -0.5,
        -0.4739276170730591
      ],
      "max": [
        0.39480137825012207,
        0.5,
        0.4739276170730591
      ]
    },
    "sourceCost": {
      "triangles": 7063,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-ARMOR-LEFT-BRACE": {
    "id": "PROP-ARMOR-LEFT-BRACE",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-ARMOR-LEFT-BRACE.glb",
    "sourcePath": "assets/source/tripo/PROP-ARMOR-LEFT-BRACE/98939ba8-5a7f-4895-94e2-90f76dd807cc-pbr-model.glb",
    "taskId": "98939ba8-5a7f-4895-94e2-90f76dd807cc",
    "sha256": "c7c4d847ae9d582f1b7ff9d5d4e66a41d8b3b5c50faafe896e431b2b18ec18c8",
    "bytes": 1320340,
    "sourceSha256": "28cdb4035899713a36fe5e73e9279819bee8f2f2a9da10b536c2168a5f6953fb",
    "sourceBytes": 10709188,
    "sourceBounds": {
      "min": [
        -0.31692633032798767,
        -0.5,
        -0.25358349084854126
      ],
      "max": [
        0.31692633032798767,
        0.5,
        0.25358349084854126
      ]
    },
    "sourceCost": {
      "triangles": 5641,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-ARMOR-HELMET": {
    "id": "PROP-ARMOR-HELMET",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-ARMOR-HELMET.glb",
    "sourcePath": "assets/source/tripo/PROP-ARMOR-HELMET/2f160991-6325-4ede-83b7-4e71ffc5ccba-pbr-model.glb",
    "taskId": "2f160991-6325-4ede-83b7-4e71ffc5ccba",
    "sha256": "fc4709a3f63858f6d55d552ac790f9e7cd651d89ff61555a0f11435b6ecd5e60",
    "bytes": 1278600,
    "sourceSha256": "45793603d143012d6683072156e1a209fc325512bba8b0c3dcc84b01555d8185",
    "sourceBytes": 12420076,
    "sourceBounds": {
      "min": [
        -0.3688441812992096,
        -0.5,
        -0.42772576212882996
      ],
      "max": [
        0.3688441812992096,
        0.5,
        0.42772576212882996
      ]
    },
    "sourceCost": {
      "triangles": 6138,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-SAMPLE-CABINET": {
    "id": "PROP-SAMPLE-CABINET",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-SAMPLE-CABINET.glb",
    "sourcePath": "assets/source/tripo/PROP-SAMPLE-CABINET/b7566df9-bdcd-4133-bbac-c01576ba79ca-pbr-model.glb",
    "taskId": "b7566df9-bdcd-4133-bbac-c01576ba79ca",
    "sha256": "40eca6cd7e558e0668df0f3791f487eabf6f5a13ceb876cf05fad40087d8b165",
    "bytes": 1607528,
    "sourceSha256": "e6668bbf6876af59b36f8d6e423fb6c3c8355550c325668d0eeff5911e728dad",
    "sourceBytes": 12946880,
    "sourceBounds": {
      "min": [
        -0.21986743807792664,
        -0.5,
        -0.3536636531352997
      ],
      "max": [
        0.21986743807792664,
        0.5,
        0.3536636531352997
      ]
    },
    "sourceCost": {
      "triangles": 7407,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
  "PROP-SAMPLE-CORECASE": {
    "id": "PROP-SAMPLE-CORECASE",
    "revision": "production-20261031-tex1024-v1",
    "provider": "Tripo",
    "runtimePath": "assets/generated/production-20261031-props-r1/PROP-SAMPLE-CORECASE.glb",
    "sourcePath": "assets/source/tripo/PROP-SAMPLE-CORECASE/96f7adc2-ca55-42ab-864d-333a01fe0e83-pbr-model.glb",
    "taskId": "96f7adc2-ca55-42ab-864d-333a01fe0e83",
    "sha256": "341ff92746ab75956402abf21604c5aaf186ee14fd5e4fc6177a9386dd82edf6",
    "bytes": 1638668,
    "sourceSha256": "a8ea25df78c93292849e83ea11ba2393fad6b0944281e8f9526843ca921b7a7d",
    "sourceBytes": 14024928,
    "sourceBounds": {
      "min": [
        -0.19621585309505463,
        -0.17366966605186462,
        -0.5
      ],
      "max": [
        0.19621585309505463,
        0.17366966605186462,
        0.5
      ]
    },
    "sourceCost": {
      "triangles": 4416,
      "meshes": 1,
      "materials": 1,
      "embeddedImages": 3,
      "animationClips": 0
    },
    "status": "prepared-integration-candidate-rendering-pending"
  },
} as const;

export type SceneAssetId = keyof typeof SCENE_ASSETS;
export type SceneAssetPoint = readonly [number, number, number];

export interface SceneAssetPlacement {
  readonly id: string;
  readonly assetId: SceneAssetId;
  /** Bottom-centre in metres in the authored host (or untransformed environment root for fixed placements). */
  readonly position: SceneAssetPoint;
  /** One uniform scale, measured along an inspected source-space axis. */
  readonly size: { readonly axis: 'x' | 'y' | 'z'; readonly metres: number };
  readonly yaw: number;
  /** An independently constructed PortKit.visualSlot; all members swap atomically. */
  readonly fallbackSlot?: string;
  readonly role: 'replacement' | 'surface-prop' | 'background';
  readonly support: string;
  readonly castShadow?: boolean;
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
    yaw: Math.PI / 2, role: 'background', support: 'outside front-boundary-x-54 and front-boundary-z-52', castShadow: false },
  { id: 'front-background-light', assetId: 'ENV-LIGHTKIT-POLE', position: [58, 0, 36], size: { axis: 'y', metres: 5 },
    yaw: 0, role: 'background', support: 'outside front-boundary-x-54', castShadow: false },
  ...[22.9, 25.1].map((x, i): SceneAssetPlacement => ({ id: `front-filter-${i}`, assetId: 'PROP-FILTER',
    position: [x, 0.402, 3.65], size: { axis: 'z', metres: 3.4 }, yaw: 0,
    fallbackSlot: 'front-filter-machinery', role: 'replacement', support: 'front-filter-base top 0.4; existing front-filter-bank solid retained' })),
  ...[22.9, 25.1].map((x, i): SceneAssetPlacement => ({ id: `front-pump-${i}`, assetId: 'PROP-PUMP',
    position: [x, 0.402, 6.8], size: { axis: 'z', metres: 2.5 }, yaw: 0,
    fallbackSlot: 'front-filter-machinery', role: 'replacement', support: 'front-filter-base top 0.4; existing front-filter-bank solid retained' })),
  { id: 'front-cooling-fan', assetId: 'PROP-FAN', position: [48, 3.402, -32], size: { axis: 'z', metres: 1.2 },
    yaw: Math.PI / 2, role: 'surface-prop', support: 'front-east-staging-block top 3.4' },
  { id: 'front-service-cargo', assetId: 'PROP-CARGO', position: [-33.8, 2.502, -31], size: { axis: 'z', metres: 1.1 },
    yaw: Math.PI / 2, role: 'surface-prop', support: 'workers-parts-rack top 2.5' },
  { id: 'front-service-bag', assetId: 'PROP-TOOL-BAG', position: [-34.8, 1.352, -30.36], size: { axis: 'z', metres: 0.4 },
    yaw: Math.PI / 2, role: 'surface-prop', support: 'workers-parts-rack middle shelf top 1.35; soft bag overhang' },
  { id: 'front-service-tools', assetId: 'PROP-TOOL-ROLL', position: [-33.8, 1.352, -30.38], size: { axis: 'z', metres: 0.3 },
    yaw: Math.PI / 2, role: 'surface-prop', support: 'workers-parts-rack middle shelf top 1.35' },
  { id: 'front-worker-lunch', assetId: 'PROP-TOOL-LUNCHBOX', position: [-32.8, 2.202, -30.38], size: { axis: 'z', metres: 0.22 },
    yaw: Math.PI / 2, role: 'surface-prop', support: 'workers-parts-rack upper shelf top 2.2' },
  { id: 'front-transport-parked', assetId: 'PROP-VEH-TRANSPORT', position: [62, 0, -62], size: { axis: 'x', metres: 7.5 },
    yaw: Math.PI / 2, role: 'background', support: 'parked beyond front-boundary-x-54; vehicle remains static', castShadow: false },
  { id: 'front-spare-door', assetId: 'PROP-DOOR-LEAF', position: [59, 0, -49], size: { axis: 'y', metres: 2.7 },
    yaw: Math.PI / 2, role: 'background', support: 'spare door awaiting repair beyond east boundary; not the mission door', castShadow: false },
  { id: 'front-spare-door-lock', assetId: 'PROP-DOOR-LOCK', position: [59, 1.2, -48.55], size: { axis: 'z', metres: 0.55 },
    yaw: Math.PI / 2, role: 'surface-prop', support: 'mounted against spare door front face; no independent motion', castShadow: false },
];

const medicalPlacements: readonly SceneAssetPlacement[] = [
  { id: 'medical-bench-left', assetId: 'PROP-BENCH', position: [-414.5, 0, 63.5], size: { axis: 'z', metres: 1.8 },
    yaw: Math.PI / 2, fallbackSlot: 'medical-rest-bench', role: 'replacement', support: 'medical-ground / calibrated left bench solid' },
  { id: 'medical-bench-right', assetId: 'PROP-BENCH', position: [-412.5, 0, 63.5], size: { axis: 'z', metres: 1.8 },
    yaw: Math.PI / 2, fallbackSlot: 'medical-rest-bench', role: 'replacement', support: 'medical-ground / calibrated right bench solid' },
  { id: 'medical-supply-bag', assetId: 'PROP-MEDICAL-BAG', position: [-417, 1.062, 56], size: { axis: 'z', metres: 0.4 },
    yaw: Math.PI / 2, role: 'surface-prop', support: 'medical-supply-bin--417-56 amber lid top y=1.06' },
  { id: 'medical-water-mug', assetId: 'PROP-LIFE-MUG', position: [-414.5, 0.962, 60.2], size: { axis: 'y', metres: 0.18 },
    yaw: 0, fallbackSlot: 'medical-water-vessel', role: 'replacement', support: 'medical-water-table top y=0.96; replaces the original vessel' },
  { id: 'medical-spare-trolley', assetId: 'PROP-TRANSFER', position: [-387, 0, 62], size: { axis: 'x', metres: 2.3 },
    yaw: 0, fallbackSlot: 'medical-spare-trolley', role: 'replacement', support: 'medical-ground / dedicated parked trolley solid; no patient or task ownership' },
  { id: 'medical-spare-stretcher', assetId: 'PROP-STRETCHER', position: [-387, 1.062, 68], size: { axis: 'x', metres: 2.1 },
    yaw: 0, role: 'surface-prop', support: 'medical-supply-bin--387-68 lid top 1.06; stretcher has 0.25m handle overhang at each end' },
  { id: 'medical-equipment-chest', assetId: 'PROP-ARMOR-CHEST', position: [-405.7, 1.112, 56.65], size: { axis: 'y', metres: 0.55 },
    yaw: Math.PI, role: 'surface-prop', support: 'medical-equipment-table top 1.11; stowed armor, not a character attachment' },
  { id: 'medical-equipment-brace', assetId: 'PROP-ARMOR-LEFT-BRACE', position: [-405.05, 1.112, 56.7], size: { axis: 'y', metres: 0.42 },
    yaw: Math.PI, role: 'surface-prop', support: 'medical-equipment-table top 1.11; stowed spare brace' },
  { id: 'medical-equipment-helmet', assetId: 'PROP-ARMOR-HELMET', position: [-387, 1.062, 56], size: { axis: 'y', metres: 0.35 },
    yaw: Math.PI, role: 'surface-prop', support: 'medical-supply-bin--387-56 lid top 1.06; recovered equipment' },
  { id: 'medical-radio-pack', assetId: 'PROP-RADIO-PACK', position: [-400.6, 1.112, 68.65], size: { axis: 'y', metres: 0.4 },
    yaw: 0, role: 'surface-prop', support: 'medical-radio-table top 1.11; clear of screen' },
  { id: 'medical-radio-headset', assetId: 'PROP-RADIO-HEADSET', position: [-400.0, 1.112, 68.72], size: { axis: 'z', metres: 0.2 },
    yaw: Math.PI / 2, role: 'surface-prop', support: 'medical-radio-table top 1.11; stowed beside radio' },
  { id: 'medical-record-handheld', assetId: 'PROP-TERMINAL-HANDHELD', position: [-397.5, 1.112, 53.7], size: { axis: 'y', metres: 0.24 },
    yaw: 0, role: 'surface-prop', support: 'medical-record-desk top 1.11; resting upright' },
  { id: 'medical-sample-corecase', assetId: 'PROP-SAMPLE-CORECASE', position: [-387, 1.062, 50], size: { axis: 'z', metres: 0.45 },
    yaw: Math.PI / 2, role: 'surface-prop', support: 'medical-supply-bin--387-50 lid top 1.06; maintenance sample storage' },
  ...[-388.05, -387, -385.95].map((x, i): SceneAssetPlacement => ({ id: `medical-sample-cabinet-${i}`, assetId: 'PROP-SAMPLE-CABINET',
    position: [x, 0, 39], size: { axis: 'y', metres: 2 }, yaw: 0, fallbackSlot: 'medical-sample-cabinets',
    role: 'replacement', support: 'medical-ground / existing east locker conservative solid; three cabinets stay inside its footprint' })),
];

const epiloguePlacements: readonly SceneAssetPlacement[] = [
  { id: 'epilogue-reception-console', assetId: 'PROP-TERMINAL-CONSOLE', position: [2.2, 0, 6], size: { axis: 'z', metres: 3.5 },
    yaw: Math.PI / 2, fallbackSlot: 'epilogue-reception-console', role: 'replacement', support: 'epilogue-ground / existing reception-table solid' },
];

/** Supplemental fixed placements. Authored dynamic and common prop bindings are discovered from the environment. */
export function generatedScenePlacements(scenario: ScenarioId): readonly SceneAssetPlacement[] {
  if (scenario === 'frontgate' || scenario === 'transfer' || scenario === 'flank') return frontPlacements;
  if (scenario === 'medical') return medicalPlacements;
  if (scenario === 'epilogue') return epiloguePlacements;
  return [];
}
