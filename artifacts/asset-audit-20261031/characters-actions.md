# 人物、群众、武器、双臂和动作资产审计

时间：2026-10-31T09:45:12.152921+00:00。当前 main，工作区 `/Users/penguin/VibeHack06`。本次只读，不修复、不生产、不改 src/public/git；没有浏览器验收。

实际核对 13 个身体、13 个41骨绑定、13 个无几何动作包，每包17片段×123通道。源/运行SHA匹配清单=True；13套原件/运行骨rest与IBM相同=True；动作包与生产原件SHA相同=True。

**仅5个战术片段启用，walk另走canonical；11个蹲起/掩体片段无触发，包内重复walk也未使用。** 身体已接入不等于动作和接触验收。

## 发现

### CA-01 · P1 · 17 片段只触发 5 个子集

idle/ready_idle/run/crouch_idle/crouch_walk 在 selector 中可达；walk 另用 canonical。其余 11 个 crouch_down、stand_up、cover_enter/idle/exit、左右 peek/aim/fire 无触发，战术包重复 walk 也未使用。所有当前 sampler 都 loop=true；无跨片段混合或一次性蹲起转换。CombatTactics 有 seek/hide/peek/recover/shift/hold/return，但 main 只转交 crouched、moveSpeed、animationTime；CharacterModel 无 cover side/phase/shot 字段。

证据：`src/presentation/ImportedCharacter.ts:182`；`src/presentation/ImportedCharacter.ts:186`；`src/presentation/ImportedCharacter.ts:194`；`src/presentation/ImportedCharacter.ts:204`；`src/main.ts:529`；`src/contracts.ts:25`；`src/actors/CombatTactics.ts:5`。

### CA-02 · P1 · 第三人称 AK 没有绑定真实手骨

身体加载后只隐藏 fallback 的身体 Mesh，保留其 pose-root 下枪节点。AK 替换那个旧枪节点，枪姿态仍由 characters.ts 定位，未挂 R_Hand，未读取 TACTICAL_WEAPON_CALIBRATION；procedural arm direction 又覆盖采样上身。0.68 枪缩放已补偿，不能据此宣称真实双手握点成立；蹲伏、体型变化与枪姿态仍分离。

证据：`src/presentation/ImportedCharacter.ts:48`；`src/presentation/ImportedCharacter.ts:54`；`src/presentation/ImportedCharacter.ts:64`；`src/presentation/ImportedCharacter.ts:165`；`src/presentation/ImportedCharacter.ts:243`；`src/presentation/characters.ts:146`；`src/presentation/characters.ts:187`；`src/presentation/WorldAK47.ts:247`；`src/assets/tactical-catalog.ts:139`。

### CA-03 · P1 · 射击/装填事件没有驱动 NPC 片段或模型枪口

shot 事件只有 position/enemy 无 actorId，main 仅用它播放枪声。NPC 弹丸起点为身体位置+碰撞高-0.42，演出为+1.38；玩家也使用独立物理 muzzle proxy，不读 ImportedWeaponView.muzzle。保留了真实遮挡检测，但可见枪口对齐未验证。Feedback 只有弹道和命中粒子，无逐枪口闪光。Actor 无弹药/装填字段，main 未传 NPC reloadFraction，相关程序化换弹分支目前不触发。

证据：`src/mission/Simulation.ts:31`；`src/mission/Simulation.ts:50`；`src/mission/Simulation.ts:325`；`src/mission/Simulation.ts:436`；`src/mission/Simulation.ts:453`；`src/mission/Opening.ts:223`；`src/main.ts:413`；`src/main.ts:529`；`src/presentation/Feedback.ts:24`。

### CA-04 · P1 · 伤员人体没有沿用已生产角色

role=cart 在身份查找之前直接返回 undefined。Rescue 将孟齐 ally 改 cart，main 替换整个模型；Medical 周延/孟齐从创建起就是 cart。床上人体和附着推车者都是 patient-cart 中的程序化方块，不是 CH-ZHOU/CH-MENG/CH-DOCTOR。医疗区生成备用床/担架只是静态陈设。

证据：`src/assets/character-catalog.ts:225`；`src/mission/Rescue.ts:30`；`src/mission/Medical.ts:31`；`src/main.ts:489`；`src/presentation/characters.ts:64`；`src/presentation/patient-cart.ts:24`；`src/presentation/patient-cart.ts:37`；`src/assets/scene-asset-catalog.ts:807`。

