# 开场旁白增量验证 · 2026-10-31

本批在独立过场模块上增加新游戏开场，尚未代替主窗口的真实主战役接入验收。

- 开场 4 cue、119 有效字、阅读降级时长 35 秒，使用与章节桥相同的加载／旁白调度。`from:null` 只标记新战役入口，存档章节仍为 S01—S12。
- 既有 11 桥／27 cue 的正文与 ID 不变；完整生产总表共 12 段／31 cue。配音声线由用户选为闻川 B，配音窗口已接到冻结开场和新增清单。
- `vitest run tests/chapter-transition`：8 文件、76 项全部通过。比前轮新增 14 项入口计划与门控检查、4 项开场内容／生产总表检查。
- `tsc --noEmit -p scripts/chapter-transition/tsconfig.json` 与整仓 `tsc --noEmit` 通过。
- `node scripts/chapter-transition/export-narration.mjs --check` 通过，两个原文与生产总表完全一致。
- 独立 Vite 生产构建通过：HTML 1.38 kB、CSS 4.85 kB、JS 23.24 kB，使用相对路径。

测试覆盖：新游戏／从序章重开播开场，继续／关内重试／重开本场／独立验证不播；跳过后仍等加载；加载与旁白两种完成顺序；取消前后保留旧进度；进入仅提交一次；明确重开可重播同一 opening ID。测试中的存档提交使用注入端口模型，真实 SaveStore、主窗口门控及关内剧情仍需接入后验收。

本轮只修改过场模块、其测试、独立预览、生产导出脚本和本目录文档。主窗口正在修改的 Game、Sound、UI、任务脚本及检查点代码没有被反馈窗口改动。公共开发进度交主窗口按最终集成状态汇总。

## 冻结文本摘要

| 文件 | SHA-256 |
| --- | --- |
| src/chapter-transition/opening.json | 2cedf112062c87b7f30119f44f10623124cfe1a2d6ecb892b1c196c5d1533194 |
| src/chapter-transition/bridges.json | 3680b3bbf98aa365b652f732fad0f955e3ae4e2316b462ad0cbe9353d078d93d |
| docs/chapter-transition/narration-production.json | 0d01be87fbf0024e8d7d72e9543a2288b0e7371194dd678fe77b930814360d39 |

实际浏览器检查再次被 Work 设置中的本地浏览器禁用阻止。没有浏览器截图、手机实操、正式声音试听或完整战役首通证据。本机和同一局域网的预览服务提供的是独立模拟加载页；不能据此标记主战役已接入。
