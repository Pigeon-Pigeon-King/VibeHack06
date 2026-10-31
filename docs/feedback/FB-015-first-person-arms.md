# FB-015：第一人称双臂复用当前主角资产

2026-10-31。状态：叶模块、真实 GLB 数值回归与类型检查通过；主入口的主角身份接线由主窗口整合。浏览器被 Work 设置禁用，没有桌面／手机渲染或手型艺术验收，未绕过限制。

## 资产与运行行为

`src/presentation/FirstPersonArms.ts` 从 `ModelLibrary.acquire()` 得到当前主角的独立骨架实例，按原始蒙皮权重筛选同一只手臂的三角面。三个顶点必须各自至少有 0.7 权重属于同侧 Upperarm／Forearm／Hand 及其 Twist 骨，并通过肩部外侧平面筛选；躯干、头、腿和武器外附件不进入可见几何。保留选中三角面的全部原始顶点属性、UV、法线、蒙皮索引／权重和材质，保留实际骨架、逆绑定和各人物比例。没有新建手臂模型、下载素材或调用生成服务。

| 当前身份 | 使用的运行资产 | 裁切后双臂三角面 |
| --- | --- | ---: |
| 陆闻川 · 十九岁 | `public/models/characters/ch-lu-rig-v1.glb` | 4,276 |
| 周延 · 二十三岁／三十三岁 | `public/models/characters/ch-zhou-rig-v1.glb` | 4,843 |
| 陆闻川 · 九岁 | `public/models/characters/ch-lu-child-rig-v1.glb` | 3,757 |

每实例只拥有新裁切的 Geometry 和独立骨架；材质、纹理与原始几何仍由 ModelLibrary 的租约管理。换角先释放本实例裁切缓冲，再释放租约；不会通过占位模型的递归销毁误释放共享材质。加载失败或取消时保留可见的占位手臂，成功后同时隐藏左右占位臂。旧请求晚到、同角色重复请求、重试及重复销毁均有回归。

`src/presentation/ImportedWeaponView.ts` 保留现有枪体、弹匣、机柄、瞄具、枪口和外层收枪接口，新增真实弹匣握持标记。右手掌按原枪 `gripTarget` 对齐；左手在 support 与随弹匣一起移动的握持点间插值。手臂 IK 在武器局部坐标求解，先去掉完整祖先仿射矩阵，避免相机俯仰、偏航、非等比父级缩放污染求解；外层 HeldItemMotion 在 `setPose()` 后整体收枪时仍共用同一变换。

## 宿主接入

`ImportedWeaponView` 新增接口：

```ts
setCharacter(identity: CharacterIdentity, baseURL: string): Promise<void>;
readonly armsReady: Promise<void>;
readonly armsStatus: FirstPersonArmsStatus;
retryArms(): Promise<void>;
```

`armsStatus.state` 区分 placeholder／loading／ready／error／disposed，并提供 assetId。`setCharacter()` 会在本次尝试结束时 settle，失败保留后备；成功是否完成通过状态判断。同一资产／baseURL 的重复调用不重新取得租约。`retryArms()` 独立于既有枪体 `retry()`。

主入口需要在建立 Simulation、切换章节／当前主角和恢复相应存档后调用 `weapon.setCharacter(identity, document.baseURI)`。身份使用 `id: 'player'` 与 `sim.player.name`；目录按 `' · '` 前的姓名匹配成年陆闻川和周延。儿童应按 childhood／prologue 段落及九岁身份判断并给 `role: 'child'`，成年人给 `role: 'ally'`。不能依据动态的 `player.height` 或蹲姿判断儿童，否则按 C 就可能换成儿童模型。原有 `weapon.setPose(recoil, reloadFraction, ads, walk)` 继续每帧驱动，不需要另一套手臂时钟。

本叶模块不改变开枪权限。儿童模型能够被读取和摆放，不表示儿童持枪或成人 AK 尺寸已获艺术批准。只有上层已经允许展示武器时才展示同根的双臂；搬运、收枪等仍由既有 HeldItemMotion 控制。

## 验证与现实边界

执行真实 GLTFLoader，仅读图步骤替换为空 Texture；网格、UV、材质对象、骨架和逆绑定都来自实际 GLB：

```sh
node node_modules/vitest/vitest.mjs run tests/first-person-arms.test.ts tests/imported-weapon.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

两个定向文件合计 26 项通过，类型检查通过。加 `FIRST_PERSON_ARMS_METRICS=1` 与 `--disableConsoleIntercept` 可查看数值。

- 三个人物逐顶点核对裁切属性与原件完全一致，材质对象共享，骨架和裁切 Geometry 独立；实际三角面均来自原网格。
- 三个人物各采 121 个装填相位，并重复每帧。最大相邻关节差 0.194262 rad，重复帧误差小于 1e-6 rad；掌心代理对握点的最大误差约 1.06e-7m。
- 加入有偏航／俯仰／位置与非等比缩放的祖先节点、相机缩放及 HeldItemMotion 后续下移／后移／俯仰变换，握点仍保持误差小于 0.1mm。最初世界坐标求解在此检查有约 5.14cm 偏差，改为武器局部坐标求解后通过。
- 在 16:9、844:390 和 390:844 的数值视锥中，三个真实蒙皮的左右臂均有可见顶点。完全收枪后，在腰射／ADS、普通持枪／装填／拉机柄采样中，没有手臂蒙皮顶点留在视锥内；测试使用实际变形后顶点，不把原始 POSITION 当作蒙皮结果。
- 既有枪体尺寸、真实铁瞄准线、枪口、后坐、弹匣／机柄复位和共享资源寿命回归继续通过。

掌心标记和骨骼解算通过只证明几何接口连续。现有生成模型没有独立手指骨，保持原始刚性手型；手指包裹枪柄、枪身穿插、袖口切边、近景权重形变、儿童与成人步枪适配、实际材质观感及最坏帧时间仍需获准的浏览器／Windows 实机检查。节点与三角面数量不是 GPU 性能实测，本轮不宣称已完成人类观看验收。