### CA-05 · P1 · 4 身份跳过战术包；蒙皮高应变未消除

SHAO/DOCTOR/SHEN/child 跳过 tactical 下载，仍有正式身体+canonical walk+程序化动作，不能误写人物没接。SHAO connected edge 10723–10736 在 crouch_walk 0.70s 从6.04mm变67.12mm，11.114倍，是实际短边拉伸而非零分母。已有四成人四姿态离线概览未见大块断离，但未检最坏帧/全动画/枪/游戏相机/儿童；不是通用动作合格。

证据：`src/presentation/ImportedCharacter.ts:113`；`src/presentation/ImportedCharacter.ts:182`；`artifacts/asset-jobs/production-20261031/characters/tactical-animations/inspection/deformation-analysis.json`；`artifacts/asset-jobs/production-20261031/qa/tactical-offline/review.json`。

### CA-06 · P2 · S08 监控邵原仍旧 primitive

DepartureMonitor 直接 createCharacter(civilian) 并叠黑外套/灰发/杯子方块，没有请求已有 CH-SHAO；只在 escort 监控摄像画面显示。

证据：`src/presentation/DepartureMonitor.ts:15`；`src/presentation/DepartureMonitor.ts:42`；`src/main.ts:233`；`src/main.ts:614`。

### CA-07 · P2 · 女孩/群众/年龄版本共用少数皮肤

daughter 女孩与 young-lu 男孩都因 child 优先规则选 CH-LU-CHILD。年轻23岁及33岁周延共用 CH-ZHOU；泛居民=SHEN、工人=LUO、医护=DOCTOR、友军/驻守/接防=ZHOU。S01/S02 32名主厅居民+12名撤离背景居民全用 SHEN，另6名任务居民按 civilian/worker 分别 SHEN/LUO。正式 CrowdView 分支为独立蒙皮实例，不使用原 instancing，也无群众LOD。

证据：`src/assets/character-catalog.ts:210`；`src/assets/character-catalog.ts:219`；`src/assets/character-catalog.ts:227`；`src/presentation/CrowdView.ts:26`；`src/presentation/CrowdView.ts:43`；`src/mission/Opening.ts:233`；`src/content/history-layout.ts:9`；`src/content/history-layout.ts:24`；`src/mission/Simulation.ts:91`。

### CA-08 · P2 · 真实第一人称双臂已接，但搬运/护理仍为代理

FirstPersonArms 从当前主角正式蒙皮裁切同侧权重>=0.7的原三角面，双侧各至少100面且有手掌权重，做双节臂IK握枪和跟随弹匣。手是原生成刚性手、41骨无手指；失败回退box手套/袖。nightshift/medical 搬箱由 main.carriedSupply 的方块手，relief/escort/rescue 护理/搬运由 CareView 的方块腿手，未用真实双臂。

证据：`src/presentation/FirstPersonArms.ts:36`；`src/presentation/FirstPersonArms.ts:98`；`src/presentation/FirstPersonArms.ts:123`；`src/presentation/FirstPersonArms.ts:216`；`src/presentation/FirstPersonArms.ts:233`；`src/presentation/ImportedWeaponView.ts:153`；`src/main.ts:41`；`src/main.ts:214`；`src/main.ts:473`；`src/presentation/CareView.ts:11`。

### CA-09 · P2 · 穿戴原件已生产，仅接为医疗区静物

胸甲/左护具/头盔/电台背包/耳机/手持终端已有生成原件和运行文件，但只摆在medical桌面/箱盖。无骨骼挂载/穿戴拟合/装备切换；角色衣服是整体蒙皮一部分，实际护理护膝/绑带仍程序化。

证据：`src/assets/scene-asset-catalog.ts:811`；`src/assets/scene-asset-catalog.ts:817`；`src/presentation/GeneratedSceneAssets.ts:32`；`src/presentation/CareView.ts:23`。

### CA-10 · P2 · 场景散落枪和手枪缺口

NPC carbine 和 opponent sidearm 都被同一 AK 替换，所以邵原原手枪 socket 得到AK；未找到独立手枪生产源。历史厅三把来源/掉落/班长枪仍是 rifleModel PortKit 几何，未用 WorldAK47。

