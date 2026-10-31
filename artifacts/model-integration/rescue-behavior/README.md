# S10 同伴自主还击修正 · 2026-10-31 16:46

用户旧 main 截图中 S10 phase0、未请求掩护时两名同伴站着，代码确有硬限制：`Simulation.canFight()` 要求 `rescue-cover-requested` 才允许郑铎战斗，而这个 fact 仅由 Q 设置；孟齐整个 rescue 场景都返回 false。入口未清理前也没有任务行走路线，因此表现为未 Q 时两人长期没有战斗动作。

本轮用真实 `buildEnvironment('rescue')`、Rapier `Simulation` 和公开 `Intent` 做两条新开场16秒短回放，没有改 facts、health、演员位置、阶段或任务状态。玩家通过移动输入来到[-6,0,189]附近并蹲伏，全程不射击。

| 观察 | 修正前，无 Q | 修正后，无 Q | 修正后，Q |
|---|---|---|---|
| 孟齐实际弹丸 | 无 | 1.22s 首发 | 1.22s 首发 |
| 郑铎实际弹丸 | 无 | 4.13s 首发 | 4.43s 首发 |
| 郑铎实际位移 | <0.00002m | 5.11m | 18.03m |
| 阶段 | 0 | 0 | 0 |

修正前 Q 线也确认郑铎可实际移动27.17m、发射弹丸并打掉敌人51点生命，表明这是战斗资格被硬锁，非模型加载或枪械渲染问题。

## 最小修改

- `src/mission/Simulation.ts`：已先报告并获 root 同意，只改 rescue 的 canFight 分支。郑铎在 phase0／2 且未开始靠近伤员时可自主战斗；孟齐仅 phase0 可以自卫。没有改动通用 mayFire、视线、友军阻挡、实际弹丸、精确到位、移动安全、伤情或剧情终态。
- `src/mission/Rescue.ts`：目标文案说明同伴自行还击，Q 是侧面阵位指令。Q 路线／事实本身未变。
- `tests/rescue-cover-start.test.ts`：实际公开输入的前后测试。
- `tests/finale-interactions.test.ts`：移除旧 Q 用例中“Q 前必须完全静止且不射击”的过时断言，仍要求 Q 后实际位移、本人弹丸和真实敌人受伤。

孟齐原 `combatLeash=0` 保留，所以开场可在原位举枪射击而不擅离剧情站位；伤后不再战斗。郑铎原战术移动与 Q 的物理侧位路线保留。友军沿任务路线移动时不开火的现有安全条件仍保留。

截图中 `rescue-entry-cleared` 后若玩家距离 `playerAssist=[-30,0,226]` 仍超过3m，或孟齐尚未真实到达 junction，phase0 继续等待是原会合条件，不是本次取消的门槛。phase2 仍必须威胁受控、郑铎到另一侧、玩家靠近并按 E 才进入共同搬运。

## 证据

- `baseline-public-intent-replay.json`、`baseline-test-output.txt`：保留原条件复现；新期待断言按预期失败，无Q两人0弹丸。
- `public-intent-replay.json`、`test-output.txt`：修正后 **1/1通过**，1.21秒；两人真实发射且任务阶段没有被伪推进。
- `q-regression-output.txt`：原 Q 功能单用例 **1/1通过**，1.04秒；郑铎移动15.81m、发射本人弹丸并命中真实敌人，玩家0弹药消耗／0命中。测试直接观察真实 Ballistics.update 返回的命中 owner，避免孟齐新增自卫先命中而错误提前结束郑铎回归。

没有浏览器／画面操作、没有整场战役回放、没有 full tests／build／commit／发布。该短回放证明新开场自卫和 Q 物理侧位功能；用户77秒旧存档的准确敌人站位和镜头并未从截图重建。
