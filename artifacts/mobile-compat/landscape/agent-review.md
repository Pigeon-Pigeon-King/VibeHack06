# 浮动摇杆与横屏限制独立审查

2026-10-31。本轮仅在独立检出 `/Users/penguin/VibeHack06-mobile-controls` 工作，分支 `codex/mobile-controls`，基线 `a408a970feabe941158cf3a78d20bae8bd406506`，没有 remote。未向 main 写入本轮测试、未合并、未提交。源码由主窗口持有；本审查只新增 `tests/touch-mobile.test.ts` 和本报告。

## 结果

限定测试 **14 项全部通过**，类型检查通过。未在最终候选中发现可以确认的 P1／P2 输入逻辑缺陷。用户选择仅横屏，因此触屏竖屏阻挡符合当前范围；没有按 Paean 的默认双向要求反向改变用户选择、重写战役架构或删除已授权的 GLB／音频。

审查期间发现并交主窗口修复了一个过场输入穿透边界：最初 `guardPortrait` 对所有事件的 Ctrl／Meta 修饰都放行，修饰的 pointerdown／click 可进入既有 `TransitionInputGuard` 并被当成剧情跳过。最终只在 keydown／keyup 中豁免键盘组合，带修饰键的 pointer／mouse／click 仍阻断；真实两层守卫组合回归现已通过。

主窗口同时识别并修复过场显示边界：章节切换会隐藏整个 `#game-ui`，横屏提示现在挂到 `#app` 直属并在 CSS 中高于过场层；transition 暂停通过现有 pause callback 在微任务执行，避开 `showTransition` 先 render、后 `transition.start()` 的同步顺序。本测试覆盖该顺序和取消路径，但没有浏览器画面证明 z-index 效果。

## 本轮测试

```sh
/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin/node node_modules/vitest/vitest.mjs run tests/touch-mobile.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin/node node_modules/typescript/bin/tsc --noEmit
```

最终 Vitest：`1 passed (1)`，`14 passed (14)`，启动时间 16:28:47（本机），时长 11.53s。未运行全量测试。此前首版 11 项通过；主窗口补入过场防护后先保留并通过原 11 项，再加入 3 项边界测试。时长只是当前工具进程耗时，不是游戏性能指标。

测试直接实例化实际 `TouchControls`、`Input`，过场组合项使用实际 `TransitionInputGuard`。DOM 替身解析组件真实 markup，使用原生 `EventTarget`／`AbortSignal` 注册和移除监听，提供捕获→冒泡路由、指针捕获、焦点和 `inert` 属性。测试通过派发事件触发真实监听器，读取实际 Input Intent、按钮状态和捕获状态；不调用私有方法，不用源码字符串断言冒充行为测试。

| 行为 | 覆盖 |
| --- | --- |
| 浮动摇杆首次接触 | 初始 Intent 为零，圆心按此次落指位置计算 |
| 同一移动区第二指 | 不抢圆心，不抢 capture；第二指移动／释放不停止首指 |
| 下一次移动接触 | 释放隐藏摇杆，下一次触点建立新圆心并保持 neutral |
| 双指移动＋开火拖动 | 同时进入实际移动／fire／yaw／pitch；取消开火只结束对应指针 |
| lostpointercapture | 经 root 监听器释放 toggle 与持有反馈 |
| resize／orientationchange／visualViewport.resize | 清移动、开火、瞄准与 capture；重复事件／render 只请求一次 pause |
| 回到横屏 | 提示消失，恢复先前 inert，焦点交还继续按钮；Input 保持禁用，没有自动恢复战斗 |
| 菜单及零尺寸中间态 | 菜单竖屏提示不请求 pause；零尺寸不误撤销既有提示 |
| 触控关闭／桌面窄竖屏 | 不显示 guard、不调用 pause；关闭已有触屏 guard 会恢复 inert |
| 横屏内尺寸变化 | 清当前触点，无 pause；旧 pointermove 不恢复移动，必须新接触 |
| 过场隐藏父 UI | 提示仍为 app 直属且自身未隐藏；pause 在同步 start 后微任务执行一次 |
| 过场微任务失效 | dispose、回横屏、关闭触屏、离开 transition 后不触发迟到 pause |
| 两层过场输入守卫 | 横屏提示截获 pointer/click/游戏键；Ctrl／Meta 修饰点击不触发剧情跳过 |
| dispose | 归还捕获、取消布局帧、移除提示与操作层、恢复原有 inert=false／true，旧事件不再驱动输入 |

浏览器组合键一项只证明**触屏 guard 自身**放行 Ctrl／Meta 键盘组合；断言时既有过场 guard inactive。既有 `TransitionInputGuard` 在 active 期间有独立键盘阻断策略，本轮没有改动它，也未声称整个过场环境所有浏览器快捷键均可用。

## 只读布局审查与未验项