证据：`src/presentation/characters.ts:146`；`src/presentation/ImportedCharacter.ts:64`；`src/presentation/history-environments.ts:35`；`src/presentation/history-environments.ts:190`。

### CA-11 · P2 · 过场预载不等于动作和人物已就绪

PreparedGameLevel 预热初始人物/主角/walk/AK，不含 tactical 或后续动态出现身份；直接单场 load 不等待异步预热。ImportedCharacter 在 model+walk+tactical尝试及rig检查结束前继续显示代理。预热失败算已结束的降级任务。Tactical loader 没传 AbortSignal；角色释放后要等获取完成才释放该lease。

证据：`src/chapter-transition/PreparedGameLevel.ts:109`；`src/chapter-transition/PreparedGameLevel.ts:176`；`src/main.ts:221`；`src/presentation/ImportedCharacter.ts:107`；`src/presentation/TacticalAnimations.ts:43`。

### CA-12 · P2 · 动作标定尺度与运行尺度存在差值

战术成人按1.8m、儿童1.25m编辑，运行catalog使用1.75m/1.15m，物理为1.8m/1.1m。实际 loader 验原件source SHA+真实骨rest/层级/skin bindMatrix/IBM，正确接受仅压纹理的文件SHA变化；但并未证明最终枪长0.89m与运行身体握点、脚底及碰撞高度一致。

证据：`src/assets/tactical-catalog.ts:13`；`src/assets/tactical-catalog.ts:133`；`src/assets/character-catalog.ts:10`；`src/assets/character-catalog.ts:66`；`src/mission/Simulation.ts:103`；`src/presentation/TacticalAnimations.ts:21`。

## 逐场景

所有 sim.actors 由 main.ts:486–559 创建；普通人物→ImportedCharacter，序章指定居民→配置资产的 CrowdView→ImportedCharacter。全部异步加载期间/失败时保留代理。cart 始终为程序化患者车。下列缩写是 CH- 前缀。

| 场景 | 主角双臂 | NPC | 例外 | 来源 |
|---|---|---|---|---|
| S01 childhood | CH-LU-CHILD | father FATHER; evacuator SHEN; daughter LU-CHILD; zhao ZHAO; young-zhou/defenders ZHOU; 6+32+12 civilians SHEN | All imported people; girl uses boy skin; loose guns primitive | `src/mission/Opening.ts:233` |
| S02 mainhall | CH-ZHOU | father FATHER; evacuator SHEN; daughter/young-lu LU-CHILD; zhao ZHAO; defenders ZHOU; 6 workers LUO;32+12 civilians SHEN; enemies/invaders ENEMY; shao SHAO | Imported people; deaths procedural; loose rifles primitive | `src/mission/Opening.ts:233` |
| S03 nightshift | CH-LU | xu XU; meng MENG; zhou ZHOU | Imported people; supply hands primitive | `src/mission/Simulation.ts:123` |
| S04 workers | CH-LU | workers incl 罗敬 LUO; zheng ZHENG; meng MENG; E01/E02/E03 ENEMY | Imported; workers one skin | `src/mission/Simulation.ts:130` |
| S05 frontgate | CH-ZHOU | 7 workers LUO; zheng ZHENG; relief ZHOU; E04 ENEMY | Imported; generic ally shares Zhou | `src/mission/Frontgate.ts:36` |
| S06 transfer | CH-LU | courier SHEN; xu XU; zhou ZHOU; luo LUO; cart-* primitive | Cart patient/orderly primitive | `src/mission/Transfer.ts:28` |
| S07 flank | CH-ZHOU | zheng ZHENG; meng MENG; workers LUO; walkers SHEN; E05 ENEMY; carts primitive | Cart patient/orderly primitive | `src/mission/Flank.ts:28` |
| S08 escort | CH-LU | luo LUO; meng MENG; medic DOCTOR; relief-* ZHOU; walkers SHEN; E06/E07 ENEMY; carts primitive | Monitor Shao primitive; transfer hands primitive | `src/mission/Escort.ts:88` |
| S09 relief | CH-ZHOU | meng MENG; zheng ZHENG; relief-* ZHOU; workers LUO; E08 ENEMY | CareView legs/brace/strap primitive | `src/mission/Relief.ts:30` |
| S10 rescue | CH-ZHOU | meng MENG→cart; zheng ZHENG; medic/medic-1 DOCTOR; zhou-cart primitive; E09 ENEMY | Role change replaces Meng skin; carry hands primitive | `src/mission/Rescue.ts:18` |
| S11 medical | CH-LU | zhou/meng cart; doctor/nurse DOCTOR; xu XU; zheng ZHENG | Named patients primitive; carry hands primitive; static wearables | `src/mission/Medical.ts:31` |
| S12 epilogue | CH-LU | zheng ZHENG; luo/worker-* LUO; supply-cart primitive | Cargo and attached orderly primitive | `src/mission/Epilogue.ts:30` |
| legacy northgate | CH-ZHOU | 7 workers LUO; zheng ZHENG; enemies ENEMY | Imported non-cart | `src/mission/Simulation.ts:130` |
| legacy prologue | CH-LU-CHILD→CH-ZHOU | 3 workers LUO; zheng ZHENG; father FATHER; enemies ENEMY | Player name changes at phase2 | `src/mission/Simulation.ts:530` |
| legacy handover | CH-LU→CH-ZHOU | 2 workers LUO; zheng ZHENG; medic DOCTOR; enemies ENEMY | Player name changes midscene | `src/mission/Simulation.ts:545` |

