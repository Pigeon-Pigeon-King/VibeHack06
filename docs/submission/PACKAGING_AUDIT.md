# 网页／Windows 交付资源审计

记录日期：2026-10-31。本轮只读候选 `/Users/penguin/VibeHack06-worktree`，HEAD `7877cbf0e7c5f8f93aeb5b6f402fce9ed3d4923a`，含未提交改动。主项目在接手时为 `9ec9bc6`；它的旧 `dist`／`release` 不代表当前候选。没有运行新构建、重新打包、启动 Windows、上传或发布。

工具：[audit_package.py](../../scripts/submission/audit_package.py)，Python 标准库；用法与静态扫描边界见 [说明](../../scripts/submission/README.md)。报告记录输入、时间、源码／运行／打包 SHA-256。Windows 与浏览器运行均为 **NOT_RUN**；已有 dist 与当前源码的重建对应关系为 **NOT_REBUILT**。

## 真实运行结果

| 输入与时间（UTC） | 实际结果 | 含义 |
| --- | --- | --- |
| 备用候选 `dist`，05:05:29—05:06:07 | **FAIL / exit 1**；14文件，11,352,087 bytes，10个public文件逐字匹配；3个错误＋1个待核 | 资源／许可复制已具备，但审计中飞机源码发生变化，对应源码包过时；不是冻结发行版 |
| 历史 `ReturnToGanymede-autonomy-finale-preview-win-x64.zip`，05:00:24起 | **FAIL / exit 1**；ZIP成员CRC、PE x64、ASAR结构与内部摘要通过；与上述网页候选0/14文件相同 | 旧包可读，不是当前候选；同时捕获共享工作区变化 |
| 主项目声音 `design/audio/production-01/runtime/manifest.json`，04:51:30起 | **REVIEW_REQUIRED / exit 2**；224文件，56,871,766 bytes；摘要与可测头部字段一致 | 声音已准备、未游戏集成；元数据与生成音乐来源依据仍需整理 |
| 工具小样本自测 v2 | **20项通过** | 只验证审计工具的正反例，不计入游戏测试或设备验收 |

机器可读记录：[候选网页](../../artifacts/submission/package-audit-candidate-web/package-audit.json)、[历史ZIP](../../artifacts/submission/package-audit-historical-windows/package-audit.json)、[准备中声音](../../artifacts/submission/source-inventory-audio/package-audit.json)、[工具自测](../../artifacts/submission/package-audit-selftest-v2/package-audit-selftest.json)。每份报告目录中的 `source-inventory.json` 是对应的逐文件摘要。候选报告工具版本1.0.1，脚本SHA-256 `68812f89b293b01d3e55c72e31ff4d8769df3b16303b04a40a7be7297d6f85ee`；源码与产物总清单摘要 `ce5751ef0a0ad20a5a6d4b6d8c504bb5f24903f5e9533bc7eebcf2dfe66820cb`。较早的历史ZIP／声音报告使用1.0.0，当时未记录工具自身散列，保留原状，不追补成新版工具运行证据。

以上是有时间边界的开发快照。两次实际检查都读到 `src/presentation/EpilogueAirCover.ts` 在审计期间变化，报告明确为 `INPUT_CHANGED`，没有将它称为一致的原子快照。18条F-35B组件文件中16条与当时源码一致，另外两条为：

- `src/presentation/EpilogueAirCover.ts`
- `tests/epilogue-air-cover.test.ts`

组件 ZIP 自身的18条manifest摘要全部匹配，内层上游10条也匹配；问题是它尚未包含最新本作改动。主窗口最终冻结后应更新对应源码包并重新构建、审计，不需要为了追逐每次并行修改重复全量测试。

## 网页包的实际需求

应以 Vite 的独立静态构建根目录交付，含 `index.html`、引用的 JS／CSS、懒加载分块、GLB、音频、许可、组件对应源码以及将来实际配置的解码器。保留 `base:'./'` 与相对路径。不能将制作目录、原件库或整个仓库直接作为网站 ZIP。

