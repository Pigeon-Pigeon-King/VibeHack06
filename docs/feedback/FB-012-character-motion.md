# FB-012：人物行走闪姿与动作接入

2026-10-31。状态：呈现层修复与真实 GLB 数值回归通过；移动速度的宿主接线由主窗口整合。没有浏览器／手机画面验收，本记录不把骨骼数值通过写成动作艺术验收。

## 根因与资产覆盖

当前运行目录只有 `public/models/animations/walk-canonical-v1.glb`。其中 `walk_in_place` 与 `walk_forward` 是同一来源的原地／带根位移版本，13 个运行人物 GLB 自身没有动画片段。没有已接入的正式跑步、蹲行或装填片段。

继续检查主工作区被忽略的原件后，确认 `assets/source/tripo/shared-animations/tactical-v1/` 已另行产出 17 片段候选，包含供应商 idle／run 和项目 authored ready／crouch／cover 族；本工作树的运行目录尚未接入。每个人物的约 2.5MB 动作包已独立烘焙，`runtime-adapter.js` 要求不能再套行走重定向；纹理优化运行版还需通过 `rig-contracts.json` 的真实骨架／逆绑定核对。其 manifest 明确 `inspectionCandidateOnly=true`、`universalVisualMotionApproval=false`、`visualAcceptance=NOT_REVIEWED`，列出肩胸、衣摆等局部权重拉伸，儿童持枪标为未批准。因此应称为“已生产、待整合和观看的候选”，不能称作没有生产动作，也不能写成普遍已验收。本轮程序化补充不改变该批候选的审核状态；是否纳入本轮运行由主窗口整合裁决。

真实 `walk_in_place` 含 123 条轨道，每条 141 个采样，时长 2.3333332539 秒。首尾最大关节角差 0.0009159946 rad，约 0.0525°，出现在 `R_Calf`；位置轨道首尾差小于 0.1mm。`walk_forward` 的 1.4935047 原始单位根位移是其用途，不能当作原地循环接缝。

显著闪姿来自运行顺序：`ImportedCharacter.setPose()` 每次先执行 `restoreCharacterRig()`，再调用 `AnimationMixer.setTime()`。本地安装的 Three.js 0.186.0 在 `src/animation/PropertyMixer.js` 的 `apply()` 中只比较前后积累缓存；值相同就跳过写回。该缓存不知道骨骼刚被外部恢复成绑定姿势，也不知道其后叠加的程序化瞄准／转头。高刷新率下两次 render 读同一个仿真步，或者保持相同行走距离并改变上身动作，就会暴露这个问题。

在修复前的真实 CH-LU 上，连续两次输入 `walk=2.3`，最大世界关节角变化为 1.1620209464 rad（约 66.58°），关节位置变化 0.3158501m，按每 31 个顶点采样的蒙皮变化 0.3681120m。儿童在相同行走距离先瞄准再恢复时也出现 0.9023432 rad 的差异。新增回归在修改前确实失败。

## 修复与公开接口

- `src/presentation/CharacterRig.ts` 新增 `CharacterClipSampler(clip, rig)`，每次显式写入所有轨道。`sample(time, loop = true, weight = 1)` 的权重相对捕获的原始骨架姿势，每次结果独立于上一帧；轨道缓冲继续共享，插值器按人物实例持有。没有使用 Three.js 私有缓存或增加动画时钟。
- `ImportedCharacter` 保留仿真拥有世界位移。标准行走仍由 `walk / 4` 米与 canonical 步幅确定相位，首尾原始数据不被重写。恢复骨架后先采样基础姿势，再叠加程序化姿态。
- `src/presentation/CharacterMotion.ts` 提供 `sampleCharacterGait(distanceMeters, heightMeters, gait, legLengthMeters)`。`run` 与 `crouch` 分别有步幅、支撑／摆动阶段和脚抬高；步幅按每个真实骨架腿长确定。支撑阶段的局部脚后移恰好抵消向前的世界位移。儿童沿用自己的骨架、腿长和脚锚点。
- `CharacterBonePoser` 的 `aim()`、`leg()` 增加可选权重，`lean()` 只转动腰部以上，避免绕脚底倾斜整个人而抬离支撑脚；脚掌保持世界水平。原有瞄准、下蹲、跪姿、搬运、照护、受控和倒地接口继续可用。
- `ImportedCharacter.setPose()` 接受 `moveSpeed?: number`（实际米／秒）与 `reloadFraction?: number`（0／未给表示不装填，0—1 表示进度）。2.6—3.8m/s 逐步进入跑姿；蹲伏移动触发短步幅。装填阶段为左手取／装弹匣、右手伸向机柄的程序化姿态，仍需真实装填状态驱动。当前 NPC 没有装填状态，不能宣称 AI 已经完成装填动作接入。

