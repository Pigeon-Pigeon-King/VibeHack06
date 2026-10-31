# 横屏与浮动摇杆独立候选

2026-10-31。用户本轮裁决：既有操作已经固定，做好手机适配，可以只支持横屏；左摇杆不固定位置，操作区域向内收缩避开手机外侧手势区。追加要求：本轮独立工作，不合并main。

独立本地检出 `/Users/penguin/VibeHack06-mobile-controls`，分支 `codex/mobile-controls`，基于 `a408a97`。工作树管理工具未能识别源仓库，采用本地clone；无远程仓库。最初写在main的两个本轮文件差异已完整移出并反向撤回，main源码保持原样。现有备用工作树内的其他窗口变更不纳入本候选。

## 实现范围

- `src/ui/TouchControls.ts`：沿用TouchGestures和Input，左下操作区任一点首次按下成为本次中心，保持原38.4px行程和径向死区。松开后收起，下一次可换起点；第二根手指不能抢走当前中心。原有移动/观察/开火/掩护/跳过映射保持。
- `src/ui/touch-controls.css`：左右留白为安全区加32—64px，底部为安全区加24px，顶部加16px；右观察区也不从屏幕边缘起拖。按钮至少44px，常用动作52px，开火112px；缩装饰与留白，不缩小操作文字。
- 手机触屏竖屏显示“横屏游玩／请将手机横过来”，调用既有pause并清理持有输入。横屏返回不自动恢复战斗；桌面键鼠模式不加转屏限制。没有调用依赖浏览器权限的orientation lock或改变世界/任务状态。
- 触屏菜单summary和滑块点击区域补至44px；HUD、字幕和情境按钮使用同一安全区变量。全部运行UI是项目内CSS、SVG、HTML，无新增图像、音频或模型。
- 高度不超过500px的横屏中，字幕位于HUD下方、横向使用完整安全宽度；说话者与台词内联，保持16/18px原字号。已修复667×375加左右各44px模拟安全区时长字幕形成中央竖列的问题。
- 转屏提示直接置于app上层，章节切换隐藏game-ui时仍可见；过场暂停延迟至同步start之后。竖屏捕获阶段拦截点击，避免误跳过；回横屏仍需用户继续。

## Skill适用范围

本轮使用Paean game-create生产标准的触屏尺寸、安全区、短横屏重排、取消/前后台与实际检查要求，结合threejs-game-ui-designer。用户横屏决定优先于skill的双向强制建议。已有Three.js/TypeScript/Vite、原创约一小时战役、中文界面与批准GLB/音频路线保持，不为局部适配引入attract、付费门禁或重构整款游戏。

按paean-code-assets先检索本机joystick/ui：已有Headwind飞行仪表摇杆，方向与本作步行FPS不同；本次复用本项目的CSS环形摇杆和原gesture意图接口，没有引入外部素材或另一套输入。新绘制仅简短CSS反馈和转屏SVG。

已读本机Elemental Serenity和ThreeJSVFX拆解及MANIFEST，固定提交分别为 `6b8cebefa0ee10e1bdd081dd342a01b3fe753e09` / `6b09a0b2aa2aab8ce3da1d7df715911af3c39305`。查看 `World.class.js` 的统一组件状态与 `Ability.js` 的复用/取消生命周期；本轮相关原则落在现有TouchControls的单一state、可复用摇杆DOM和reset/dispose，不添加不相关场景或粒子效果。没有复制两份项目代码或媒体。

## 验证边界

定向检查与浏览器证据记录在 `artifacts/mobile-compat/landscape/`。桌面Safari内嵌视口用于实际布局/单指操作，和真实手机多指、刘海、系统返回手势分开。`preview.html`是独立QA外壳，仅更改iframe尺寸与模拟安全区变量、读取公开DOM，不修改任务状态；不进入运行dist。

最终5文件／72项触屏、输入、页面生命周期与过场守卫回归通过，类型与生产构建通过。Safari桌面实际运行开发版S01与生产版北闸，检查844×390、667×375（含模拟安全区）、390×844提示、开火换弹与暂停恢复。生产过场的竖屏遮挡、暂停和点击不穿透已实际检查。详细证据和限制见 `artifacts/mobile-compat/landscape/README.md`。

没有发布站点、上传GitHub或合并main。真机多指、系统手势边缘、原生旋转/BFCache、热稳定性没有证据时仍为NOT_RUN。