本次包内已经实际核对：

- AK-47 `models/weapons/ak47-world-r1.glb`：2,046,524 bytes，源／public／dist摘要一致，SHA-256 `d121eb62491e7f2cc573cd7bdb04e4a482f1eca3b16df7976b2ee2306ea4e1c1`。GLB2头部、长度和嵌入结构有效，6张嵌入图片，无外部URI、无未配置压缩扩展；这不是纹理解码或动作验收。
- Three.js MIT 与 Rapier Apache-2.0 文本、版本manifest，AK-47 的 MIT／来源说明／署名，F-35B 的 GPL-3.0／署名／组件源码 ZIP 已进入 dist，原许可复制摘要一致。
- Rapier compat 的 WASM 实际内嵌于JS，解码后3,082,103 bytes，与锁定安装版一致；SHA-256 `17cfa80eebd8de0291b948496dbffba724b98b489687f8272ca236a7bbf1dd4b`。生成绑定里的默认WASM URL不意味着本包缺少一个必须外置的WASM文件。
- 已识别的HTML／JS分块／GLB引用均在包内；未发现这些实际引用依赖远程网址、Mac绝对路径或包外文件。此项是静态匹配，不能替代真实请求记录。
- `Sound.ts` 仍为临时Web Audio合成反馈，dist中没有文件音频。224个制作完成的声音文件未因“在磁盘上存在”被算作已交付。

当前GLB加载器只支持嵌入、未压缩资源。将来接入Draco／Meshopt／KTX2时，必须同时配置并打包匹配解码器，再调整工具的显式检查；不能把“GLB文件存在”当作解码依赖齐备。新增人物或场景GLB可以使用供应商命名目录，工具不因 `tripo`／`hyper3d` 名称本身拒绝，仍逐件核对来源与运行依赖。

## Windows便携包的实际需求

现有 `scripts/package-windows.mjs` 把 `dist`、`desktop`、精简 `package.json` 和 Three／Rapier许可封入 `resources/app.asar`，由 Electron Packager 生成整个 `ReturnToGanymede-win32-x64` 目录。交付必须保留EXE、ASAR、DLL、PAK、locales、Electron LICENSE、`LICENSES.chromium.html` 和启动说明；不是只发送单个EXE。

被检查历史ZIP为160,042,607 bytes，SHA-256 `2a922436e3fd1c480b7496665cfdcc9300ee6fce14fec1ebe58ad996f5a571e3`。74个文件展开共379,201,949 bytes，Electron45.1.0，ASAR仅7个成员。它的Three／Rapier许可证原文保留，但没有后来的AK-47、F-35B及其许可／对应源码，也没有新网页分块。版本号仍同为0.6.0，不能仅凭版本字符串判断同一个候选。

Windows运行保持 **NOT_RUN**。必须在目标机从完整解压目录断网启动，实际检查入口、GLB／音频／分块、鼠标锁定、多次切章／重试、存档／退出／重新启动和性能。CRC、MZ／PE头与ASAR摘要不证明这些行为。

## 声音与来源记录

准备中声音清单含195个SFX和29个音乐文件，共224文件。WAV／Ogg头部、字节数、SHA-256与清单一致，未完整解码、试听、测循环缝或进行Windows播放。原录音、母带、模型权重没有被递归收录；对白／群众声试音未进入这份运行清单。

发行前的具体待核项：

1. `sfx-provenance.json` 中5处、`music-provenance.json` 中4处本机路径应在**发行副本**中改成安全、可追溯的项目相对记录。它们是来源元数据，未误判为运行网络依赖；保留制作窗口原始记录。
2. 生成音乐有模型／代码修订、提示词和输出摘要，当前运行包的music-provenance没有license／输出使用依据字段。由声音窗口补入适用版本的安全来源摘要和许可依据；当前标待核，不推断无权使用。
3. 正式接入后，运行manifest、加载路径、每章资源范围、暂停／跳过／重试生命周期与最终public→dist→ASAR摘要需要一起复核。不要把整份约417 MB的预估解码音频在启动时全部解码；这是manifest的预算提示，非本轮实测内存。

