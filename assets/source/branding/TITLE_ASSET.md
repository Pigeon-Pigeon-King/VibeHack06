# BRAND-TITLE-01 · 重返木卫三

2026-10-31，用户授权由本窗口调用 ImageGen 补齐游戏标题平面视觉资产。本文件记录正式可复用母版，不代表它已接入游戏菜单。

- 母版：`ganymede-title-v1.png`，2172×724，RGBA PNG。
- 真实 Alpha 范围 0—255；1,023,202 像素完全透明。不是画入棋盘格的伪透明图片。
- SHA-256：`e5e10a9ba03df440220bf613093b3cdcd292e4159b8988828ee17969d44822a4`。
- 演示使用同摘要副本：`artifacts/submission/presentation/assets/title.png`。
- 通过内置 `image_gen` 生成，`transparent_background=true`。工具未暴露具体模型 ID；不将用户原文中的 image2.5 当作本次调用的可验证型号。
- 已在工具返回图中查看五字、字形完整性、工业材质与构图；文件读取确认 Alpha。未修改像素或裁切，原始输出仍保留。
- 本资产不包含背景、字幕、日期或出现动画；这些在使用端独立处理。

## 实际提示词

```text
Use case: logo-design. Asset type: reusable transparent Chinese title wordmark for an original science-fiction FPS game and a cinematic HTML presentation. Create one finished premium flat title asset, exact five Chinese characters on ONE horizontal line: "重返木卫三". Each character must be complete, accurate and readable: 重 / 返 / 木 / 卫 / 三. No other words, no English subtitle, no slogan, no frame, no pictorial emblem. Composition: wide horizontal wordmark, approximately 3:1 content proportions, generously spaced but cohesive custom Chinese block typography, all characters equally important, centered with generous transparent padding, nothing cropped. Visual language: restrained hard industrial science fiction, broad powerful legible strokes, carefully cut angular joints, modest inset mechanical seams; cold off-white brushed metal faces with charcoal dimensional bevel edges and a FEW small warm amber wear marks or light accents. Keep the forms predominantly a clean 2D graphic wordmark, subtle depth only, sharp engineered silhouette, no excessive damage, no distressed clutter, no large glow. High contrast and readable when scaled down over a dark game menu or an industrial-port scene. The game is about people returning to their occupied moon and keeping a promise; dignified, human, resilient. ORIGINAL typography, not a copy of any existing game's logo, no Cyberpunk yellow branding. Background must be genuinely transparent with alpha outside the letters and in interior cutouts. No solid background, no landscape, no backdrop rectangle, no checkerboard drawn into the image, no cast shadow outside the wordmark.
```
