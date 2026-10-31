# 冻结候选的浏览器操作证据

被测版本为 [candidate-lock.json](../../artifacts/campaign-qa/candidate-lock.json) 的 `7877cbf+dirty` 快照，聚合摘要 `24699d53881f950b92c0cb0ca4c435c44b16c55f0bef67167f698558bf305713`。独立本机入口 `http://127.0.0.1:5197/`，不操作主窗口的5191或其它窗口标签页。

本轮浏览器工具操作与真人首通分开。使用干净的 Chromium 151.0.7922.34 headless context、1366×768、Darwin arm64；未修改游戏时钟、任务、人物、弹药或本机存档。驾驶者已读源码与路线，不能据此证明陌生玩家能找到路线。性能、声音听感、真实手机、Windows和原生鼠标锁定均不由此通过。

## S01正常完成、切章与S02失败恢复

[原始输入和状态记录](../../artifacts/campaign-qa/browser/s01-first-pass/session.json) 共32条，2026-10-31北京时间13:07:25至13:14:07；约402秒墙钟含导航、取图、观察、操作准备、等待和重试，不能当作首通用时。进程随后通过stdin EOF正常退出0；后续工具只补了stop时主动结束stdin的清理，不改游戏或本轮证据。

| 检查 | 实际操作与观察 | 结论 |
| --- | --- | --- |
| 干净启动／真实渲染 | 新context打开菜单，画布正常显示；页面错误、console error与HTTP≥400记录均为空 | PASS |
| S01任务输入 | 从序章开始；E收饭盒；方向键/W跟父亲；近距出现提示后E挪床垫；走近检修门 | PASS |
| S01正常演出与结果 | 未按Enter；23秒演出自然推进，显示“隔断合拢”；儿童被带走、父亲留下；结果页显示00:43 | PASS，只有S01完整浏览器段落 |
| S01→S02真实切章 | 点击“继续 · 主厅”；人物为周延·二十三岁；累计计时保留，主厅开门目标出现 | PASS |
| S02输入／普通受伤 | E开门；移动；F开火，25发变14发；普通敌弹造成生命下降；无调试注入 | PASS |
| S02普通失败 | 后续暴露期间出现“你倒下了”，累计计时01:55；0/6居民仍未完成，任务未被当作剧情结局 | PASS |
| S02重试 | 点击重试检查点；回到开门后phase1、(-19,0,4)、100生命、25/150弹药、0/6居民，累计计时回到约00:45 | PASS；未继续打完主厅 |
| 菜单／刷新／继续 | 暂停回菜单，刷新仍有“继续 · 主厅”；点击后恢复同一phase1状态与物资 | PASS，真实浏览器存储链 |
| 重新开始 | 返回菜单点击“从序章重新开始”；回到S01、九岁闻川、phase0、事实0、00:00、100生命 | PASS |
| S02完整通关至S12 | 本次到普通失败、重试与刷新验证为止 | NOT_RUN |

主要画面：[S01开始](../../artifacts/campaign-qa/browser/s01-first-pass/s01-start.png)、[门口交接](../../artifacts/campaign-qa/browser/s01-first-pass/s01-door.png)、[S01自然结果](../../artifacts/campaign-qa/browser/s01-first-pass/s01-natural-outcome.png)、[S02切章](../../artifacts/campaign-qa/browser/s01-first-pass/s02-from-s01.png)、[普通失败](../../artifacts/campaign-qa/browser/s01-first-pass/s02-failure-result.png)、[重试](../../artifacts/campaign-qa/browser/s01-first-pass/s02-retry.png)、[刷新继续](../../artifacts/campaign-qa/browser/s01-first-pass/s02-persisted-continue.png)、[S01重开](../../artifacts/campaign-qa/browser/s01-first-pass/s01-clean-restart.png)。

S02有两张文件名含failure的早期尝试图，实际状态仍为playing、生命尚未归零；其真实结果以session中的mode和页面文字为准，**不作为失败结果证据**。只有`s02-failure-result.png`对应真实failed界面。

## S11独立新开场正常完成与重开