第三方与实际生产状态见 [来源清单](THIRD_PARTY_SOURCES.md)。GLB与声音路线沿用本项目授权，不套用Paean纯代码禁令，不擅自转换／删除素材或修改第三方许可。

## 最终冻结后的隔离构建建议

以下是交给主窗口的可执行建议，**本次没有运行**。先冻结源码和已选运行资产、修正组件源码包同步，记录commit与干净／未提交范围。现有 `npm run package:win` 会写项目 `dist`、覆盖 `release`，因此不应用于保留历史证据时的隔离试包。

网页可以从冻结项目读取、只写新的输出目录：

```sh
candidate_root=/Users/penguin/VibeHack06-worktree
delivery_stage=$(mktemp -d "${TMPDIR:-/tmp}/ganymede-delivery.XXXXXX")
task_node_dir=/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin
export PATH="$task_node_dir:$PATH"
cd "$candidate_root"
npm exec -- tsc --noEmit
npm exec -- vite build --outDir "$delivery_stage/web" --emptyOutDir
python3 /Users/penguin/VibeHack06/scripts/submission/audit_package.py \
  --root "$candidate_root" --web "$delivery_stage/web" \
  --out "$delivery_stage/web-audit" --label frozen-web
```

Windows可复用已安装的同一Packager API，在这个新的stage中准备现有四个允许根目录。此建议不更改既有打包脚本：

```sh
node --input-type=module - "$candidate_root" "$delivery_stage" <<'JS'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { packager } from '@electron/packager';
const [root, stage] = process.argv.slice(2);
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const appStage = path.join(stage, 'app');
await mkdir(path.join(appStage, 'LICENSES'), { recursive: true });
await cp(path.join(stage, 'web'), path.join(appStage, 'dist'), { recursive: true });
await cp(path.join(root, 'desktop'), path.join(appStage, 'desktop'), { recursive: true });
await cp(path.join(root, 'node_modules/three/LICENSE'), path.join(appStage, 'LICENSES/Three.txt'));
await cp(path.join(root, 'node_modules/@dimforge/rapier3d-compat/LICENSE'), path.join(appStage, 'LICENSES/Rapier.txt'));
await writeFile(path.join(appStage, 'package.json'), JSON.stringify({
  name: pkg.name, version: pkg.version, author: pkg.author, main: pkg.main, private: true,
}, null, 2));
const outputs = await packager({ dir: appStage, name: 'ReturnToGanymede',
  appVersion: pkg.version, platform: 'win32', arch: 'x64',
  electronVersion: pkg.devDependencies.electron, asar: true, prune: false,
  out: path.join(stage, 'windows'), overwrite: false });
for (const output of outputs) await writeFile(path.join(output, 'START_HERE.txt'),
  '重返木卫三 · 开发候选\n保留整个目录，运行 ReturnToGanymede.exe。\nWindows实际输入、音频和性能仍需目标机验收。\n');
console.log(JSON.stringify({ outputs, windowsRuntime: 'NOT_RUN' }));
JS
python3 /Users/penguin/VibeHack06/scripts/submission/audit_package.py \
  --root "$candidate_root" --web "$delivery_stage/web" \
  --windows "$delivery_stage/windows/ReturnToGanymede-win32-x64" \
  --out "$delivery_stage/windows-audit" --label frozen-windows
```

首次调用Packager若本机没有锁定Electron的缓存，可能下载官方分发包；命令建议不表示已执行网络下载。审计、目标机验证和来源待核完成后再压缩整个便携目录，另记ZIP摘要。网页HTTP／MIME、手机多指／声音恢复与托管验收仍在 [手机交付说明](../MOBILE_WEB_DELIVERY.md) 范围内，本轮没有创建公网地址。
