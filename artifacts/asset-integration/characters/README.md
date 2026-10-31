# 正式人物运行整合

状态：本地代码、13 份人物运行 GLB 与 canonical walk 已接入备用树；focused **18/18 PASS**。复审未发现需修改或重跑的运行缺陷。本记录没有浏览器、PBR 画面、手机性能、Windows 或接触动画验收结论。未启动生成 API、下载服务、构建或发布，新增供应商费用为 0。

## 入口与所有权

```ts
import { createImportedCharacter, type CharacterLoadStatus } from './presentation/ImportedCharacter';

const model = createImportedCharacter(modelLibrary, actor, document.baseURI, onStatus);
scene.add(model.root);
// 原入口继续设置外层 root 的 position / rotation / visible，再传原有 pose。
model.setPose(pose);
// 移除角色／切章时：先角色 dispose，最后才 library.dispose。
model.dispose();
```

返回同步 `CharacterModel`（`root / setPose / dispose`），另有 `ready: Promise<void>` 和 `retry()`。`ready` 在本次载入尝试结束时 resolve；失败通过 `CharacterLoadStatus.state = 'error'` 报告，不能仅凭 Promise resolve 判定成功。状态还有 `loading / ready / placeholder`，载入文案为“人物载入中／人物载入失败”。失败与载入期间立即可用原程序化角色。

具名 `id/name` 优先，再按角色类别选设计。儿童只选 `CH-LU-CHILD`；`young-lu` 和原流程 `daughter` 当前共用这一已批准儿童设计，不声称有第二套女孩模型。`cart` 保持患者车原表现；主入口匿名人群继续 `CrowdView`。常规未具名 worker 使用 LUO、medic 使用 DOCTOR、civilian 使用 SHEN、ally 使用 ZHOU。`hall-invader-*` 明确使用 ENEMY；具名邵原使用 SHAO。

模型与动画都经已有 `ModelLibrary.acquire`：相同 source/revision/URL 共享下载模板、几何、材质和纹理；每个租约有独立 skeleton、bone transforms 和 mixer。适配后的 clip 缓冲按 canonical clip 与目标 revision 共用。适配器只写实例骨骼、根变换和实例包围体，不改模板材质/网格/skin。取消、retry、已 resolve 但 continuation 未执行、部分请求失败和销毁迟到均释放租约；销毁前先将正式 GLB 脱离，绝不交给 fallback 的通用资源遍历释放。已有共享资源测试证明首实例释放不销毁兄弟实例资源，最后实例只释放一次。

## 坐标、行走和原姿态

源人物正向经双脚 Foot→Toe 与 canonical 前进方向核对为 `+X`。校准层绕 Y 转 `−π/2` 得到游戏 `+Z`，保留外层 actor 导航位置与 yaw；成人站立高 1.75 m，儿童 1.15 m，站立最低蒙皮顶点约为 0（误差小于 `4e-14 m`）。静止时程序化调整肩／前臂使手下垂，13 目标均断言肩到手垂直落差大于身高 20%，不会以原 A-pose 站立。

只播放已转换 `walk-canonical-v1.glb` 的 `walk_in_place`；原始 FBX 不进入运行加载链。适配使用真实世界 bind 旋转差、目标自己的 reference 偏移及骨长，保留全部 41 骨的 123 条位置／旋转／缩放轨道。既有 canonical 文件及原 LU/ZHOU 白名单保持原样；本项目扩展通过逐目标审查记录，不把原 LU/ZHOU 结果泛化为其他人物已验收。

游戏原有 `walk` 为移动米数乘 4；适配器用它与校准步幅求动画相位，成人约 2.61363 m/完整源片段，儿童约 1.45039 m。重复相位完全冻结，不依赖 wall clock、额外 RAF 或独立仿真，不应用动画根前进到 actor。儿童沿用自己的 skin、inverse bind、reference、腿长和比例，只将源位移残差按儿童／源腿长比调整；没有移植成人骨架。

`down / fallProgress / carrying / kneeling / crouched / restrained / aiming / care / reaching / gesture / lookAway` 均保留骨骼级程序表现。跪伏、蹲伏用双段腿部求解降低髋部并尽量保持脚位置；倒地只改内部姿态层。当前第三人称武器仍来自原 fallback 内的武器子树，未把其他窗口正在制作的 AK 持握或共享战术动作半成品接入。

## 逐项数值审查

