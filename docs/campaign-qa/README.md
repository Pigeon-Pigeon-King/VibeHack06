# 独立战役验收汇总 · 2026-10-31

**本轮十二段正常公开输入回放均有通过记录；S01、S11各完成了一次真实浏览器段落，S02完成真实失败／重试／刷新继续。完整S01–S12连续浏览器首通、真人55–70分钟时长、Windows和手机实机仍为`NOT_RUN`。** 全战役验收事实源为 [verification.json](../../artifacts/campaign-qa/qa/verification.json)，整体状态保持`NOT_RUN`。

本窗口按用户要求实际启动三名`gpt-6-astra`、`max`子代理，分别负责S01–S04、S05–S08、S09–S12。审查并行，物理回放和浏览器串行。没有修改任务、Simulation、导航、站位或主窗口入口，没有制作资产或执行发布。

## 候选与证据边界

- 接手main：`6a6da762a2f1cdded5b43749a16451ed7936839f`。
- 被测输入：备用工作树`7877cbf0e7c5f8f93aeb5b6f402fce9ed3d4923a`及2026-10-31 **12:42:44北京时间**冻结的未提交内容。140个源码／资源／配置／测试文件，聚合SHA-256为`24699d53881f950b92c0cb0ca4c435c44b16c55f0bef67167f698558bf305713`，详见 [candidate-lock.json](../../artifacts/campaign-qa/candidate-lock.json)。
- 测试中原工作树可继续开发，本轮始终使用副本。收尾时main已到`043c8b6`；它只做了本窗口辅助配置的类型兼容检查，未用这份旧候选证据替代新main玩法验收。
- 当前副本位置：`artifacts/campaign-qa/node_modules/locked-candidate-20261031/`。运行时原位置在`.candidate-runtime-20261031/`；因Vitest也扫描隐藏目录，收尾做了等内容迁移，140文件摘要再次一致，见 [candidate-location.json](../../artifacts/campaign-qa/candidate-location.json)。原日志中的旧路径保留为历史事实。5197本机服务已经停止。
- 依赖通过本地symlink复用，约定不改安装内容，缓存独立；不是操作系统强制的只读挂载。没有复制private资料、原始生产资产或其它窗口的未提交美术／声音工作。
- Git保留汇总、原始测试裁决、最小必要检查点和代表画面；逐步浏览器状态、长物理轨迹、逐阶段检查点及中间图仍完整留在本机授权目录，不长期入Git。其路径、大小与SHA在`artifacts/campaign-qa/local-detail-manifest.json`。本报告中的本地详细证据链接需要该工作区，单独克隆仓库不会包含这些忽略文件。

## 重要结果与问题

1. **没有新增经运行复现的P0/P1。** 冻结候选的S02父亲／儿童演出顺序仍是反馈窗口正在处理的既有P1；本轮静态确认，并未完成它的全段视觉复验。
2. **新增P2 CQA-S12-01**：正常冲刺完成尾声接收时，郑铎距玩家167.625米，仍有3个路线目标；完成后仿真停止，他不会到达。四个接收对象和存档正确，因此属于叙事／空间连续性问题。详见 [复现清单](ISSUES.md)。
3. **真实掩护有实证**：S05有9次同伴飞行弹丸命中、153伤害，郑铎击倒2敌；S09有20次无玩家射击或遗留玩家弹丸的同伴命中；S10记录Q后及真实快照恢复后的郑铎弹丸使敌生命68→51。S07/S08当前路线未测到同伴伤害，仍保留局部缺口。
4. **协作门槛有实证**：S08离位清零、恢复后重新完成8秒协作、医护缺席不推进；S10倒退／返回与伙伴归位、双手占用限制通过；S12离门与离位恢复期间队列停止，回位后4个对象真实到达。
5. **普通失败与剧情结果分开**：S02/S05/S07/S09/S10已有真实敌弹致死和检查点恢复证据；S11浏览器自然到“周延死亡已确认、孟齐继续治疗”时玩家仍100生命、正常运行。

## 十二段覆盖矩阵

这里的“正常回放”是以合法`Intent`驱动真实物理／任务，驾驶器知情地读取导航和目标；它不证明浏览器画面、陌生玩家引导或真人体验。构造边界快照在分报告中另列，不计正常路线。`局部PASS`只描述该列明确写出的检查，完整恢复矩阵未测项仍保留。

