# 开场与章节旁白接入记录

日期：2026-10-31。来源为已冻结的 chapter-bridge-01 包；用户在声音窗口明确授权制作完成直接接入，免追加逐句试听。保留完整 S01—S12 战役、约一小时目标和原存档格式。本记录不授予发布或比赛提交权限。

## 本轮行为

- 新游戏／从序章重新开始播放4句开场，同时准备S01。准备只创建离屏环境、物理与Simulation，并等待场景模型与去重后的初始角色、共享行走和AK资源；任务时钟与事实不运行。
- 只有旁白完成或跳过、真实准备结束且未暂停，才同步激活下一关并保存初始检查点。返回菜单、加载失败或迟到结果不覆盖旧战役档；失败可以重试加载。
- 关卡完成先保存源关，等关内Sound对白队列排空后自动播相邻桥，11桥共27句。S12、独立验证和失败保留原结果页。继续已完成源关会重播其桥；普通继续、检查点重试和重开本场不重播开场。
- 实际HTML媒体ended推动换句；静音仍维持时序，媒体不可用则字幕按阅读时长降级。左键跳过旁白仍等加载；Esc／按钮暂停，隐藏页与失焦暂停，BFCache返回仍保留手动暂停。全局音量同步旁白，过场阻断并清空旧触点／按键。
- HTTPS子路径与Windows封装的game://local采用同一项目内资源表；无供应商下载链接或生成服务运行依赖。

## 验证与边界

最终59文件／719项测试通过、0失败、0跳过，71.77秒；`npm run build`含全项目TypeScript检查通过。机器记录为 [full-tests.json](full-tests.json)、[build.log](build.log)。首次检查的旧目录白名单遗漏新batch，以及未提供可选原件目录时的一项跳过，原始报告保留为first-*；补明确白名单并提供实际冻结原件后全套重跑通过，没有删除断言或放宽文件校验。

其中18项真实Game宿主边界检查保留Simulation、SaveStore、Sound队列及过场控制器，控制DOM和文件I/O；完成状态是专门构造的边界fixture，不是额外真人通关。另18项真实准备模块检查覆盖取消／迟到／共享租约／完整释放，24项旁白组合检查在HTTPS与game协议下走完每个真实脚本及实际ended事件。这些专项已包含在719项总数中，不另外叠加。

478项运行源码、测试、public、桌面入口、章节合同与构建配置在最终回归前冻结，[input-manifest.json](input-manifest.json)逐项摘要在测试和构建后保持不变。NPC配速修正已经纳入这轮组合；并行路演文档和资产目录汇总脚本的后续main提交不改变这份运行输入。

旁白31 MP3为4,230,356字节、174.48秒；runtime包33文件逐字节等于生产原件，详情见[audio/README.md](audio/README.md)。所有31MP3由真实Vite服务返回HTTP 200且摘要一致，见[dev-http-narration.json](dev-http-narration.json)。静态构建278文件、91,023,459字节，见[dist-manifest.json](dist-manifest.json)。大入口分块仍触发体积提示，手机性能不据此称通过。

当前浏览器操作由Work设置禁用。本轮没有新增画面、真正媒体播放／听感、真实手机、Windows执行、GPU首帧或连续首通证据。预加载在过场中同时持有旧关与待进入关，真实峰值显存仍需设备测量；贴图／模型失败可以保留既有代理进入，不把降级ready等同正式资产视觉通过。

## 代码入口

- src/main.ts：计划绑定、宿主模式、加载与激活、存档提交、对白收尾与生命周期。
- src/chapter-transition/PreparedGameLevel.ts：实际离屏准备与资源所有权；构造内既有物理初始化及内存检查点保留，不调用Simulation.step或SaveStore。
- src/chapter-transition/HtmlNarrationPlayer.ts、narration-assets.ts：本地文件、文字一致性、音量、真实ended与game协议。
- tests/chapter-transition/game-host.test.ts、prepared-game-level.test.ts、narration-runtime.test.ts、narration-assets.test.ts：上述边界证据。

22地图运行候选、17共享战术动作及反馈窗口后续修复另批处理，没有计入本批的运行完成量。正式模型原件和旧测试证据保留。
