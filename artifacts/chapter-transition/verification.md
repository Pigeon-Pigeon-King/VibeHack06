# 独立章节过场验证 · 2026-10-31

范围：新增章节过场模块、11 段衔接稿、浏览器外壳与独立预览。主战役未接线，模拟加载器不算真实关卡加载验收。开发基线 main@823273d，合入前同步主线新增的 AK47 附着模块；本批不修改它。

## 已取得的证据

- `vitest run tests/chapter-transition`：6 文件、58 项通过。覆盖控制器 25 项、旁白清单 8 项、本地音频 10 项、输入 8 项、战役计划 5 项和浏览器外壳事件 2 项。
- 独立模块及预览 TypeScript 严格检查通过；整仓 TypeScript 检查通过。
- 独立预览生产构建通过，包含相对路径 HTML/CSS/JS；实际模块由本地 Vite 5198 端口提供。
- 同步 main 的 AK47 附着模块后，`npm run build` 通过。主游戏 JS 约 5.30 MB，现有大包警告仍在；本模块尚未接入主游戏入口。
- 复核发现并修复上一关最后一枪误跳过过场、按住 F 的重复事件越过进入边界，以及可见窗口失焦未暂停。修复后独立复核 10 项输入／外壳事件通过。
- 11 桥按剧情时间线与关内起止事实复核，并经 human-fiction-zh、Humanizer 3.1.0 与根窗口冷读；完整来源和修改记录见 `docs/chapter-transition/NARRATION.md`。

正文冻结 SHA-256：`3680b3bbf98aa365b652f732fad0f955e3ae4e2316b462ad0cbe9353d078d93d`。现有配音窗口已收到 27 cue 生产单；声音成品未纳入本次测试。

## 实际限制

2026-10-31 尝试使用 CUA 打开独立预览时，工具返回本地浏览器已在 Work 设置中禁用。因此没有浏览器截图、真实 pointer lock 操作、手机操作或真人试听证据。browser-shell 测试替换了 DOM overlay，验证的是 pause/visibility/focus 与 RAF 接线，不能冒充画面和交互实测。

真实关卡准备、输入与 pointer lock 交接、检查点原子更新、S08 至 S11 剧情不受影响以及 Windows EXE 仍由主窗口接入后验证。具体接入点和清单见 `docs/chapter-transition/INTEGRATION.md`。