| 段落 | 正常回放 | 正常仿真秒 | 正常／跳过比较 | 本轮恢复／失败重点 | 浏览器完整段落 |
| --- | --- | ---: | --- | --- | --- |
| S01 检修门 | PASS | 90.37* | PASS | 浏览器从序章重开PASS；中途存档NOT_RUN | PASS，页面00:43 |
| S02 主厅 | PASS | 60.92 | PASS | 坍塌恢复、普通死亡／重试、刷新继续PASS；行进恢复FAIL超时 | NOT_RUN；已实际开门、作战、失败与重试 |
| S03 夜班 | PASS | 49.98 | PASS | 搬运真实检查点恢复PASS | NOT_RUN |
| S04 港务人员 | PASS | 144.42 | NOT_RUN | 双门恢复、普通失败／重试均框架FAIL超时；两者有完整终态观察 | NOT_RUN |
| S05 北闸 | PASS | 119.07 | NOT_RUN | 未到齐门槛、真实敌弹死亡／精确重试PASS | NOT_RUN |
| S06 转接门 | PASS | 115.98 | NOT_RUN | 完整恢复续跑NOT_RUN | NOT_RUN |
| S07 交给别人 | PASS | 211.62 | NOT_RUN | 未到齐门槛、真实死亡／重试PASS | NOT_RUN |
| S08 留下护送 | PASS | 388.75 | NOT_RUN | 换车离位／严格存读／返回PASS；普通死亡未触发，重试NOT_RUN | NOT_RUN |
| S09 接受换班 | PASS | 256.20 | NOT_RUN | 普通死亡／重试、恢复后真实掩护PASS | NOT_RUN |
| S10 共同撤回 | PASS | 230.70 | NOT_RUN | 普通死亡／重试、Q后恢复、搬运倒退再归位PASS | NOT_RUN |
| S11 救护点 | PASS | 136.18 | NOT_RUN | 真实阶段存读、E门槛、浏览器重开PASS | PASS，页面11:22** |
| S12 进场之前 | PASS | 144.07 | NOT_RUN | 扶门离位／离位恢复／回位4对象接收PASS | NOT_RUN |

\* S01源回归特意包含60秒延迟输入，不是玩家用时。

\** 浏览器S11含工具派发等待、绕桌与转向修正、空闲观察；全段墙钟约882.5秒，游戏显示682秒。S01浏览器整次会话还包括S02失败恢复等操作，约402秒墙钟。不能把这些时间累计为全战役首通，不能据此填写一小时达标。

真实UI切章只完成S01→S02。S08自然终态通过实际`carryFacts`接续S09→S12，后四段仿真总767.15秒；此前各段独立入口不拼称S01→S12连续首通。完整首通实际时长：**NOT_RUN**。

## 回归裁决与原始失败

| 分组 | 本轮裁决 | 需保留的失败／限制 |
| --- | --- | --- |
| [S01–S04](s01-s04.md) | 13项：10 PASS／3 FAIL | 三次墙钟超时，没有业务断言错误；局部终态成功不覆盖框架FAIL |
| [S05–S08](s05-s08.md) | 累计13项：12 PASS／1 FAIL | S08死亡诊断终点仍82HP，没有触发失败；补跑S05–S07另保存3 PASS |
| [S09–S12](s09-s12.md) | 六个唯一选定组最终6 PASS | 首轮4 PASS／2 driver FAIL；修独立采样／等候驱动后定向2 PASS，原失败保留；扩展跳过／逐阶段完整续跑组NOT_RUN |
| [浏览器](browser.md) | S01、S11独立完整；S02失败恢复与真实续玩 | 独立Chromium无法锁鼠标，使用既有方向键替代；S11两次控制工具点击超时保留，第一次操作实际已经生效 |

S05–S08首轮还有一次测试工具虚拟模块解析失败，0项测试，已另存，未计入业务用例。诊断工具失误、宿主超时和实际游戏问题分别登记；本轮没有通过增大原用例超时、改生产任务条件或注入完成事实制造通过。

## 复现与接手

辅助文件独占`tests/campaign-qa/`，证据独占`artifacts/campaign-qa/`，说明独占`docs/campaign-qa/`。公共`artifacts/game-progress.md`由主窗口汇总，本窗口未改。

本机Node在`/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin/`。对**本轮旧候选**复查可用以下入口，并保持单worker、与浏览器串行。收尾已将回放默认输出改为`artifacts/campaign-qa/replays/<分组>-<时间>/`，自动保留本轮旧结果；可显式设置`QA_EVIDENCE_DIR`到新的目录。该路径维护只做语法／类型检查，没有冒称重新运行物理。

```sh
export PATH=/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin:$PATH
export QA_CANDIDATE_ROOT=/Users/penguin/VibeHack06/artifacts/campaign-qa/node_modules/locked-candidate-20261031
export CAMPAIGN_QA_CANDIDATE="$QA_CANDIDATE_ROOT"

# A、B要求明确候选参数；C配置默认也指向上述隔离目录。
node tests/campaign-qa/s01-s04.mjs "$QA_CANDIDATE_ROOT"
node tests/campaign-qa/s05-s08.run.mjs remaining-natural
node node_modules/vitest/vitest.mjs run --config tests/campaign-qa/s09-s12.config.mjs

# 真实浏览器操作需先启动冻结候选服务；记录器使用新的runId。
node node_modules/vite/bin/vite.js --config tests/campaign-qa/browser.config.mts
node tests/campaign-qa/browser-session.mjs new-run-id
```

这些是独立命令入口，不建议一次并发执行。新版本应重新冻结并生成新清单，复用本轮输入方法，不能覆盖旧版本事实。

收尾检查：[final-checks.json](../../artifacts/campaign-qa/final-checks.json)。`npm run typecheck`通过；默认Vitest文件清单恢复为main自己的30个测试文件，没有冻结副本或`*.check.mjs`。本轮没有追加无差别全量回归。

主窗口的优先后续是：在新整合版本验证既有S02修复；低负载定向复查三条超时；补S08真实死亡重试与S07/S08有效掩护窗口；修S12郑铎未到场问题；再完成统一版本的连续浏览器首通、正常／跳过／恢复矩阵及目标设备真人时长。未发布网站、未上传GitHub、未提交比赛。
