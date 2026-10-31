# FB-018：主厅堵门人群与班长连续倒地

2026-10-31。状态：演出叶模块、真实 Simulation／Rapier／存档回归及真实 GLB 数值检查通过，主入口需接下述三个班长姿态字段。没有改配音时刻、门／楼梯／隔断碰撞、通用 AI、弹丸伤害或六人撤离规则。浏览器被 Work 设置禁用，未绕过；本项没有桌面／手机实际渲染、真人观看或接触动作艺术验收。

## 根因与演出变化

原 `Opening.ts` 的 `fleeingCrowdPosition()` 在 13.2 秒敌军突入之后才把每人向西移 1—1.75 米，因此远端居民不可能在屠杀前赶到检修口。`hallTableau()` 又始终把玩家视线限制在东面的赵启明附近，西侧检修口处于背后。单改人群坐标无法让玩家看到堵门。

新增 `src/content/OpeningCrowd.ts`，只处理 32 名 `late-civilian-*`。从 phase 4 开始按各自反应延迟离开原位，依实际大厅 SolidSpec 寻找清障路径，近人先到、远人随后赶到。在原检修口大厅一侧形成四人前排和不规则密集后群；目标点使用明显不同的前后／左右位置，取消均匀网格加小抖动。人群不跨过西墙门槛。下层隔断已关闭，前排在门口停住，后人有限地前挤、侧移寻找间隙，并在敌军突入后回头；每人的推挤只有两次有限尝试，之后停住，不反复原地滑步。

轨迹以 60Hz 固定步进预计算，使用 0.31 米静态障碍扩张及 0.66 米人间隔离。静态净空来自实际场景；父亲掩护位和倒地防守者另外作为演出避让空间。相邻纠正没有重叠时立即结束迭代；相同 SolidSpec 引用和相同碰撞签名都复用同一个计划，签名缓存最多保留两种形状。现有 Simulation 构造后的 Opening 恢复入口先预热，因此 phase 4 开始和正常存档恢复不会重新烘焙。步态相位用实际累积行进米数乘 4，停止后不再播放走路。

每个受害者在其原定 `openingCrowdHitTime()` 精确时刻取样并冻结落点。正常播放、恢复后播放和 Enter 跳过共用这些位置。已有尸体保留保存的坐标、朝向和死亡事实，旧档已经执行的枪击不重播；原 6 名任务居民、12 名 `evac-crowd-*` 和安全的母女／幼年闻川不进入拥堵或受害者列表。

## 镜位、净空与固定时序

最初试验的南侧观察点 `[-10,0,16]` 在低视点下被原长椅挡住部分群众：真实 Rapier 射线命中 `history-bench--10-11.4`，命中高度约 0.76 米。最终将纯演出锚点设为：

- 玩家受压点 `H.rubblePlayer = [-14,0,16]`，位于长椅西南侧；已有 rubble／rafter 视觉按相同偏移移动，未增加碰撞。
- 班长受控点 `H.zhaoCaptured = [-5.5,0,14]`，位于长椅南侧，距玩家约 8.73 米。地面步枪沿已有 `H.zhaoCaptured` 引用自动移动。
- 班长从 7 秒轰炸警告开始收向此处，13.7 秒到位，直线速度约 3.75 米／秒。邵原仍于 13.2 秒从公共入口进入，用 8.5 秒走到处决位，约 4.83 米／秒。
- 实际路径检查同时发现群众枪手原直线会穿过东侧长椅；仅将该受控演出路径改成绕过椅端的折线，4.1 秒到位。其首发、群众伤亡、捕获和处决时刻没有变化。另一名控制班长的敌兵仍在入口内侧用枪口控制。

`src/content/OpeningStaging.ts` 以保存的故事时间求视线。先随人流看西门；13.6—16 秒平滑转向班长和正在走近的邵原，突入、首轮射击与“把他的枪踢开”在同一观察段内衔接；到认人台词时双方在视锥内，之后保持处决区域。视线没有独立计时器、瞬间 180 度转向或新增摇晃，重复帧、暂停和恢复不会启动新的镜头过程。lowMotion 沿用零摇晃；固定时序仍为 bombardment 7、collapse 10.4、breach 13.2、crowdAttack 13.9、capture 14.3、recognition 16、massacreEnd 19.1、roar 20.7、execution 24.6、unconscious 28.6、finish 31.6 秒。

S01 仍是同一大厅／西门／楼梯／隔断空间，孩子先到隔断后且失去对大厅的视线，S02 才允许坍塌和突入。既有真实前期操作路径回归保留。

## 班长倒地与宿主接入

原人物渲染在 `down=true` 时立即丢弃 `kneeling`，恢复站立的绑定姿势，再使用最终趴地姿态。仅添加一个从零开始的 fallProgress 会先站起来，仍然不连续。

`ImportedCharacter.ts` 的同一共享倒地分支现在允许 `down + kneeling + restrained` 表达倒地起点。在 fallProgress 为 0 时，先完整求解与活着时完全一致的受控跪姿；最初短段保留膝部支撑并产生受击躯干反应，然后逐渐释放腿部支撑、展开手臂并旋转落地。1.25 秒后与已有共享最终倒地姿态一致。没有新增或冒充供应商倒地动画。`characters.ts` 的加载失败后备人物也接收相同 fallProgress，保留相同跪姿起点。