## 未生产的独立版本／未完成适配

| 项目 | 生产状态 | 当前实现 |
|---|---|---|
| 独立女孩外观 | no separate source found | CH-LU-CHILD boy reused |
| 年轻周延独立网格版本 | no separate revision found | 23/33岁共用CH-ZHOU；骨架共用本身符合设计 |
| 群众/工人/医护/接防兵外观变体 | no dedicated variants found | 已有SHEN/LUO/DOCTOR/ZHOU基模，不是全部无人模型 |
| 周延/孟齐卧床伤员版本 | no dedicated patient source/contact adaptation found | 原基模存在；cart显示通用人体 |
| 独立近景双臂/可动手指资产 | no standalone source; runtime derivative exists | 原身体裁切真实双臂已接，不能写双臂全未生产 |
| 搬运/护理/抱撤/扶门/换弹/受击/死亡专用片段 | not in 17-clip pack | 已有程序化近似和剧情位移，没有对应正式片段/多人接触包 |
| 独立手枪 | no source/runtime weapon found | opponent gun replaced by AK |
| 穿戴/护具操作适配 | raw props produced; wearable adaptation absent | 现有胸甲/头盔/护具是桌面陈设 |

这里的未生产仅指本项目source/runtime/生产清单中未找到对应独立版本，不表示必须购买新模型。已存在基模、运行派生、原始道具和穿戴接触适配分别记录。

## 13 模型来源核对

| ID | 源 SHA 前12 | 运行 SHA 前12 | 高度 | 战术包 |
|---|---|---|---|---|
| CH-DOCTOR | `bdf7f567d245` | `ac40a5bd0847` | 1.75m | 跳过；canonical+procedural |
| CH-ENEMY | `5f5d3f3fb12a` | `0242cf47abaf` | 1.75m | 5片段子集 |
| CH-FATHER | `56f25bda8d2f` | `0f3e20b3a03c` | 1.75m | 5片段子集 |
| CH-LU | `33579cb205c1` | `6d6e12d9e234` | 1.75m | 5片段子集 |
| CH-LU-CHILD | `1d33683fcf92` | `13f8f41d6852` | 1.15m | 跳过；canonical+procedural |
| CH-LUO | `99d550070d86` | `d5e7dad0e2c4` | 1.75m | 5片段子集 |
| CH-MENG | `3c12c834d9ef` | `c90132d7e2af` | 1.75m | 5片段子集 |
| CH-SHAO | `8b13b2f6aecc` | `b972baf3bb59` | 1.75m | 跳过；canonical+procedural |
| CH-SHEN | `00740e54780b` | `f79c3447a5c3` | 1.75m | 跳过；canonical+procedural |
| CH-XU | `91851024995f` | `a92899ff81b6` | 1.75m | 5片段子集 |
| CH-ZHAO | `bb3feadbff89` | `4f669c12b0fb` | 1.75m | 5片段子集 |
| CH-ZHENG | `71465e2907f2` | `5753250c0198` | 1.75m | 5片段子集 |
| CH-ZHOU | `1ec1a772922b` | `e643df2c1bc4` | 1.75m | 5片段子集 |

完整源/运行路径、SHA、输入图、model/rig任务、费用、17片段通道数见同名JSON。模型/rig原批855 credits、已有新增idle/run20 credits；此次审计0费用。

