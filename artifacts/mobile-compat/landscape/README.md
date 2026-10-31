# 手机横屏独立候选验收

2026-10-31。独立检出 `/Users/penguin/VibeHack06-mobile-controls`，分支 `codex/mobile-controls`，基线 `a408a970feabe941158cf3a78d20bae8bd406506`。没有远程仓库，没有合并main。项目当前UI、动作映射与批准资源作为基线；本轮只实现浮动左摇杆、操作区域内缩、触屏横屏限制及相应HUD布局。

## 自动检查

- `tsc --noEmit`：通过。
- Vitest限定 `touch-mobile`、`touch-controls`、`touch-input`、`page-lifecycle`、`chapter-transition/input` 五个文件，单worker依次执行：**72／72通过**，无跳过，2.65秒。没有重跑全战役测试，也不将旧全量结果归到当前候选。
- 新增14项直接实例化TouchControls／Input／TransitionInputGuard的事件回归，详见 [agent-review.md](agent-review.md)。覆盖双指所有权、取消／捕获丢失、resize／visualViewport、竖屏暂停一次、回横屏不自动恢复、过场初始化顺序、修饰点击不穿透和dispose。
- 最终Vite生产构建通过，119模块，6.33秒。构建仍提示既有大chunk：入口JS约5.66MB、护航分块约2.72MB（未gzip）；本轮未改资源打包策略，也未把构建耗时当成手机性能。
- `git diff --check`通过。主项目 `src/ui/TouchControls.ts` 和 `src/ui/touch-controls.css` 与主项目HEAD无差异。该检查是只读；其他窗口未提交内容保持原样。

复现命令（在独立检出执行）：

```sh
/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc --noEmit
/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin/node node_modules/vitest/vitest.mjs run tests/touch-mobile.test.ts tests/touch-controls.test.ts tests/touch-input.test.ts tests/page-lifecycle.test.ts tests/chapter-transition/input.test.ts --maxWorkers=1 --no-file-parallelism
/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin/node node_modules/vite/bin/vite.js build --outDir artifacts/mobile-compat/landscape/dist
python3 -m http.server 5295 --bind 127.0.0.1 --directory artifacts/mobile-compat/landscape
```

生产预览：`http://127.0.0.1:5295/preview.html?game=dist/`；直接游戏：`http://127.0.0.1:5295/dist/`。仅本机，不是手机公网链接。`dist`未纳入Git。开发依赖的node_modules符号链接只供本机校验，不进入dist；没有新增运行时共享目录或CDN依赖。

## 实际页面操作

使用原生Safari 26.6.2窗口，经CUA操作，DPR=2。Work设置禁用浏览器自动化入口，因此未改设置、未用Playwright绕过。QA外壳只调整同源iframe尺寸、显式模拟CSS安全区并读取公开DOM；没有调试传送、隐藏状态注入或自动走线。鼠标产生单接触指针事件；多指由事件回归覆盖，不能冒称真机多指。

| 检查 | 实际结果与证据 |
| --- | --- |
| 开发版S01，844×390 | 从两个不同左侧起点拖动，摇杆局部圆心先为52.5／170.2，再为167.5／100.2；松手后held为空、stick归零。中心随每次触点改变。 |
| 667×375加左右44px／底部21px模拟安全区 | 最初长字幕形成中央竖列；重排后横向使用安全宽度、18px台词不缩小。[修正前](before-subtitle-667x375-safe.png)／[修正后](s01-667x375-safe-fixed.png)。 |
| 游戏转390×844竖屏 | 显示横屏提示，暂停并清持有输入；回横屏仍为暂停，焦点交给继续行动。[竖屏](portrait-pause.png)／[回横屏](return-landscape-paused.png)。 |
| 生产版开场过场旋转 | 提示覆盖章节层；过场显示已暂停。点击提示后未跳过，回横屏仍等待继续。[竖屏](production-transition-portrait.png)／[横屏等待继续](production-transition-resume.png)。 |
| 生产版北闸667×375加模拟安全区 | 目标、生命、弹药、暂停、字幕和战斗按钮均可辨认，无相互挤压。[画面](production-combat-667x375-safe.png)／[公开DOM布局](production-combat-layout.ax.txt)。 |
| 生产版开火／换弹／移动／暂停 | 按住开火800ms后弹匣25→18；点击换弹出现装填中，结束为25／143。左侧拖动后松手，暂停时held为空；实际位置变化可见。[844×390画面](production-combat-844x390.png)／[暂停输入状态](production-combat-input.ax.txt)。 |
| 1024×768 | 只检查了暂停菜单可读与按钮可见，未完成此尺寸的战斗布局检查。[画面](production-pause-1024x768.png)。 |

667×375安全区模拟下公开DOM测得：左侧启动区x=76、宽204.1；右侧动作网格x=419、宽172，右缘距屏边76；底部距边45；暂停44×44；字幕x=76、宽515、高41，位于HUD下方y=103。此处44px是测试外壳手动增加，**不是真实env(safe-area-inset-*)的设备读数**。

QA外壳的JSON每800ms更新，截图紧随操作时可能包含上一帧viewport／mode。过场隐藏game-interface而不刷新其data-mode，因此该字段会保留menu；过场结论以实际“已暂停”按钮状态、覆盖画面与输入回归为依据。保存检查记录触发Safari下载提示，已取消；当前证据为直接截图与AX文本，没有声称下载JSON成功。

## 资产与边界

本轮所有新增视觉内容都是项目内CSS、HTML与手写SVG；原有摇杆环形反馈直接复用。没有新图片、音频、模型或外部媒体引用，没有导入研究项目的素材。Paean与场景参考的适用边界见 [方案](../../../docs/mobile-compat/LANDSCAPE_CONTROLS.md)。现有桌面FPS批准的GLB／音频仍为原基线，不在本轮重做范围。

NOT_RUN：iOS Safari／Android Chrome真机、真实多指手感、系统边缘返回与Home手势、浏览器地址栏伸缩、原生旋转／BFCache、持续负载与发热、Windows EXE、完整战役正常速度首通。当前结果证明本轮实现和桌面Safari手机尺寸的实际页面操作，不是移动端整体性能或发布就绪结论。

## 最终字节摘要

| 文件 | SHA-256 |
| --- | --- |
| TouchControls.ts | dc7b5a45cb20e9b77080e63e72a80229ce974459213819ff1fb02cd7bb5efea2 |
| touch-controls.css | 63ef86b4e037bbfd55b08a0c2f94d61ce624352a7954605bfa56222b196e1006 |
| touch-mobile.test.ts | f519468d3c53b64f443d982c940310c42d4aeea778d5c9876635f1b8d8c62418 |
| dist/assets/index-BLIyujCs.js | 2f20416b49aab185a1c0982b8689425a288ca6b3f912da2643364f2e3e07fda1 |
| dist/assets/index-uUZyamQ7.css | d30bd0d69b968668b0941587d0d4fae4436ece230534307844df7980d2f864e1 |
