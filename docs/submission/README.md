# 比赛交付与路演材料包

## 本次最终交付 · 已按用户要求停止新增录制

- 已完成45.000秒故事剪辑、8页HTML及可离线打开的ZIP。影片主文件：artifacts/trailer-45s/v2/delivery-cut/ganymede-story-trailer-45s.mp4；HTML入口：artifacts/submission/presentation/index.html。
- 依用户“不要再录制，立刻完成剪辑和html交付”，所有游戏采集均已停止，take03未启动。当前成片使用3.6秒S05有效原片，以及S01/S05两张完整加载的实机截图；其余为截图剪辑推拉与末4秒片名。影片已明确标出“实机录屏”或“实机截图”，不称为连续战斗演示。
- 使用已完成的45秒专用配乐、闻川旁白和中文字幕；按用户裁决不再等待游戏同期音效。S01损坏WebM、资源未加载完整的图片及旧northgate白盒素材全部排除。
- HTML已接入这两张实机图和最终MP4；未拍到的4个图像槽保留线稿占位，讲稿仍为120秒、影片45秒、切换余量15秒。
- 已通过Paean技能的独立临时Playwright流程完成实际采集和HTML浏览器检查；此前CUA报错仅为历史接口状态，不再作为本次HTML交付障碍。8页翻页、图片加载和内嵌影片播放通过，视频时长45.000秒，实际播放进度增加1.377秒，图片和控制台错误均为0。
- 成片完整音视频解码通过：1920×1080、30fps、1350帧、H.264＋AAC。六帧目视确认中文字幕及片名完整。用户听审及完整游戏真人验收未由本次剪辑代替。
- 来源与剪辑记录：artifacts/trailer-45s/v2/delivery-cut/manifest.json；媒体验收：同目录qa/qa.json；HTML检查：artifacts/submission/browser-qa/2026-10-31T11-01-21-647Z/result.json。

以下为按当时状态保留的历史记录；当前交付以上述结果为准。

本目录是 2026-10-31 比赛交付窗口的工作成果。材料可供主窗口审查和整合；作品发布、官网提交、完整宣传片和 Windows 实机验收没有因为这些文档存在而完成。