## 验收边界

已有LU/ZHOU shared walk浏览器记录只证明该次walk，不等于全部角色/动作通过。四成人四冻结姿态离线概览没有大块分离，但未含最坏帧/全循环/AK/游戏相机/其他成人/儿童。SHAO11倍是实连接短边拉长，不是零长除法；不能据纯数字宣布可见破洞，也不能因此消除权重风险。第一人称真实裁切双臂仍标NOT_REVIEWED。

## 完整阅读核心文件与SHA

| 文件 | 行数 | SHA256 |
|---|---:|---|
| `README.md` | 66 | `941f8687e3b0d913b0e1e66a338457652747af7867a52b4e7686c68183c40e84` |
| `docs/PROJECT_BLUEPRINT.md` | 113 | `390e46a7e7c6871d9fc7c25fc952edbee21cc3d32b4439dba326f0aa9f71677b` |
| `docs/THREEJS_FPS_STANDARDS.md` | 176 | `d867d66aaa345ec0e26c4a93b2869f961165f430f9a505cd31bdf451f5df64bb` |
| `docs/ASSET_PIPELINE.md` | 101 | `8a5c3275594104075463a36b358b0361d5df1994a2d2535e30d7be184e7d1d7e` |
| `docs/CHARACTER_RIG_STANDARD.md` | 50 | `261902d0dc6896588c82233d06640a7eb04170b4436fb6725a627a55dfc24479` |
| `src/main.ts` | 666 | `e84a9e051e2749b01d9c7ce690644988c941f3f06a90716e8ee818099762bec4` |
| `src/contracts.ts` | 99 | `d56ad0c13e6586826a5653179d28fd48bbe27ada47f3b44f8aecdab179fe82bd` |
| `src/presentation/CharacterRig.ts` | 234 | `3cde92e719eca63646b1ff37051c7a2d0a1025f27e1ac08ce4b1168fec6710c3` |
| `src/presentation/ImportedCharacter.ts` | 289 | `284be4f1ba73d22504c852ba8a88e54095681b2adefdc3adfcdfab99cad00de7` |
| `src/presentation/CharacterMotion.ts` | 32 | `0deb152d9d7ec16ec921bda2ff603dd1e95c596de0447f892e8c30e987745296` |
| `src/presentation/CharacterMotionTracker.ts` | 42 | `0f0db5ed45045d2ee99619b23bdf6fdedb5c9112e66e4a41f85d6c6daabba13e` |
| `src/presentation/CrowdView.ts` | 104 | `5ac552dd1c25b86ac4244d9700860947f2cc19129ba4a4628f9f0153e073cf07` |
| `src/presentation/WorldAK47.ts` | 274 | `57bc779842e029f6cd628c8000cdf7676b6788a935e20424b9c28fe5ffe232e1` |
| `src/presentation/ImportedWeaponView.ts` | 283 | `5da30c57ecaf79331a37be4b19a1f4de918139776942f18e19bb4e574a0cf17b` |
| `src/presentation/FirstPersonArms.ts` | 275 | `2e90ae4b62ba8572c34e31b1a2e3c9245431f2f6852976185e99fa7c3134a25d` |
| `src/presentation/characters.ts` | 235 | `bca48fecc3e3d6c734b7b5aa37e832b44879b3b365eab39b996eb15c58166164` |
| `src/presentation/DepartureMonitor.ts` | 68 | `2171df0632d4959961207e991e2239109f20f7f6b1b4476d23b9ba60823035f7` |
| `src/presentation/CareView.ts` | 37 | `08f65946c5ef1e1083fd0a2e6f45b61c069af43c5a9e9cb83fd677fff0e34ad5` |
| `src/presentation/patient-cart.ts` | 63 | `aa85349798bdd63275d45ff7f944dfab753e5c86d69ad61b7f8a98e1052f542b` |
| `src/presentation/Feedback.ts` | 49 | `abd790a47c577c2f76536484abab1fd902d8b6de14097e7fb7a004a00a9983bf` |
| `src/assets/character-catalog.ts` | 238 | `afd058acc56aa14d748bd8f59ebea7c91bfce25faea71ae64e7f0b0fbac68713` |
| `src/assets/weapon-catalog.ts` | 31 | `611b339bffcecac2c84784eef60f6716d1b0aa46b8e819cd43a79850c4248456` |
| `src/assets/tactical-catalog.ts` | 204 | `990191a5ab853ff6dc800dc31147fbeda9af60a1a598e12c096500e76893db73` |
| `src/presentation/TacticalAnimations.ts` | 70 | `504eb034fee9466dfed287637bf2e7fabe52d38d21c8cfe161b4d2d46ae0e890` |
| `src/assets/ModelLibrary.ts` | 133 | `318de00d4b4d511dee3cc4ce6332ddf35f82aa168ca5bad44b191daefca80a42` |
| `src/assets/model-contracts.ts` | 31 | `1db424599427b9b57b8e5e3640d2693f4c37d41e7ef485ddca32bee494e248a9` |
| `src/assets/model-loading.ts` | 138 | `90d7c0b6a2ae4af36ea8e9f72a5e42206c2d96041da7b056346c51b32568a1df` |
| `src/chapter-transition/PreparedGameLevel.ts` | 219 | `f14287926438078d57d7ff36072c00509c70f12c6e227bbae87466d12e6a7933` |
| `src/actors/CombatTactics.ts` | 183 | `36e9d669c32a6682c912b14ff1d8281dd43095ea9ce68c6ab5ab06b0c2bf0642` |
| `src/content/OpeningCrowd.ts` | 179 | `b727663c55330e8a6d980d6513e2f03a4e1fc0596456b619c7cc6ffa724b57f2` |
| `src/content/crowd-layout.ts` | 19 | `b4b17e8275ca44a365cdb823554105f7ece97bb7afc3eb4b250038099aaa3ffc` |
| `src/content/history-layout.ts` | 90 | `3a37738f63d686797513fb4e8b698f9b067dc8089be5eb4847a56369c26de648` |
| `src/content/layout.ts` | 96 | `f15f5b2f438391a2cf4001421eb66535aab4697d3b3ce5c6311c292b35e974d2` |