- 启动操作区使用 `safe-area + clamp(32px, 4.8vw, 64px)` 内缩，底部使用 `safe-area + 24px`。移动仍走现有 TouchGestures／Input，未改变仿真、弹道、键鼠定义或任务逻辑。
- 触屏 summary 和 range 最小高度均提高到 44px；暂停 44×44、普通动作 52×52、开火 112×112。这里只确认 CSS 声明，实际命中盒需要浏览器检查。
- 短横屏中央字幕通道仍需重点实屏验证。按最终 CSS 静态计算，667px 宽、左右 inset=0 时外宽约 258.97px；若左右 inset 各 44px，外宽约 170.97px。长字幕会增加高度，可能侵占上方 HUD；没有真实布局或截图，因此这是待验风险，未定为已复现遮挡。
- 128px 摇杆外圈始终以首次触点为中心，可能画到移动启动区之外；该图形 `pointer-events:none`，不改变内缩后的首次命中区。是否遮挡情境按钮／字幕及拇指舒适度仍需实际画面与真机判断。
- DOM 替身不计算 CSS、浏览器 safe-area、真实 pointer capture 竞态或系统手势。本轮没有浏览器 UI、Playwright、Safari 或手机操作；没有绕过被禁用的本地浏览器入口。

**NOT_RUN：** 当前构建实际 844×390／667×375 HUD 截图、刘海与底栏区域、真实旋转／浏览器地址栏伸缩、多指手感、系统边缘返回手势、iOS Safari／Android Chrome、当前过场层级画面。14 项事件测试不等于手机可玩或完整战役验收。

## 测试版本摘要

以下摘要对应最终 14 项通过时审查的字节；之后源码改变应重新核对相关结果。

| 文件 | SHA-256 |
| --- | --- |
| `src/ui/TouchControls.ts` | `dc7b5a45cb20e9b77080e63e72a80229ce974459213819ff1fb02cd7bb5efea2` |
| `src/ui/touch-controls.css` | `d4b739fe7c20ad83bf1a291f564a7d9135850b378deaa20bb5f7ccfff6828781` |
| `tests/touch-mobile.test.ts` | `f519468d3c53b64f443d982c940310c42d4aeea778d5c9876635f1b8d8c62418` |

本地 `node_modules` 为主窗口准备的开发校验符号链接，不是交付运行依赖；本审查没有改变依赖或部署产物。

## 追加复核：短横屏字幕改用 HUD 下方完整安全宽度

2026-10-31，14 项输入测试完成后的 CSS 修订。主窗口在**真实运行的桌面 Safari** 中，以 667×375 iframe 和左右各 44px 的安全区变量模拟，复现了上面预警的字幕问题：原中央窄通道把台词排成四行竖柱，占据中间视野。主窗口随后修改并实屏验证了新排版；这属于桌面 Safari 的实际页面证据，仍不是 iPhone／真实刘海硬件证据。本子窗口只进行了以下只读级联复核，没有操作浏览器、修改源码或重复运行测试；主窗口负责保存本次页面证据及汇总定向检查。

`src/ui/touch-controls.css` 末尾新增 `(max-height: 500px) and (orientation: landscape)` 规则，仅对触屏短横屏生效。它将字幕设为 `top: calc(var(--touch-hud-bottom, 88px) + 10px)`、`bottom:auto`，左右分别读取 `--touch-left`／`--touch-right`，不再额外扣除原来的 144px 和 200px 拇指区。以 667px、左右各 44px 的本次模拟为例，字幕外宽从约 **170.97px 增到 514.97px**；左右 12px padding 后内容宽约 490.97px。这是 CSS 算式结果，不冒充浏览器 DOM 测量值。

与原 `style.css` 的级联关系已检查：

- 现有入口先经 `GameUI` 导入 `style.css`，再经 `TouchControls` 导入 `touch-controls.css`。新增规则位于后者的通用触屏字幕规则之后，使用相同的 `#app.touch-input .radio-subtitle` 选择器，因而覆盖旧 top／bottom／left／right／padding／text-align。
- 原触屏规则中的 `width:auto` 和 `transform:none` 继续有效，字幕宽度由新的左右 inset 决定，不会残留桌面 `translateX(-50%)`。原 `style.css` 的竖屏规则在本媒体条件下不匹配。
- 说话者与台词改为 inline，减少独立人名行；未写入更小字号，台词继续使用触屏 **18px／1.5**，说话者继续使用 **16px／1.4**。旧 block 人名的垂直 margin 不再增加独立行高。
- 未修改字幕的当前／退场双层、opacity、transform 过渡或 `grid-area`，也未修改输入、任务、跳过与暂停规则。非触屏桌面和高度超过 500px 的横屏仍走原对应规则。

前文“短横屏窄字幕风险尚未实屏验证”与相关 `NOT_RUN` 是本子窗口当时的记录，现由上述主窗口 667×375 桌面 Safari 复现及修复验证补充；真实手机多指、系统手势和真实 safe-area 仍未由本子窗口验收。不要继续把旧中央通道宽度当成这次最终短横屏 CSS 的现状。

版本归属：上表 CSS SHA `d4b739fe7c20ad83bf1a291f564a7d9135850b378deaa20bb5f7ccfff6828781` 仅属于 **14 项输入测试时点**。追加只读复核时，最终 CSS SHA 为 **`63ef86b4e037bbfd55b08a0c2f94d61ce624352a7954605bfa56222b196e1006`**；`TouchControls.ts` 仍为 `dc7b5a45cb20e9b77080e63e72a80229ce974459213819ff1fb02cd7bb5efea2`。最终 CSS 的实屏验证与主窗口正在执行的五组检查应使用各自实际产物／摘要，不能用本子窗口旧测试摘要代替。
