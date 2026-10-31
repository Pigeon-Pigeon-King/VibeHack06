# 手机窗口成果接入 · 2026-10-31 17:28

已接入备用 `/Users/penguin/VibeHack06-worktree`，基线 `b3c88dd`。用户本轮明确要求接入手机兼容窗口；本分工没有提交、合并 main、构建或发布，由主窗口统一处理。

## 冻结来源与范围

最新手机窗口 `01a19040-b40c-78c2-9919-c88d68f1adc9` 的独立候选为 `/Users/penguin/VibeHack06-mobile-controls`，提交 `50da9c6`，基于 `a408a97`。先核对当前 `TouchControls.ts` 和 `touch-controls.css` 从 a408a97 到 b3c88dd 没有变化，再逐字复制这两个文件和其新增 `touch-mobile.test.ts`，没有覆盖本轮人物、动作、模型、31段旁白、S10／S02修复。

现成触控功能：浮动左摇杆、设备安全区以外32–64px内缩、底部24px留白、触屏横屏游玩、竖屏暂停且拦截穿透点击、回横屏手动继续、章节过场同样受保护、短横屏长字幕横向重排、操作目标至少44px。使用原 Input／TouchGestures，动作映射未改。

手机窗口旧性能交付已在 `deferred/` 暂存。本次原样移入 `src/mobile-performance/` 的三个模块和两个正式测试，接到主入口唯一 renderer。触屏固定 balanced 档：DPR上限1、总像素上限921,600、1024阴影；键鼠 high 档：DPR上限1.5、总像素上限4,665,600、2048阴影。另受4096及设备纹理尺寸限制。自动降档保持关闭，不改变60Hz仿真、模型资源、动画、输入坐标或任务。

`main.ts` 仅接入质量适配器：首次关卡激活与切场bind、释放前detach；resize、触控设置切换、BFCache恢复重新裁定绘制尺寸。旧两次setSize/setPixelRatio改为一次setDrawingBufferSize分配。适配器处理阴影目标尺寸变化和释放。没有新增RAF、音频管线或页面生命周期逻辑。

当前 `Sound.ts` 已含 desiredPlaying／unlockGeneration／disposed 检查，`Game.resume()` 已捕获unlock拒绝；首轮手机窗口那两份声音补丁不再重复应用。`GameUI.ts` 和主HTML由root负责，本分工没有编辑。

## 验证

- `tsc --noEmit`：通过，见 `integrated-typecheck.txt`（成功时无输出）。
- 8个定向文件 **112/112通过**，2.85秒：触控／输入／页面生命周期／过场输入守卫／Game host／两组性能模块；见 `integrated-tests.txt`。
- 其中手机候选新增14项、性能模块22项。不要把112项全部加到此前866项基线，旧用例存在重叠。
- `git diff --check`通过；手机候选三个源码／测试文件逐字比对通过。
- 未跑全套、生产构建、浏览器或真机。没有声称固定预算已经获得某个FPS收益。

`integrated-mobile.diff` 保存本分工10个产品／测试文件的完整差异，`integrated-manifest.json` 保存文件SHA及来源。`docs/mobile-compat/LANDSCAPE_CONTROLS.md` 与 `artifacts/mobile-compat/landscape/` 保存原手机窗口的方案、桌面Safari截图与证据，它们属于旧a408a97候选，**不能当作当前整合版本的新画面验收**。

## 手机实际限制

真实iOS／Android多指、系统边缘返回和Home手势、实际刘海、安全区和地址栏伸缩、原生旋转／BFCache、持续发热与帧率仍为NOT_RUN。原手机窗口已在桌面Safari实际查看844×390、667×375模拟安全区、竖屏提示和过场暂停，并操作开火／换弹；新整合的资产体量和渲染预算尚未做同等画面复验。当前游戏资源较大，固定渲染预算不等于下载／解码／内存问题已解决。

此处交付已冻结，供root统一提交及发布检查。
