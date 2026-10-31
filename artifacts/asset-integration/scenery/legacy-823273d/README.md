# 原始静态候选留档

原提交 `823273d`，原窗口记录 16 项定向测试与 TypeScript 通过；该证据属于原候选，不能作为合并版验收。源码和测试原文以 `.txt` 保存，退出构建及 Vitest 默认扫描。原始 GLB 及清单位于原提交中，源 SHA 同时保存在上级 source-manifest.json。

合并版统一使用 `ModelLibrary` + `GeneratedSceneAssets`，避免 PortKit 自动创建第二套加载器及其 GPU 资源；PortKit 使用 visualSlot 保留碰撞和可替换视觉批次。八件运行 GLB 使用等比纹理 1024 版本，共 13,702,268 B。两张医务室矮凳采用实际均匀缩放尺寸；模型加载失败时仍保留占位物。

model-tools 的独立生命周期注册和 ImageBitmap 清理保留，供世界武器等使用。所有可见环境全面资产化尚未完成；新增 ARCH、其余道具和地图的后续交接另行验收。
