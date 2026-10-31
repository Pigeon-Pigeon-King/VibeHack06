# Nativue 项目架构画布

本项目使用本地 Nativue CLI 建立有文档、代码和测试证据的架构图。配置为中文、Codex、manual 模式；通过当前会话读取分析包并导入语义结果。后台模型 runner 与远程同步均未启用。

## 画布的含义

当前材料同时包括交接与设计文档、共享运行模块、三个缩短白盒、S01→S12 连续开发流程、本机持久存档、回归测试和实际输入证据。完整一小时战役、正式资产和 Windows 实机交付仍是计划节点，不能因为已有便携包而标成完成。

- observed：引用的文档要求、代码职责或实际存在的资源。
- inferred：拟定的系统关系、未完成的内容扩展与生产流程。
- verified：仅用于有实际测试／运行记录支持的窄范围能力；节点描述必须同时说明验证边界。

这三个词表示**依据属于哪一类**，不表示成品进度。比如“患者到达后才推进”通过测试，可以称该机制已验证，但不代表推车动作、人物模型和场景已经达到成品标准。“已观察”也不等于已经玩过：它可能只是确认文档写了这条要求、代码中存在这个模块。2026-10-31用户要求按完整战役演出评价质量，当前总体仍是功能白盒。制作阶段、现有缺口和恢复后的优先级见 [完成标准与当前差距](PRODUCTION_READINESS.md)。

玩家输入、弹丸、导航、任务、控制权、场景／UI、持久存档与桌面容器引用实际源码。三条验证线引用 [首轮历史证据](../artifacts/final-evidence.md)，S03／S04 引用 [0.2 证据](../artifacts/chapter-evidence.md)，新序章与北闸引用 [0.3 证据](../artifacts/opening-evidence.md)，转接门／侧翼引用 [0.4 证据](../artifacts/transfer-evidence.md)，护送／接防历史引用 [0.5证据](../artifacts/escort-evidence.md)，当前自主推进与后三段引用 [0.6证据](../artifacts/autonomy-finale-evidence.md)。

S02、S04、S05完整链路目前由真实场地的模拟输入回放证明；S01浏览器已实际完成，S02只覆盖开门与交火，S04只覆盖报告与首轮交火，S05尚未实际操作。S06浏览器完成包含对白检查点恢复与跳过；S07只覆盖登梯与交火。S08／S09完整公开输入回放通过，浏览器分别覆盖入口实操和真实检查点恢复后的局部监控、换车、护理／回复；完整首通仍待补验。图中的“已验证”只对应节点声明的能力与证据范围。

点击节点查看职责与证据，沿边查看需求约束和当前代码关系。旅程区分已有白盒回放、资产制作路线和下一阶段完整战役扩展。

## 0.5 画布历史归档

0.5初次归档为36个模块、62条关系、4条旅程，索引157个文本文件；新增S08、S09、独立离站监控、移位与护理，更新九段连续流程、60项存储检查及104＋10项验证。已实际选择S08、S09并打开对应源码；截图与详细验证范围见 [0.5证据](../artifacts/escort-evidence.md)。

2026-10-31此前校准保留模块ID和关系：S01—S09节点名称明确标注“白盒”，测试节点改称“机制回归”，人物图标明用户已确认而模型尚未制作；恢复后的旅程先经过HUD、资产和连续动作的表现验收，再扩展剩余战役。最新索引数量与提交由实时扫描给出。上述更名解释完成度，不代表游戏运行内容已经升级。

## 0.6 自主推进与完整白盒

本轮保留原模块 ID，更新 `mission`、`actors`、`gates`、`staging`、`persistence`、`presentation`、`chapter`、`s01`—`s09`、`qa`，增加 S10—S12、自主推进及角色骨架验收规划。证据为 126 项主回归、28 项独立场地检查与明确标注的浏览器局部观察。更新必须使用 main 当前真实分析请求，不能沿用旧 inputId。

开发旅程现为完整白盒及自主推进审查 → 人工首通与节奏 → 美术／声音审查与正式制作 → 成品／Windows验收。骨架规范为已记录的要求，正式骨架是待产后检查项；美术、反馈和声音窗口的独立工作不凭窗口已创建就标为通过。

具体节点关系与触发裁决见 [自主推进审查](AUTONOMY_AUDIT.md)。新图的数量、来源提交和待分析状态以实际快照为准。用户提出的原作、完整一小时时长和视觉完成标准均保持。