[S11原始记录](../../artifacts/campaign-qa/browser/s11-natural/session.json)来自第二个干净context，2026-10-31北京时间13:18:52至13:33:34，共39条记录。实际从开发菜单S11独立按钮进入；**没有导入检查点、没有Enter跳过**，不是从S10连续切章。

| 检查 | 实际观察 | 结论 |
| --- | --- | --- |
| 装备交接 | 走到登记处E接装备，手持箱子；在9米外按E不推进；绕过实体桌子后近距E放下 | PASS |
| 记录与探视 | 走到记录台E交付；再实际走到允许探视点，自动进入phase4 | PASS |
| 自动救治与剧情结果 | 未按跳过，后续进入phase7；UI明确“周延死亡已确认，孟齐继续治疗”，玩家100生命、mode=playing | PASS；不是普通战斗失败 |
| 陪伴与离场 | 走到许岚旁E放水，陪伴正常结束；自动收到通信，走到出口后phase10、完整结果页 | PASS |
| 重开 | 点“重开本场”回到phase0、(-399,0,72)、100生命，只保留初始`rescue-both-received`和`meng-treatment-continues`两事实 | PASS |
| 逐帧接触／音频听感 | 没有连续录像或真人听感检查 | NOT_RUN |

页面终态显示 **11:22**。约882.5秒墙钟和该游戏计时均包含工具派发、检查画面、错误转向后的正常走路修正及空闲等待；不能把这一段的工具操作时间当作普通玩家节奏或全战役时长。自然物理回放的S11为136.18秒，二者的输入、等待和用途不同，不相互替代。

页面错误、console error与HTTP错误记录为空；有两条自动化点击超时：第一条按钮点击已经执行、之后观察到S11运行，第二条是在S11已运行时再次找菜单按钮而超时。原始错误均保留，属于控制工具／采样过程，不能算游戏拒绝进入。阶段5/6没有逐帧录像；phase4实景、无跳过输入以及phase7事实与后续终态证明本次自然推进，不能据此宣布完整接触动画已经验收。

主要画面：[实际登记位置](../../artifacts/campaign-qa/browser/s11-natural/s11-registration-active.png)、[装备交出](../../artifacts/campaign-qa/browser/s11-natural/s11-equipment-delivered.png)、[记录交出](../../artifacts/campaign-qa/browser/s11-natural/s11-records-delivered.png)、[探视](../../artifacts/campaign-qa/browser/s11-natural/s11-visit-approach.png)、[医疗结果与100生命](../../artifacts/campaign-qa/browser/s11-natural/s11-medical-outcome.png)、[放水陪伴](../../artifacts/campaign-qa/browser/s11-natural/s11-water-and-rest.png)、[接受帮助](../../artifacts/campaign-qa/browser/s11-natural/s11-accepts-help.png)、[完成页](../../artifacts/campaign-qa/browser/s11-natural/s11-exit-approach.png)、[重开](../../artifacts/campaign-qa/browser/s11-natural/s11-clean-restart.png)。

## 输入与工具限制

该独立浏览器没有获得Pointer Lock，游戏按既定替代方案显示提示并允许方向键转向。操作记录使用方向键、WASD、Shift、E、F、Escape及实际按钮点击；没有把这一限制登记为游戏P1，也没有声称鼠标体验通过。按键按住的实际效果受自动化派发延迟影响，必须按页面反馈校正，不能把脚本计划的毫秒数当成精确游戏时长。

最初CUA派发中止／超时及node_repl模块导入失败保存在 [browser-control-attempts.json](../../artifacts/campaign-qa/browser-control-attempts.json)，不计游戏启动或渲染失败。备用工具 [browser-session.mjs](../../tests/campaign-qa/browser-session.mjs) 使用已经安装的Playwright和Chromium；每次独立runId、公开输入、截图、错误、实际URL与版本清单摘要均落盘。导入检查点会单独记录路径和SHA，不与新开场混记。本次S01/S02运行没有导入检查点。

本记录分别证明S01和S11的启动、画面、输入、任务循环、结果和重开，并证明S02的失败恢复及真实刷新续玩。完整S01–S12首通和55–70分钟真人时长仍未验证。