**当前版交付补充：** [在线游戏](https://pigeon-pigeon-king.github.io/VibeHack06/) · [Clide备用入口](https://7ja2szw7s.clide.app/) · [完整游戏镜像](https://return-to-ganymede.muddy-curry-7368.chatgpt.site) · [公开源码](https://github.com/Pigeon-Pigeon-King/VibeHack06) · [交接记录与截图归属纠正](../../artifacts/submission/RELEASE_HANDOFF_20261031.md) · [可直接使用的介绍](../../artifacts/submission/current-release-intro.md)。主窗口发布源码为 `a9030c6`，各地址及核验来源见 [release-links.json](../../artifacts/submission/release-links.json)。

[S05素材盘点](../../artifacts/submission/s05-media-inventory.md)与[拍摄清单](../../artifacts/submission/S05_CAPTURE_AND_45S.md)保留：release历史候选03／04／05来自旧 `northgate` 验证场，不是正式S05 `frontgate`。本会话浏览器接口持续返回禁用错误，而用户设置截图显示浏览已允许；原因未查明，当前尚未拍到新版素材。

**HTML 演示现已制作：** [打开本地演示](../../artifacts/submission/presentation/index.html) · [使用说明](HTML_PRESENTATION.md) · [用户修订原文](SPEECH_USER_REVISION.md)。8 页以画面为主，每页一个标题、一行说明；实机图片与45秒视频保留占位。透明标题已生成，音频制作已交给已有声音窗口；当前交付状态与离线检查见 [演示记录](../../artifacts/submission/presentation-validation.json)。本机浏览器控制被 Work 设置禁用，尚无浏览器视觉验收。

**当前结构：120 秒宣讲＋45 秒实机预告片，合计 165 秒。** 核心为“AI发展的时代，人是讲一个好故事的核心”；以木卫三被占领十年、居民盼望回归为大背景，公开措辞保持含蓄。完整内容见 [制作规划 v2](CREATIVE_PRESENTATION_PLAN.md)、[两分钟讲稿](SPEECH_2MIN.md) 和 [45 秒新版剪辑稿](../../artifacts/trailer-45s/v2/EDIT_PLAN.md)。旧版三分钟现场操作和 16 镜剪辑材料保留为历史备选，不与本版混用。

**预剪视频已实际导出：** [播放45秒预剪稿](../../artifacts/trailer-45s/v2/preedit-project/output/trailer-45s-preedit.mp4)。含音乐、闻川旁白、字幕及末4秒片名；镜头位置全程明确标记“实机镜头待补”。可在HTML备注中预览，正式影片位置仍待真实成片。

## 从这里使用

| 工作 | 文件 | 使用方式 |
| --- | --- | --- |
| 填写官网 | [表单草稿](FORM_DRAFT.md) · [结构化草稿](../../artifacts/submission/form-draft.json) | 先更新最终构建状态和真实链接，再复制文案；空字段不是已提交内容 |
| 核对比赛要求 | [规则与缺口](RULES_AND_GAPS.md) · [来源核查](../../artifacts/submission/rules-source-audit.json) | 区分公开官网、本仓库既有摘要和待登录表单字段；以文内核查日期为准 |
| 当前宣讲 | [两分钟讲稿](SPEECH_2MIN.md) · [整体制作规划](CREATIVE_PRESENTATION_PLAN.md) | 人物、世界背景、Codex 协调的制作流程；120 秒目标待真人计时 |
| 当前影片 | [45 秒 v2 剪辑稿](../../artifacts/trailer-45s/v2/EDIT_PLAN.md) · [结构化时间线](../../artifacts/trailer-45s/v2/timeline.json) | 实机视频待制作；标题与音频首版已交付，实际配音时码以声音窗口输出为准 |
| 历史现场备选 | [旧 180 秒路演稿](ROADSHOW_3MIN.md) · [本地备演操作卡](LOCAL_DEMO_RUNBOOK.md) | 旧结构含 95 秒现场玩法；本轮 165 秒结构不包含此段 |
| 检查交付包 | [打包审计](PACKAGING_AUDIT.md) · [第三方来源](THIRD_PARTY_SOURCES.md) · [审计工具](../../scripts/submission/) | 分开审计旧主线产物和待整合候选；资源扫描不等于目标设备运行通过 |
| 冻结最终版本 | [交付记录模板](../../artifacts/submission/release-record.template.json) | 复制后填入实际 commit、包散列、设备记录和提交回执；模板不得当成完成记录 |
| 主窗口整合 | [交接事项](INTEGRATION_HANDOFF.md) | 查看已经完成的准备工作、具体差异和后续证据需求 |
| 查看本窗口进度 | [局部进度](../../artifacts/submission/progress.md) | 公共 `artifacts/game-progress.md` 由主窗口汇总 |

## 版本与证据

以下记录为第一批交付包的历史基线。新版文稿的读取时点、最新世界观裁决与制作边界见 [制作规划](CREATIVE_PRESENTATION_PLAN.md#8-来源与本轮边界)；旧包／旧音频审计不能直接用来描述后来已整合的主线。

本窗口接手时主线为 `6a6da76`，随后变为 `9ec9bc6`，后者只增加并行分工说明。运行包版本号仍为 `0.6.0`，不能仅凭该版本号确认候选与旧包相同。主窗口备用工作树接手时为 `7877cbf` 加未提交修改，含触屏、资源加载、AK-47 和 S12 护航等候选工作；具体文件状态以审计记录的时刻和散列为准。

工作期间其他窗口持续写入，读取不是全仓库原子快照。[证据基线](../../artifacts/submission/evidence-baseline.json) 记录本窗口所用文档与关键入口的版本/摘要。待整合代码的状态不能据此提升为最终发布状态，资产或代码变更后需要重新审计对应产物。

收尾期间主线前进到 `0f0026f`，纳入反馈分支的序章时序、人群、战斗与自动换弹等修改。本材料保留各次真实读取基线；相关文稿单列差异复核，不能把旧审计或自动几何结果改标成新版本全项通过。候选源码包在并行改动中出现的差异见打包审计。

| 可见证据 | 可得结论 | 不能据此宣称 |
| --- | --- | --- |
| 自动输入回放、单元测试 | 相应版本中被覆盖的任务事实与回归结果 | 真人全战役首通、正常首通时长 |
| 开发检查点局部操作 | 指定场景/状态中的真实输入与可见结果 | 从序章连续玩到该段、发布版已有跳关入口 |
| 桌面浏览器触控模拟 | 特定视口布局与模拟操作结果 | iOS/Android 多指手感、长时间手机性能 |
| ZIP/ASAR/文件摘要审计 | 文件完整性、资源与许可在指定包内的状态 | Windows 启动、输入、音频和性能已通过 |
| 时间线/SRT/VTT/讲稿 | 拍摄、剪辑和排练输入可用 | 45 秒成片已拍摄、三分钟现场已排练通过 |

## 交给主窗口的顺序

1. 将美术、声音、反馈和手机模块整合到一份可回溯的运行版本；声明仍保留的占位资产和未验事项。
2. 冻结代码与运行资源，记录 commit、锁文件及实际文件散列。在隔离输出中构建，复查对应网页和 Windows 包。不要覆盖其他窗口正在使用的 `dist` 或 `release`。
3. 从同一构建按 v2 镜头稿拍摄宣传片，保存原始带 HUD 镜头、录制方法及检查点来源。排练 120 秒宣讲＋45 秒影片，三分钟场次留 15 秒余量；如另做现场玩法展示，再使用历史备演卡。
4. 根据实际构建更新表单文案，补入真实的队伍、工具、网站和源码链接。主窗口已完成Clide入口、GitHub Pages、公开仓库及完整GPT Site部署；Glowin邀请待接受，本窗口不重复发布或邀请。
5. 当前链接已写入交付记录；实际游戏操作与官网提交回执分别保存，HTTP文件检查和已发布页面不能代替比赛提交回执。

本窗口没有修改原剧情、运行代码、共享资产、已有 Git 历史或公共进度。已批准 GLB/声音继续遵循本项目资产流程；托管路线不会自动取消这些批准。
