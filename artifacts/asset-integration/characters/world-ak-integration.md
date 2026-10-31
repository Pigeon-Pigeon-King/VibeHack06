# NPC 世界 AK 接线

本次只改 `ImportedCharacter.ts`、`WorldAK47.ts` 及其两个 focused 测试。已接到现有 NPC 构造链，无需 main 再挂一遍；未修改人物／第一人称通用工厂、射击、弹丸、导航或任务。此记录替代本目录早期 README 中“第三人称仍显示原占位枪”的状态。

`ImportedCharacter` 找到自己的 `carbine-placeholder / sidearm-placeholder` 枪座后调用：

```ts
attachWorldAK47(socket, { library, source: ak47Source(baseURL) });
```

盟友、敌兵、邵原等 opponent、父亲，以及原入口把 role 映射为 enemy 的 `hall-invader-*` 都通过该路径。没有枪座的儿童、医护、工人、平民、患者车不会多挂武器。可从 `character.worldWeapon?.state / ready / muzzle` 观察独立武器结果；人物 `ready` 仍仅代表人物加载尝试。武器失败保留旧枪，`character.retry()` 会同时重试已失败的武器；不自动重试循环。

## 尺寸与原锚点

原独立模块校准枪长 0.89 m 后仍继承旧枪座 0.68，导致最终仅 0.6052 m。本次保持旧枪座 position / rotation / scale 和 armed / carrying 可见规则，只在导入挂载层围绕原握持锚 `[0, -0.14, -0.02]` 施加 `1 / 0.68 = 1.4705882353`。失败和 dispose 不改变旧枪尺寸。

实际读取全部可见 AK 顶点，郑铎、敌兵、邵原、父亲、主厅敌兵这五个真实 `ImportedCharacter` 的最终沿枪管长度均为 **0.8900000000000023 m**。actor yaw 为 0.73 时，枪口方向与角色 `+Z` 前向 dot 为 **0.9999986249**。每把可见 **10 mesh / 23,644 triangles**；无 LOD，资源共享不等于减少每实例绘制数。

carbine 的原 `muzzle` 对象保持同一身份，只重挂到真实 `MuzzleDeviceTip`；没有原 muzzle 的 sidearm 拥有一个同用途标记。瞄准、放低、蹲伏、倒地之后均断言它与实际枪口位置一致；销毁恢复原父子关系及变换。未改变仿真弹道起点，也没有在第一人称重复挂世界枪。

## 共享与释放

游戏路径复用已有 `ModelLibrary`，source 的 id、revision、URL 与第一人称 `ImportedWeaponView` 完全相同。并发 NPC 与第一人称只触发一次 `ModelLoader` 调用；共享 geometry、material 和 texture，节点/弹匣变换各实例独立。几何校准也按共享 receiver geometry 的 WeakMap 缓存，避免每个 NPC 重扫全部顶点。

原 `WorldAK47Pool` 保留给独立工具调用；NPC 明确传 library，不会使用另一个下载或 GPU 资源池。适配器先检查销毁状态再消费已 fulfilled 租约；单个等待者取消不撤掉兄弟请求。dispose 先恢复旧 muzzle 并 detach 导入子树，再 `lease.dispose()`，最后 fallback 通用清理；原 `registerModelDisposer` 作为树清理防线保留。测试证明第一人称和首个 NPC 退出时共享资源不释放，最后 NPC 退出时 geometry / material / texture 各释放一次。

## 证据与边界

- `world-ak-npc-calibration.json`：五个真实 NPC 的顶点长度、前向、mesh/triangle、源摘要与缩放元数据。
- `world-ak-focused-tests.json`：**15/15 PASS，697 ms**；原世界枪 9 项、共享 ModelLibrary 新增 3 项、实际 NPC 新增 3 项。人物原 18 项按名称筛选跳过，没有重复计数或全量测试。
- `world-ak-validation.json`：命令、文件指纹、GLB 摘要和数值证据索引。本次四个 TS 文件的 isolated strict typecheck 通过，`git diff --check` 通过。

focused 命令：`npx vitest run tests/world-ak47.test.ts tests/imported-character.test.ts --maxWorkers=1 -t 'world AK|NPC world AK' --reporter=default --reporter=json --outputFile.json=artifacts/asset-integration/characters/world-ak-focused-tests.json`。

源仍为已许可的项目内 `WP-AK47`，SHA-256 `d121eb62491e7f2cc573cd7bdb04e4a482f1eca3b16df7976b2ee2306ea4e1c1`，2,046,524 bytes，CC0 几何与 MIT 适配许可沿用 `public/licenses/WP-AK47/`。没有下载、付费生成或资产改写。

测试使用真实 GLTFLoader 解析几何/节点/材质，仅替代 Node 图片解码。**未运行浏览器，不是视觉通过**；双手与握把/护木接触、PBR 画面、多人峰值性能仍待实景验收。枪体没有供应商动画，本次不增加 NPC 换弹或后坐动画。