## 本地启动

2026-10-31 反馈整合：本次分析保留既有稳定 ID，整合字幕与手持物过渡的已有证据，并定义 **58 模块、120 关系、4 旅程**。新增命中确认、目标淡化、序章时间轴与群众、后续因果、自动换弹和错落站位节点；战斗 AI 从待实现更新为已实现及窄范围验证。依据为 [本轮证据](../artifacts/feedback/FB-007/EVIDENCE.md)：236 项机制测试通过、28 例通路取得通过（含一例原预算重测），主线构建通过且 107 个源码／测试／配置／dist 文件散列匹配。最终群众布局目前只有主厅局部截图，不能称为完整演出验收。

本次须重新读取真实分析包及变化文件后导入；先前表现层 51 模块候选两次因来源变化被拒绝的记录保留为历史，不沿用其旧 inputId。实际是否导入、来源和变化状态以本机快照与工作台为准。手机、战役验收、交付及资产窗口有独立工作流，未审核的并行产物不会因存在文件就升级为 verified。

在项目根目录运行已安装的 CLI：

```sh
nativue serve . --port 4317
```

终端会输出实际访问地址。若端口占用，可换端口或使用 `--port 0` 让系统分配；以终端返回的本机 URL 为准。服务只监听本机回环地址。

当前工作区已初始化；不要重复 init 覆盖现有配置。新电脑首次建立可使用：

```sh
nativue init . --tool codex --language zh --mode manual
nativue doctor .
nativue scan .
nativue analyze .
```

## 文档或代码变更后的刷新

1. 运行 `nativue scan .` 和 `nativue analyze .`。
2. 读取 `.nativue/analysis-request.json`，按其中真实 inputId、文件索引和项目变更重新分析。
3. 将 schemaVersion 为 1 的 modules、edges、journeys 保存到 `.nativue/analysis-response.json`。所有证据引用现存且被索引的路径与行号。
4. 运行 `nativue import-analysis .nativue/analysis-response.json .`。
5. 运行 `nativue doctor .` 与 `nativue check .`，再查看图中证据和关系。

源文件改变会使旧分析过期；应重新读新的分析包，不通过替换旧结果的 inputId 强行导入。服务的文件扫描可以自动刷新，语义更新仍由交互分析完成，不能称为已启用无人值守模型分析。

## 扫描范围

本轮本地配置将仍在写入、且尚未由本画布审核的并行生产区排除：`artifacts/asset-jobs/`、`artifacts/campaign-qa/`、`artifacts/mobile-compat/`、`artifacts/submission/`、`artifacts/trailer-45s/`、`assets/source/`、`design/audio/`、`docs/campaign-qa/`、`docs/mobile-compat/`、`docs/submission/`、`scripts/submission/`、`tests/campaign-qa/`。这些文件仍完整保留在项目中，窗口归属由 `docs/PARALLEL_WORKSTREAMS.md` 表示；它们的持续日志变化不参与这张主线代码图的来源校验。当前 58 个节点的文件证据均在扫描范围内。后续审核这些工作流时应逐项重新纳入，而不是从本图推断其完成状态。

当前 CLI 内建排除名为 `build` 和 `runtime` 的目录，因此被索引的文本文件不包含 `build/BUILD_BRIEF.md`、`src/runtime/Physics.ts` 与 `src/runtime/random.ts`。这不是代码缺失。画布里的身体／物理节点引用已索引的 Simulation 调用、输入模块和实际测试证据；直接源码仍可从仓库读取。没有修改扫描器排除规则或伪造文件索引。截图与超限原始 HTML 也不会作为带行号的代码证据；准确文件数量以每次真实分析请求为准。

## 来源与本机状态

`.nativue/` 已由 Git 忽略，里面保存配置、真实请求、分析结果和运行状态。源版本与文件散列由扫描记录；以当前快照中的 branch、commit、dirty 和 analysis.status 判断版本。

原交接图 [product-graph.json](handoff/current/architecture/product-graph.json) 是另一种产品资料格式，保留原样，不作为当前运行状态直接导入。当前来源归并见 [交接记录](HANDOFF_RECONCILIATION.md)。

没有建立 A／B／C 批次，也没有独立 C 评审或用户验收记录。当前会话完成了代码测试与浏览器操作，详见验证记录；Codex 可执行文件被检测到，与已验证后台模型集成是两件事。
