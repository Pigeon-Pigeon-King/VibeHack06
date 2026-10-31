# 章节过场模块接入说明

模块已独立实现，主战役尚未接线。入口为 `src/chapter-transition/index.ts`；11 段旁白的正文和 ID 位于 `bridges.json`。本轮仅新增独立文件，没有修改 `src/main.ts`、`GameUI.ts`、`contracts.ts`、`Sound.ts` 或各关任务脚本。

## 运行与检查

在项目根目录运行：

```sh
npx vitest run tests/chapter-transition
npx tsc --noEmit -p scripts/chapter-transition/tsconfig.json
npx vite --config scripts/chapter-transition/vite.config.mjs
```

预览地址为 `http://127.0.0.1:5198/dev/chapter-transition/`。它用模拟加载器展示快速加载、慢速加载和首次失败后重试，便于隔离检查调度。当前没有正式旁白音频，按清单阅读时长播放字幕。预览不保存游戏进度，也不加载真实战役。独立构建命令：

```sh
npx vite build --config scripts/chapter-transition/vite.config.mjs
```

产物位于 `artifacts/chapter-transition/preview-dist/`，主游戏的 `dist/` 独立。配置使用相对 base，无运行时 CDN、远程声音或共享库绝对路径。

## 在主窗口接线

1. 在战役任务完成后，先保存已完成的源关检查点。调用 `planCampaignTransition(chapter, { scenario, complete, failed, elapsed, facts })`。它只为连续战役的相邻关卡生成计划；失败、独立验证场景和最终 S12 不产生过场。再次完成判断或重复回调应复用该次计划，避免累计两次时间。
2. 启动过场前停下 simulation.step，禁用并 clear 游戏输入，暂停战斗音频和旧 HUD。保留已有 pointer lock；`Input` 在 enabled=false 时不响应解锁引发的暂停事件。挂载 overlay 的父节点必须位于宿主 inert 子树之外。
3. `preload` 根据计划准备下一关资源、物理与呈现对象，使用传入的 AbortSignal 和进度回调。准备阶段不修改当前 chapter、事实、检查点，不运行下一关任务计时，也不提前触发剧情。
4. `enter(prepared, bridge)` 在一个未暂停的 RAF 中只调用一次。宿主同步转交 prepared 的所有权，安装新场景和 simulation，采用计划中的 chapter/facts，清空输入，保存新关初始检查点，恢复运行。所有可能异步失败的准备放在 preload；enter 抛错表示没有激活或写盘，控制器会释放 prepared 并显示返回菜单。如果激活已经提交，保存失败应作为已激活场景的存档错误处理，不能再向控制器抛出“未提交”错误。
5. 同步移除正常连续战役的旧“下一段”按钮调用。不要在过场期间继续画旧 complete overlay；失败重试、独立验证、终章完成与返回菜单保留各自原有入口。

当前 `Game.load()` 会立即销毁旧关，不能直接当成 preload。主窗口应把“准备资源与对象”和“激活／销毁旧场景”拆开。准备结果可持有主窗口现有 ModelLibrary 的资源 lease；交付后由新场景释放，取消或迟到交付由本模块 release 释放。loader 返回 ready 必须代表达到可进入标准，不能只代表下载完成。单个失败资源的部分清理由 loader 负责；控制器只收到完整的成功结果。

建议宿主伪码：

```ts
const plan = planCampaignTransition(chapter, completedMission);
if (plan) {
  // Persist the completed source checkpoint before changing campaign state.
  freezeGameplayAndClearInput();
  transition.start(plan.bridge);
}

// Inject these ports when creating the persistent transition shell.
preload: (_bridge, signal, onProgress) => prepareLevel(plan, signal, onProgress),
enter: prepared => commitPreparedLevel(prepared, plan),
release: prepared => prepared.dispose(),
```

以上函数名表示宿主需要实现的职责，不是现有游戏 API。计划应绑定到一次 run 的不可变上下文；新过场不要复用已经变化的全局 plan 闭包。

## 输入、暂停与恢复

左键在松开形成 click 后跳过整桥旁白；控制器随后在 tick 里检查加载是否就绪。上一关尚未松开的最后一枪不跳过旁白，本过场中按住的鼠标点击与重复按键也会在自动进入后排空。原生按钮可以通过 Tab、Enter 和空格操作，Escape 暂停或继续。宿主仍须在开始和进入时 clear 输入，且在 overlay 期间保持 Input.enabled=false。

复用一个 ChapterTransition 实例；不要在 enter 内立即 dispose 这层输入监听，否则会失去对未松开输入的排空。离开整个游戏或销毁宿主时再 dispose。无框架宿主也可只用 TransitionController，自行提供输入和 DOM。

浏览器 shell 对手动暂停、隐藏标签页和可见窗口失焦分别处理。返回窗口会重置时间基准，手动暂停仍需玩家主动继续。音频静音时照常按 ended 完成；缺失、过期文字、播放被阻止或媒体失败时按可读时长降级，避免死锁。

pointer lock 一旦丢失，浏览器可能要求新的用户手势才能恢复。本模块不会假装已经重获锁定。正常过场保持已有锁定可实现连续进入；重新取得锁定的提示与后备转向沿用宿主既有处理。首次播放被浏览器阻止时，字幕仍可自动推进。

继续已完成的源关存档时，重新从该桥开头播放即可；不需要把旁白百分比写进检查点。取消、失败或播放期间退出都保留源关完成状态。真实加载失败时可重试，进入提交异常仅可返回菜单。

## 旁白接口

`HtmlNarrationPlayer` 接收条目数组和以 `/` 结尾的本地音频 base URL：

```ts
{
  cueId: 'bridge-s01-s02-01',
  text: '与 bridges.json 中的原文完全一致',
  file: 'bridge-s01-s02-01.ogg',
  durationSeconds: 7.23
}
```

text 必须精确匹配，避免文案改过仍播放旧配音。file 相对 base，不得是在线供应商链接。单 cue 一个文件，以真实 ended 作为字幕切换依据；durationSeconds 记录实测长度，用于清单核验，不替代 ended。标题和视点提示不朗读。背景音乐和关内对白仍由现有 Sound 系统混音；接线时在过场期间停关内对白，并让全局静音和音量同步调用 narration.setVolume。

## 合入后需要的真实战役验收

- S01 完成后换到 S02，明确回溯同一场失守；S02 至 S03 十年跳转。两关事实使用既有 carryFacts 白名单。
- S08 至 S11 真实护送完成、接防完成和医疗事件按原条件触发；在准备期间不得预演下一关任务或推进事实。
- 完成后存档再继续、过场中返回菜单、加载失败重试、慢速加载、旁白结束自动进入、左键跳过；每次只写一次下一关初始状态。
- 持续射击时完成关卡、按住 F 或鼠标跨越过场、丢失 pointer lock、切出窗口、静音和实际旁白断句。
- 桌面与窄屏的字幕可读性、按钮焦点和错误状态；正式主游戏构建及 Windows 封装检查。

这些是宿主接入验收范围，独立控制器测试不替代它们。2026-10-31 当前浏览器操作因 Work 设置禁用，未取得浏览器画面或真人验收证据。
