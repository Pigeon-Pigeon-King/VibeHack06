# 开场与章节桥旁白接入

已把声音窗口交付的 `design/audio/chapter-bridge-01/runtime/` 原样复制至 `public/audio/chapter-bridge-01/`：31 条 MP3（4 条开场、27 条章节桥），音频共 **4,230,356 B**；加上原有 `manifest.json` 和 `README.txt` 共 33 文件、4,259,146 B。没有复制未选 take、原 WAV、混音连听版或生产模型。源文件未改动，没有重新生成、重编码、变速或裁切。

用户已明确授权免追加试听直接接入。沿用交付中的闻川 B / `lu.a19` 原 base；这项授权不表示已逐条完成真人听审。宿主主战役、存档接线由主窗口负责，本次资源检查不冒称游戏内播放或 Windows 验收。

## 宿主接线

```ts
import { HtmlNarrationPlayer } from './chapter-transition/HtmlNarrationPlayer';
import { NARRATION_ASSETS, getNarrationBaseURL } from './chapter-transition/narration-assets';

const narrator = new HtmlNarrationPlayer(NARRATION_ASSETS, getNarrationBaseURL());
narrator.setVolume(sound.volume);
// 将 narrator 传给现有 TransitionPorts.narration。

// 与现有全局音量设置在同一个回调中更新：
sound.setVolume(value);
narrator.setVolume(sound.volume);
```

`NARRATION_ASSETS` 是静态精简表，只含 `cueId`、`text`、`file`、`durationSeconds`、`sha256`，结构兼容 `readonly NarrationAsset[]`；不把生产参数或授权正文装进 JS bundle。实际 MP3 与完整交付清单留在 `public`，播放器不需要先请求 manifest。

`getNarrationBaseURL(baseURI = document.baseURI)` 返回 `new URL('audio/chapter-bridge-01/', baseURI)`。例如：

| 页面 | 音频 base |
| --- | --- |
| `https://host/game/index.html` | `https://host/game/audio/chapter-bridge-01/` |
| `game://local/index.html` | `game://local/audio/chapter-bridge-01/` |
| `game://local/candidate/index.html` | `game://local/candidate/audio/chapter-bridge-01/` |

文件名继续使用清单原值。仅 `bridge-s04-s05-01`、`bridge-s08-s09-02`、`bridge-s10-s11-01` 使用 `.t02.mp3`，其余为 `.t01.mp3`；不要按 cue ID 统一拼 take 号。

HTMLAudio 独立于现有 `Sound` 的 WebAudio master，因此 `sound.setVolume()` 不会自动更新旁白。两者同步使用用户的 `sound.volume`；静音时仍运行媒体并等待真实 `ended`，不能通过禁用 narration 或 `readingSeconds` 截断旁白。暂停、继续、跳过和切关取消由现有 TransitionController 调用播放句柄的 `pause/resume/stop`。宿主销毁时调用 `narrator.dispose()`，它会停止媒体、清除 `src` 与监听；现有播放器仍保留自动播放失败时返回 `unavailable` 的文字回退。

## 必要播放器修复

`HtmlNarrationPlayer` 原先只接受 HTTP、HTTPS 与 file 协议，因此桌面入口 `game://local/index.html` 的所有旁白都会回退为 unavailable。现增加严格的 `game://local` 支持：拒绝其他 game 主机、端口、用户信息、非目录 base、外部绝对 URL 和越出指定音频 base 的路径，并比较协议与 host，不能仅依赖自定义协议的 opaque origin。文本逐字匹配、实际 ended 推进、静音播放和取消释放语义保持不变。

## 冻结来源

| 文件或来源 | SHA-256 |
| --- | --- |
| `src/chapter-transition/opening.json` | `2cedf112062c87b7f30119f44f10623124cfe1a2d6ecb892b1c196c5d1533194` |
| `src/chapter-transition/bridges.json` | `3680b3bbf98aa365b652f732fad0f955e3ae4e2316b462ad0cbe9353d078d93d` |
| `docs/chapter-transition/narration-production.json` | `0d01be87fbf0024e8d7d72e9543a2288b0e7371194dd678fe77b930814360d39` |
| 原样复制的 `runtime/manifest.json` | `5b8a44bb60676fc5d41b0b2091198de7ef105b2c6e66166f308d594f8ecfe9be` |
| 闻川 B base | `d7963e29f30e14a025fe259958fe0efb308dcd6283679e02fd1a0b65ec9a56ec` |

`sourceTextSha256` 按原交付代表 bridges；`sourceTextHashes` 同时记录 opening 与 bridges；`productionListSha256` 对应 31 条总表。两棵工作树中的这三份文本／总表在本次复制时均与冻结值一致。逐文件来源与运行 digest、字节数及实际复制一致记录见 [source-copy-audit.json](source-copy-audit.json)。

## 定向验证

本次运行 [focused-tests.json](focused-tests.json) 中的 **73 项测试全部通过**：新增资产 44 项、播放器 29 项。包括 31 个 cue 与字幕及生产总表一一匹配、冻结摘要、33 文件穷尽清点、原件逐字节一致、每条 MP3 的 SHA／字节数，以及每个 MPEG 帧的结构／边界、48 kHz／192 kbps／单声道格式和与清单相同的编码帧时长。编码帧时长合计 176.208 秒，交付记录的解码净时长合计 174.48 秒；这些时长不用于裁切。

```sh
NARRATION_DELIVERY_RUNTIME=/Users/penguin/VibeHack06/design/audio/chapter-bridge-01/runtime \
  npm exec -- vitest run tests/chapter-transition/narration-assets.test.ts tests/chapter-transition/audio.test.ts --maxWorkers=1
npm exec -- tsc --noEmit -p scripts/chapter-transition/tsconfig.json
```

局部类型检查通过。`NARRATION_DELIVERY_RUNTIME` 仅用于本次审计与生产原件逐字节对比，不进入运行代码；未提供时该原件对比测试明确跳过，其余测试仍核对随库保存的来源摘要。没有运行全量测试、构建、浏览器、重新解码／ASR或试听。宿主入口、暂停／跳过／恢复存档的真实触发、媒体播放和 Windows 行为仍由主窗口验证。
