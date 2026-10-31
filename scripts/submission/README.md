# 本地交付审计

`audit_package.py` 使用 Python 3 标准库，不安装依赖、不构建、不启动游戏、不上传、不执行输入中的 JavaScript。它读取显式选择的项目／产物，只向 `--out` 写三个报告。输出目录不能位于源码、`public`、原件、声音制作目录或选中的构建内；同名报告若为 symlink／非普通文件会拒绝写入，报告使用目录内原子替换。缺目录、空网页、缺引用、无文件声音的空清单均不会成为 PASS。

## 使用

以下命令从主项目执行；构建目录可以是项目相对路径或绝对路径。候选工作树在被审计时只读。

```sh
python3 scripts/submission/audit_package.py \
  --root /Users/penguin/VibeHack06-worktree \
  --web dist \
  --out /Users/penguin/VibeHack06/artifacts/submission/package-audit-candidate-web \
  --label candidate-7877cbf-dirty-web
```

检查一个具体 Windows 便携目录或 ZIP，并与同一份网页构建逐字比对：

```sh
python3 scripts/submission/audit_package.py \
  --root /Users/penguin/VibeHack06-worktree \
  --web dist \
  --windows /absolute/path/to/ReturnToGanymede-win-x64.zip \
  --out /Users/penguin/VibeHack06/artifacts/submission/package-audit-frozen-windows \
  --label frozen-candidate
```

只选择 `--windows` 时检查包自身、ASAR、许可证和选定项目的桌面代码，并给出 `REVIEW_REQUIRED`：没有独立 `--web` 基线就不声称完整资产／许可与某份网页构建相符。历史 ZIP 与当前候选比较出现差异是正确的 FAIL，不能把历史包重新标成当前候选。

声音制作包单独审计，不把准备完成等同于游戏集成：

```sh
python3 scripts/submission/audit_package.py \
  --root /Users/penguin/VibeHack06 \
  --audio-manifest design/audio/production-01/runtime/manifest.json \
  --out /Users/penguin/VibeHack06/artifacts/submission/source-inventory-audio \
  --label prepared-audio-not-integrated
```

小样本自测（新目录）：

```sh
python3 scripts/submission/selftest.py \
  --out /Users/penguin/VibeHack06/artifacts/submission/package-audit-selftest-new
```

自测只创建不足数 KB 的有效／缺失／非法输入，不运行游戏回归。通过后自动清除合成项目和逐案例报告，只保留 `package-audit-selftest.json`；失败时保留案例供检查。所有自测写入仍限制在 `--out`。

## 报告与退出码

| 退出码 | 状态 | 含义 |
| --- | --- | --- |
| 0 | `PASS_STATIC` | 本次实际选择的静态检查未发现阻断／待核；不表示游戏、设备或法律验收 |
| 1 | `FAIL` | 缺实际文件、摘要不符、外部依赖、格式错误等已检查到的失败 |
| 2 | `REVIEW_REQUIRED` | 文件检查没有错误，但来源／发行元数据等仍需核实 |
| 3 | `INCOMPLETE` 或参数错误 | 输入根／产物不存在、无法完成审计、参数或输出位置不合法；参数错误可能没有报告 |

`package-audit.json` 保存检查时间、输入、HEAD／trackedDirty、实测结果和发现；`source-inventory.json` 保存允许范围内源码、运行／包文件的字节数与 SHA-256；`package-audit.md` 是可读摘要。整份 inventory 另有摘要。脚本本次被审计的工作区可以含未提交文件，源码摘要才是准确快照；HEAD 本身不代表这些文件都已提交。

## 实际覆盖

- 网页 `index.html`、JS/CSS 静态引用、Vite 动态分块、资源路径字面量与 `public`→构建逐字对照。
- 当前 GLB 2.0 头部、总长、JSON/BIN chunk、buffer／bufferView 边界、图片嵌入结构；任何非 data URI 的 GLB 外部依赖均失败。项目目前未配置的 Draco／Meshopt／KTX2 扩展会失败。
- Rapier compat 会把 WASM 内嵌为 Base64。工具先解码并与当前锁定安装包的 WASM 字节比较，才将生成绑定里遗留的外部 WASM 默认分支排除；不依据文件名猜测“已经内嵌”。`./rapier_wasm3d_bg.js` 的 import-object 键不是网络加载。
- Three.js、Rapier 的锁定／安装版本和原许可证复制；有安装版 NOTICE 时要求存在摘要相同的包内文件；AK-47 的原件／运行／包摘要和许可，F-35B 对应源码 ZIP、18 条组件清单与10条上游清单。
- Windows ZIP 每个允许成员读完验证 CRC，路径／重复／symlink／加密限制，ASAR 头部／范围／SHA256、PE x64 头部、Electron 版本／许可、主要运行文件和网页／桌面内容对照。不解压 ZIP，不执行 EXE。
- 声音清单逐个文件的摘要／字节数；WAV 的 RIFF 长度、通道、采样率、位深／帧数，Ogg Vorbis／Opus 的识别头，MP3／AAC／FLAC 的头部签名。来源字段另行检查，头部通过不等于完整解码、音质或播放通过。

## 范围与保守边界

源码快照只递归 `src`、`desktop`，并读取少量明确命名的构建文件。原件只读取 AK-47 的明确文件与 F-35B 允许清单；声音只读指定运行 manifest 及其中列出的运行文件、4份来源说明。不会递归扫描 `assets/source`、Tripo／Hyper3D 原始响应、账户配置、声音母带、模型权重或缓存。明确发现的敏感目录／文件、潜在签名 URL 只记录问题，不输出其值。它不是通用秘密扫描器，未知格式的凭据仍需人工审查。

许可文本中的网站链接、GLB `generator` 字段、源码署名链接是来源信息，不自动当作运行网络依赖。当前脚本的 JS 字面量扫描不做完整 AST／数据流分析；字符串拼接、任意计算 URL、网络重定向、解析器动态依赖仍须以断网启动、请求记录和真实设备验证。URL query 不写进报告。

二次读取内容变化会报 `INPUT_CHANGED`；共享工作区不是文件系统原子快照，最终冻结后仍须在静止产物上重跑。脚本不会自动重建证明“当前源码→旧 dist”，该项始终写 `NOT_REBUILT`。Windows／浏览器运行始终写 `NOT_RUN`。

ASAR 仅支持项目当前使用的普通内嵌文件；links／unpacked 会失败，不能静默漏检。单文件上限768 MiB、ZIP展开总量3 GiB、文本扫描24 MiB；超过上限直接失败，不把跳过当作通过。扩展运行资产或改目录后应同步明确的检查映射与fixture，不能用忽略错误代替适配。