每行都是该实际运行 GLB 的独立测试：41 骨、权重索引/归一化、reference identity、完整 123 轨、49 个均匀时间点的全部蒙皮顶点、11 种运行姿态、暂停及恢复。全部 13 个目标有 22 个非根骨局部旋转变化；无非有限值，最小骨矩阵行列式 `0.9999851`，最大四元数范数误差 `3.88e-8`，最大权重和误差 `4.48e-8`。相邻约 48.6 ms 采样最大局部角差 `24.0273°`，小于本项 `45°` 突变阈值。reference 最大蒙皮包络误差 `1.49e-7` 源单位。

| 目标 | 顶点数 | 站立高 m | reference 包络误差（源单位） | 行走最低点约 m | 数值结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| CH-DOCTOR | 10,546 | 1.75 | 1.00e-7 | -0.0275 | PASS |
| CH-ENEMY | 10,156 | 1.75 | 1.05e-7 | -0.0256 | PASS |
| CH-FATHER | 10,753 | 1.75 | 5.21e-8 | -0.0419 | PASS |
| CH-LU | 10,637 | 1.75 | 8.57e-8 | -0.0206 | PASS |
| CH-LU-CHILD | 10,851 | 1.15 | 1.15e-7 | -0.0331 | PASS |
| CH-LUO | 10,351 | 1.75 | 1.29e-7 | -0.0219 | PASS |
| CH-MENG | 10,264 | 1.75 | 1.22e-7 | -0.0241 | PASS |
| CH-SHAO | 10,802 | 1.75 | 4.03e-8 | -0.0348 | PASS |
| CH-SHEN | 10,311 | 1.75 | 6.97e-8 | -0.0351 | PASS |
| CH-XU | 10,372 | 1.75 | 9.68e-8 | -0.0273 | PASS |
| CH-ZHAO | 10,194 | 1.75 | 1.39e-7 | -0.0272 | PASS |
| CH-ZHENG | 10,610 | 1.75 | 4.76e-8 | -0.0274 | PASS |
| CH-ZHOU | 10,253 | 1.75 | 1.48e-7 | -0.0342 | PASS |

详细数据分别在 `CH-*-rig-audit.json`，不是只检查 LU/ZHOU。上述行走最低点为源片段最低顶点乘运行 scale 的近似值；站立原点另有极小 source-ground 平移。未对行走每帧强行抬升角色或改原件以掩盖穿地。儿童的步幅、步态观感、衣服形变与接触仍需单独视觉检查。

## 运行资源与成本

原件来自批准的 `assets/source/tripo/CH-*/rig-v1/rig/`，只读。运行副本位于 `public/models/characters/`，canonical 位于 `public/models/animations/`。复用场景线的 `artifacts/asset-integration/scenery/resize-glb-textures.py` 串行处理所有 39 张图，4096²→1024²；PNG alpha、PBR 材质/采样/颜色空间语义、法线重归一、mesh/accessor/skin/animation JSON 与全部非图 bufferView 字节保持校验。无 Draco、Meshopt、KTX2 或外部 URI。

13 人物总大小 **129,543,064→21,845,752 bytes**；canonical **532,296 bytes**。每独立设计的 3 张图按 RGBA8+完整 mip 链估算 **256→16 MiB**；13 套同时常驻的这部分合计 **208 MiB**，未含骨纹理、几何、渲染目标、解码 CPU 副本与程序。它是理论预算，不是实测显存/手机性能。运行只请求实际出场角色；相同设计的多个租约共享纹理。所有源/运行 SHA、逐图尺寸、编码参数、非图字节校验及转换器 SHA 在 `source-runtime-manifest.json`、`CH-*-textures.json`。

## 验证边界与下一步

唯一 focused 测试：`npx vitest run tests/imported-character.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=artifacts/asset-integration/characters/focused-tests.json`，**18/18 PASS，3.89 秒**。另对本次三个 TS 模块做过 isolated `tsc --ignoreConfig ... --noEmit`，通过。恢复本轮后未重跑已通过测试，未全量测试/构建。

Node 仅替代图片→Texture 解码；节点、skin、几何、绑定与 clip 使用实际 GLTFLoader。实景仍需看：双手与枪柄、护理/携行/受制接触、脚底滑移与约 2–4 cm 穿地、儿童步态、衣服形变、多人峰值帧时及纹理呈现。当前的数值通过不能替代这些结果。