宿主需要把这两个可选字段加入 `CharacterModel` 合约，并在角色更新处传入真实移动速度。速度应按仿真时间变化计算并缓存，同一仿真时间的重复 render 必须复用同一速度；否则会重新造成高刷新率下移动／静止姿态交替。不能用名义导航速度冒充真实移动速度。普通第一人称 Shift／C／ADS／R 与 NPC 行为状态的接线由各自宿主负责。

共享骨骼名称已按运行 GLB 核对：`Root / Hip / Pelvis / Waist / Spine01 / Spine02 / NeckTwist01 / NeckTwist02 / Head`；四肢为 `L_`／`R_` 加 `Clavicle / Upperarm / Forearm / Hand / Thigh / Calf / Foot / ToeBase`，另有 Twist01／02。`CharacterBonePoser.aim()` 的方向采用游戏人物的 +Z 前方坐标，`leg()` 的目标与膝朝向使用世界坐标。

## 验证与界限

Node 22.14.0，安装的 Three.js 0.186.0，真实 GLTFLoader 解码网格、UV、蒙皮、骨骼、材质和动画，仅把图片解码替换为空 Texture。执行：

```sh
node node_modules/vitest/vitest.mjs run tests/character-motion.test.ts tests/imported-character.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

两个定向文件共 53 项通过，类型检查通过。动作数值输出可加 `CHARACTER_MOTION_METRICS=1` 和 Vitest 参数 `--disableConsoleIntercept` 复核。普通回归不再覆盖历史人物审计文件；显式 `WRITE_CHARACTER_AUDIT=1` 才重新导出。

13 个角色每个采样 241 个行走帧，覆盖两圈并重复每帧；跑步和蹲行各采两圈并重复每帧。修后同帧骨骼与蒙皮不再跳变（重复关节角／位置阈值 1e-6），原地重复一整圈也一致。标准行走按一圈 120 等分测得最大相邻角差 0.1760097 rad；这包含片段本身的正常关节运动，不是重复 render 的误差。

跑步／蹲行另外每圈取 12 个姿态检查全部蒙皮顶点：保守包围球占用半径最大比例为 0.470549，没有因这些姿态越出已有裁剪范围；腿段长度误差小于 0.1mm；脚踝相对目标的最大误差 0.0000118m。测试也覆盖停步、蹲行脚部变化、装填进度差异、上身姿态恢复、异步加载／销毁与实例独立性。没有改动世界位置、物理、伤害或剧情。

仍需通过获准的浏览器执行桌面／手机连续观看：步态节奏、足底完整接触、转弯、武器握持、衣物扭曲、多人动作接触、最坏场景渲染成本与真人观感。当前 Work 设置禁用浏览器，未绕过限制；本轮没有新生成资产、下载素材或模型费用，也没有发布。

## 连续倒地补充

`CharacterMotionTracker.fallProgress(id, down, simulationTime)` 与速度采样共用宿主生命周期。每帧都应调用，包括人物仍存活的帧；第一次观察到活人变为倒地时返回 0，随后用 0.65 秒仿真时间走到 1。相同仿真时刻重复 render 或暂停保持原进度，首见已倒下的人、时间倒退读档均直接使用落地姿态。`remove()`／`clear()` 同时清除两种记录。

该进度只驱动共享人物表现，不改生命值、伤害、物理体或剧情事实。S02 班长和群众分别使用脚本自己的保存时间进度，优先于普通演员的这个采样器；班长受控跪姿的衔接见 [FB-018](FB-018-opening-crowd-and-execution.md)。

`tests/character-motion-tracker.test.ts` 共 4 项通过，覆盖速度缓存／跳跃式位置改变、重复时间、暂停、死亡边沿、终态、读档与释放后重新观察。辅助代码提交为 `6c02a45`，宿主接线交主窗口整合。