战术catalog巨型生成合同用JSON完整解析，13项各41骨/1蒙皮；任务模块现已补齐全文件阅读；原始 readCoverage 范围保留为首轮记录，最新完整覆盖/SHA 见 coverage-mission.json。没有本次浏览器/Windows/性能验收。

## 任务、存档与导航全读补充

已完整阅读 16 文件、3365 行：全部 `src/mission/*.ts`、Locomotion、Navigation、Ballistics、SaveStore、RigAudit。开始与结束 SHA 全一致，逐文件简短结论、调用者和完整 SHA 见 [coverage-mission.json](/Users/penguin/VibeHack06/artifacts/asset-audit-20261031/coverage-mission.json)。无新 API、几何复检、浏览器或 Windows 验收，未改源代码。

- **旧 handover 的场景矩阵补正**：`Simulation.ts:549` 在 phase 3 晚出生孟齐，保持 `ally + down`；phase 4 按玩家前方位置搬动他，仍加载 CH-MENG 与程序化倒地姿势。`SaveStore.ts:300` 也要求此时孟齐为 ally。这不是新版 rescue 的 cart 旁路；首次预热不包含这一晚出生模型。
- **CA-04 占用描述补正**：新版 S10 `zhou-cart` 在 `main.ts:564` 始终 `occupied=false`，玩家视角由 `Rescue.ts:86` 随担架移动；S11 `Medical.ts:32` 的 zhou/meng cart 才显示通用病人。不能把 S10 描述为已有周延病体或已接入正式卧床姿势。S10 孟齐改 cart 与 S11 两个 cart 角色均受存档校验保持。
- **既有剧情动作缺口证据补齐**：饭盒/床垫（Opening.ts:500）、风机/装备领取（Simulation.ts:585、609）、清洗包扎（Transfer.ts:77）、换床（Escort.ts:144）、交装备/陪坐（Medical.ts:47、82）、扶门（Epilogue.ts:74）主要通过事实、路线和计时完成。换床/护理已有 CareView 及程序化骨姿，不等于这些动作已经作为正式共享片段生产或完成多人手部接触验收。
- **审计边界**：SaveStore 的精确白名单不含外部资产 URL、模型修订、装备 ID 或片段字段；恢复由当前身份与任务状态重建呈现。RigAudit 的调用者是 `scripts/audit-character-rig.mjs:89` 和测试，主运行使用 CharacterRig/TacticalAnimations 自己的结构合同；离线工具的存在不代表逐实例视觉验收。
