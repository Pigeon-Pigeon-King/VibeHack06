# FB-013 · 地面交界闪烁与群众人物资产

2026-10-31。反馈窗口独立修复；主入口和真实过场预加载由主窗口统一整合。与主窗口的检查点、护送、接防及剧情推进边界保持不变。

## 地面

使用实际 `buildEnvironment()` 生成网格做向下射线检查，确认以下位置有两个共面的可见表面：

- S10 救援地面：`addGround` 与整块混凝土箱顶重叠。删除重复可见箱体，保留分区碰撞地板。
- S11 医疗站和 S12 接收区：地面平面与 `block` 顶面重叠。原 `block` 改为相同参数的 `solid`，只去掉重复渲染。
- S01／S02 西侧门口：基础延入主厅地板，门口又与楼梯平台重叠。可见基础裁至主厅地板外，并让平台覆盖其自己的跨度；原基础碰撞盒保留。
- S08 三座桥的六个端点：桥面宽度额外伸入岸边 6cm。可见桥面按桥口宽度绘制，碰撞仍保留 12cm 总搭接；支柱帽降至桥板底，避免与桥面顶重叠。

修改在 `src/presentation/{history-environments,escort-environment,rescue-environment,medical-environment,epilogue-environment}.ts`。没有改玩家高度、胶囊、台阶、导航、门或任务坐标，也没有用深度偏移掩盖整块重复表面。

新增 `tests/ground-surfaces.test.ts` 验证两段序章的门口和平台、三桥六端的两侧、支柱与 S10—S12 地面，保留关键碰撞尺寸。既有 `generated-scene-assets.test.ts`、`visual-slots.test.ts` 同时通过。导入场景资产的回退显隐和碰撞分离保持原契约。几何检查定位了确定的深度竞争；本轮未取得浏览器画面，不能据此宣称所有远处闪烁或材质问题均已解决。

## 群众

根因是 `main.ts` 为匿名序章居民单独走 `CrowdView.create()`；旧实现一直使用程序方块零件实例化，绕过了已有角色 GLB 目录。正式居民资产不是目录中缺失。

`CrowdView` 新增可选 `{ library, baseURL }` 配置，配置后所有居民通过 `ImportedCharacter` 载入实际资产。不同居民保留独立骨骼，几何体、材质、贴图和行走源由同一 `ModelLibrary` 共享；倒地进度、外层位置和显隐仍由原演员状态控制。未配置的独立占位预览保留旧批次方式。载入失败使用既有回退并上报状态，不把失败显示为正式资产已完成。当前目录通用居民使用 CH-SHEN，本轮没有新制群众衣着或脸型变体。

主入口最小接线：

```ts
private readonly crowd = new CrowdView(64, {
  library: this.modelLibrary, baseURL: document.baseURI,
});
// 使用与其他人物相同的 epoch 保护和错误汇总回调。
this.crowd.create({ id: actor.id, name: actor.name, role: actor.role }, onStatus);
```

`PreparedGameLevel` 的人物预热循环也应移除原匿名群众 `continue`，让居民资产参与过场期间的去重预热。它只需保留一份每类型资源的租约，不应为每位居民重复下载。这个正在新增的预加载文件由主窗口拥有，反馈窗口未直接覆盖。

`tests/crowd-assets.test.ts` 使用真实 GLB 和行走动画，验证 44 名居民全部达到 ready、共用同一几何和材质、独立骨架与连续倒地；验证清场／异步完成不回挂旧人，释放一个居民不释放其他居民的共享网格。Node 仅替换图片解码，不替换网格与骨骼。该文件及原 `crowd-view.test.ts` 共 5 项通过。

正式资产模式会增加蒙皮计算和人物 draw call：44 人对应 44 个身体绘制、733,656 个三角面、1,804 根实例骨骼（不含阴影重复绘制）。本机 Node 预热 30 帧后采样 60 帧，44 人仅姿态计算中位数 1.17ms、P95 1.31ms；`CROWD_ASSET_METRICS=1` 可复核。该采样没有 WebGL、纹理上传或阴影，不能推导整帧 FPS。浏览器工具当前禁用，尚无高密度群众场景的真实帧时间、手机或 Windows 画面证据。

## 移动速度接线

`CharacterMotionTracker` 按演员 ID 和模拟时间记录真实水平位移速度。同一仿真帧的多次 render 使用同一结果，避免高刷新率下跑姿／静止姿态交替；检查点倒退、显著传送、长时间断档和清场重置采样。宿主在人物 `setPose` 传入 `moveSpeed: tracker.speed(actor.id, actor.position, m.elapsed)`，清场时 `clear()`，演员删除时 `remove(actor.id)`。原 `walk` 距离相位继续保留。新增两项检查以 60Hz 物理、240Hz 呈现验证缓存及停止动作，并验证检查点与传送重置。

`CharacterModel` 的 pose 增加 `moveSpeed?: number`、`reloadFraction?: number` 可选字段。后者仅接受真实装填进度；目前 NPC 没有装填状态，不伪造 AI 装填。重复姿态闪烁根因与 13 人动作回归见 FB-012。