依据本机 Three.js 0.186.0 的 `SkinnedMesh.updateMatrixWorld()` 源码，最终姿态从人物根向下更新全部祖先／网格矩阵，确保新下落变换与 `bindMatrixInverse` 一起更新。只更新 GLB 根而不更新上层姿态组，会让 CPU 蒙皮使用前一套逆绑定变换；本项真实顶点检查找到了并修复这一不一致。

`OpeningView` 新增：

```ts
commanderFallProgress: number; // 执行后 (savedTime - 24.6) / 1.25，钳制到 0..1
commanderKneeling: boolean;    // down 期间仍描述起始跪姿
commanderRestrained: boolean;  // down 期间仍描述起始反绑姿态
```

主窗口在 `main.ts` 调 `item.model.setPose()` 的现有循环中，将 mainhall 的 `actor.id === 'zhao'` 接到这三个字段：班长 fallProgress 优先于普通敌军的首次倒地采样；kneeling／restrained 使用新的 commander 字段，其他人物保留原条件。现有 `history.restrained` 字段仍保留其“尚未执行”的含义。群众继续使用原定每人命中时刻的显式 fallProgress。

新演出事实 `history-crowd-jam-v1` 在新 phase 4 入口记录；旧存档中仍活着的班长可升级到新倒地过程。旧档已倒或已有 `zhao-executed` 时不补标记；没有此标记或没有 `history-timeline-v2` 的执行旧档直接返回 fallProgress 1，避免复活或重新受击。全部语音／枪击事件仍由原事实集合去重。

## 验证记录与限制

以下 8 个文件合计 **100 项通过**，均使用 `--maxWorkers=1`；类型检查和 `git diff --check` 通过：

```sh
node node_modules/vitest/vitest.mjs run tests/opening-crowd-jam.test.ts tests/opening-timeline.test.ts tests/prologue-enemy-staging.test.ts --maxWorkers=1
# 32 项通过
node node_modules/vitest/vitest.mjs run tests/commander-fall.test.ts tests/opening-presentation.test.ts --maxWorkers=1
# 10 项通过
node node_modules/vitest/vitest.mjs run tests/character-motion.test.ts tests/imported-character.test.ts tests/opening-paths.test.ts --maxWorkers=1
# 58 项通过
node node_modules/typescript/bin/tsc --noEmit
```

可加 `OPENING_JAM_METRICS=1 --reporter=verbose` 查看本项数值。真实 GLTFLoader 只替换 Node 不具备的图像解码；骨架、逆绑定、三角面与顶点来自当前赵启明／邵原 GLB。

代码提交为 `17e3643`。主代理另外在最终代码上执行 `character-motion / imported-character / ground-surfaces / world-signage` 四文件，75 项通过（8.09 秒，串行单 worker）；其中 53 项人物检查与上表重叠，新增复核用于确认移动瓦砾表现后地面与实物路牌仍成立，不能与 100 项直接相加。

| 检查 | 本轮证据 |
| --- | --- |
| 临门聚集 | 13.2 秒全部 32 人在门内约 0.8—5.3 米深的拥堵区，最远到门中心约 5.59 米 |
| 行进／隔离 | 60Hz 全程两两中心间距最小 0.66001 米；最高实际位移速度约 3.734 米／秒 |
| 实际静态净空 | 10Hz 轨迹点逐个用真实大厅 Rapier 胶囊净空查询；没有墙／柱／长椅穿越；赵、邵和两名突入者另按真实 Simulation 全程逐帧检查净空与最大步长 |
| 路径构造 | 冷构造从约 504 毫秒降至约 67.9 毫秒；相同数组及新建的相同碰撞描述均返回相同缓存对象。此值是本机 Node 构造耗时，不是浏览器帧率 |
| 两种画幅 | 75° 垂直 FOV，16:9 与 9:16：13.2／13.9 秒的 32 个胸高目标均在视锥内且没有静态实体遮挡；门口同样在视锥内 |
| 认人与处决 | 真实变形蒙皮采样顶点在两画幅内；16 秒赵身体投影高约屏高 10.0%、邵约 3.02%；24.6 秒分别约 10.07%、10.12%；班长完整倒地过程仍在视锥内 |
| 跪姿与落地连续性 | fall=0 与受控跪姿关节／蒙皮差小于 1e-6；75 段连续采样最大关节角差约 0.07118rad、蒙皮位移约 0.05999 米；重复相位完全稳定；骨段长度保持 |
| 地面结果 | 班长落地头部关节高约 0.184 米，最低采样蒙皮顶点约 0.00358 米；没有先恢复到站姿；终姿与共享最终倒地姿态相同 |
| 存档／跳过 | 真 Simulation 经 SaveStore 序列化后逐步恢复一致；新尸体落点、事件事实和受害人数精确一致。已有尸体自定义旧坐标保留且不重播枪击；安全工人的静止 Rapier 支撑末态允许 1 毫米误差，未拉回或新增受害者 |
| 前期场景 | 既有儿童视角、真实六人出门和楼梯撤离、门外敌人边界、既有 GLB 行走／跑蹲／生命周期回归继续通过 |

视锥和静态 LOS 证明演出不再在镜头背后或被长椅完全挡住，不等同于 32 人在最终渲染中彼此都无遮挡。16 秒邵原是远景人形，未宣称该距离能辨认脸部细节；两名近处人物的手／枪接触、群众互相遮挡、衣服／肢体接触、推挤情绪、跪姿到倒地的观感，以及实际 GPU 性能仍需获准后在桌面、手机浏览器或 Windows 运行版观看确认。本轮没有新资产生产、外部下载、费用调用或发布。
