# 手机试玩与 Clide 托管核查

更新：2026-10-31。用户要求完成后提供玩家可用手机直接打开并实际体验的链接，提出 Clide 测试托管候选；同时明确“先做完，不着急发布”。本次只审查、运行离线 dry-run 并记录计划，没有上传、创建站点、上架广场或修改远程权限。

## 交付关系

同一原创战役源码生成 Windows EXE 和网页构建。网页同时支持桌面键鼠与手机触控；完整 S01—S12、双主角与约一小时产品目标保留。比赛试玩可以提供明确的核心玩法入口，但不以缩短完整战役代替原目标。

GitHub 仓库用于代码与制作历史，Clide 可用于游戏网页；二者不必使用同一家服务。GitHub Pages 仍是备选静态托管。比赛的“网站链接”必须指向可打开并实际操作的游戏，EXE 下载页和录屏不能代替这项用户要求。

Clide 优先考虑 `hosting-only`：得到独立 `*.clide.app` 地址，不建立 Apps Square 条目。测试地址仍是公网可访问地址，不能称为私有测试。当前不选择或占用具体域名；完成构建与手机检查后再执行用户批准的发布。

## 格式与规则边界

- Three.js 支持 GLB/glTF，并可配置 Draco、Meshopt、KTX2 等解码器。GLB 可以作为静态网页资源；使用它不意味着需要模型服务端或 Electron。参考 [GLTFLoader 官方文档](https://threejs.org/docs/pages/GLTFLoader.html)。
- 本机 `paean-publish` 的 `--hosting-only` 上传静态 ZIP，客户端收集文件时未设置禁止 GLB 的扩展名白名单。**这只证明当前客户端路径，不证明 Clide 服务端接收所有大小或格式**。正式资产接入后仍须在实际站点验证 HTTP 状态、响应类型、压缩、解码及纹理加载。
- 本机 `paean-convert-to-rednote` 记录的小红书 mini-tool 是另一种离线容器，规定扩展名白名单、10 MiB 包体和 Chrome 61 基线；不能把它直接当作普通 Clide 网站的技术规范。本项目目前没有要求制作 mini-tool 或可玩广告。
- **本机规则存在冲突**：用户全局 Paean／clide.app 指令要求运行期纯代码美术，`paean-code-assets` 还禁止模型与音频文件；本项目专用指令与既定生产方案明确允许 Tripo／Hyper3D GLB、有来源素材及正式配音。前者是本机工作约束，不是从 Clide 服务端验证出的文件禁令。本轮保留已授权的项目资产工作，不改写全局规则，不自行把这项矛盾解释为平台已禁止 GLB。选定 Clide 发布路线时需明确本项目适用边界；如果继续沿用全局严格纯代码约束，当前正式资产路线与之不兼容，采用 GitHub Pages 等网页托管可避免该平台工作流冲突。

依据的本机文件为 `/Users/penguin/.codex/skills/paean-publish/SKILL.md`、其 `scripts/publish.mjs` 与 `scripts/zip.mjs`、`paean-code-assets/SKILL.md`、`paean-convert-to-rednote/SKILL.md`。它们的转换策略不自动成为 Three.js 或比赛官方规范。

## 当前工程审查

| 项目 | 当前事实 | 需要完成 |
| --- | --- | --- |
| 静态构建 | `vite.config.ts` 使用 `base:'./'`；浏览器源码不依赖 Electron IPC、Node 文件系统或本机绝对资源路径；Rapier 使用 compat 包 | 发布前确认所有运行资源与解码器均进入 dist，实际站点无缺失请求 |
| Clide 离线检查 | [dry-run 记录](../artifacts/clide-compatibility-20261031.json)：static-compatible，secret scan passed；3 文件、5,205,309 字节，未含正式 GLB／声音 | 该结果不是上传或手机验收；报告中的默认 license 字段也不替代作品及第三方许可决定 |
| 手机操作 | `src/player/Input.ts` 目前仅有键鼠及 Pointer Lock，没有触屏移动、视角与动作控件 | 统一输入意图：左摇杆移动、右侧拖动观察、开火／瞄准／换弹、跳跃／蹲伏、情境交互、同伴掩护和暂停；保留实际玩法功能 |
| 短横屏布局 | 已在浏览器 844×390 尺寸的 S01 入口复现：字幕 y=192—272，交互提示 y≈238—289，实际重叠；见 [截图](../artifacts/presentation-20261031/mobile-landscape-gap.jpg) 与 [尺寸记录](../artifacts/presentation-20261031/layout-844.json) | 字幕、操作提示、触控区域共同避让，覆盖横屏和竖屏入口；这不是手机真机验收 |
| 浏览器历史返回 | `main.ts` 对所有 pagehide 直接 dispose，未实现 pageshow／BFCache 恢复 | 缓存离开时暂停，返回后清空输入并恢复正确状态；非缓存离开才释放。实际手机返回仍待验证 |
| 声音／前后台 | 已有用户操作解锁 Web Audio、失焦暂停、检查点存储与写入失败提示 | 验证 iOS／Android 的开始、切后台、恢复和声音重开；当前不跨域名／浏览器同步存档 |
| GLB 接入 | 当前为同步创建的程序化代理，没有异步 GLTFLoader／AnimationMixer 运行管线 | 增加资源清单、加载进度与重试、切章取消或代次保护、共享模型引用计数、骨架动作映射和纹理释放 |
| 手机性能 | 固定抗锯齿、DPR 上限 1.5、部分 2048² 阴影；尚无真实手机测量 | 按章节加载、移动画质档、贴图与材质预算、实例化／LOD；用真机帧时和内存制定预算 |
| 许可 | Windows 包已含 Three.js／Rapier 许可；当前网页 dist 尚未附带许可文件 | 网页交付前补齐第三方许可与正式资产来源记录 |

现代 Three.js WebGLRenderer 要求 WebGL 2；不能承诺所有旧手机或旧 WebView 均可玩。初始验证对象为具备 WebGL 2 的 iOS Safari 与 Android Chrome，记录具体设备和版本；微信内置浏览器另列验证，不能以系统浏览器通过代替。参考 [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)、[Web Audio 自动播放限制](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)。

## 制作顺序与验收

1. **现在纳入约束**：先补触控输入与短横屏布局，修复缓存返回生命周期；原战役逻辑继续由同一输入意图驱动，不复制一套手机任务状态。
2. **先用占位版真机走通**：从玩家入口完成移动、观察、射击、同伴掩护、一次协作交互、失败／重试、暂停／恢复和刷新续玩。手机尺寸模拟只验布局，不声称真机手感或性能通过。
3. **随正式资产生产制作运行版**：保留高质量原件，另外导出适合网页的 GLB／纹理／声音，按章节加载；原件、概念图与全部生产资料不进入 dist。先实测代表性人物与工业场景，再定具体面数、材质数、纹理与同时在场数量上限。
4. **完成后发布前检查**：锁定 commit，构建网页与 Windows 候选，重新 dry-run；检查资源、许可、存档兼容和加载失败反馈，再对具体目的地执行发布。
5. **线上验收**：用真实手机从提交链接首次进入并实际操作，检查弱网加载、前后台、声音、连续切章和热稳定性，保存设备／浏览器／构建版本记录。设计目标先以稳定 30 FPS 为基准，具体档位以测量决定；这属于项目目标，不是 Clide 官方门槛。

最终压缩与发布可以放在制作末期；触控、资源所有权和布局架构需要现在纳入。当前结论是“托管路径可行、移动玩法适配未完成”，不标为手机可玩或已发布。
