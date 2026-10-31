# 45 秒预剪工程

这是可播放的**预剪稿·实机镜头待补**，用于看 11 镜节奏、听音乐与闻川旁白、核对实际字幕和片名。所有镜头当前都是明确标注的深色占位卡，不是真实游戏画面，不是正式宣传片。源音频没有同期游戏 SFX，渲染器也不补造。

脚本：[render_trailer_preedit.py](../../../../scripts/submission/render_trailer_preedit.py)。配置：[project.json](project.json)。镜头边界读取 [timeline.json](../timeline.json)；字幕只读取声音窗口的实际交付 SRT，忽略旧时间线中的录音前字幕时码／素材状态。音乐与旁白已在既有试听 WAV 中混好，不重复叠加独立母带。

## 运行

本机依赖已找到，无需安装。中文文字由 Pillow 栅格化，FFmpeg 不必支持 drawtext/libass；编码需要 libx264 和 AAC。默认只开 2 个编码线程，避免不必要的同机负载。

在仓库根目录执行：

```sh
/Users/penguin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12 \
  scripts/submission/render_trailer_preedit.py \
  --ffmpeg /Users/penguin/VibeHack06/design/audio/round-01/.tools/music-venv/lib/python3.12/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1
```

默认输出到本工程的 `output/trailer-45s-preedit.mp4`，同时生成 `.render.json` 来源记录与 `.ffmpeg.log`。现有文件不覆盖；主动更新同一份预剪时加 `--overwrite`。可用 `--output /绝对路径/预剪.mp4` 指定目的地，`--font` 指定其他中文 TTF/TTC，`--threads 2` 控制编码并发。用 `--check-only` 只校验输入，不生成媒体。

目标输出为 1920×1080、30 fps、1,350 帧、45 秒、H.264／AAC／yuv420p。脚本逐帧送入编码器，末 4 秒合成原始透明标题；原 PNG 只读，保持全程预剪角标。实际 SRT 的毫秒边界按 30 fps 向上落到可显示帧，偏差不足一帧；原始时码同时保存在来源记录。

## 替换真实素材

只在确实获得原片后，把对应镜头的 `sourceClip` 改成仓库相对路径或绝对路径，并记录 `sourceInSeconds`。示例结构如下，示例路径不表示文件存在：

```json
{
  "id": "T04",
  "cardTitle": "从掩体进入交火",
  "cardDetail": "待补：原速瞄准、开火与实际命中",
  "sourceClip": "实际记录的原片路径.mp4",
  "sourceInSeconds": 12.5,
  "provenance": {
    "sceneId": "S05/frontgate",
    "buildId": "实际提交与构建记录",
    "captureKind": "human_keyboard_mouse",
    "sha256": "实际原片摘要"
  }
}
```

真实片段按原速解码，按比例放入 1920×1080，必要时留边；不变速、循环或用末帧补长。原片短于镜头所需时会失败，不生成假动作。渲染记录包含原片摘要、入点、版本／场景／输入类型。原片声音目前忽略，输出仍只用已冻结的音乐＋旁白试听；真实 SFX 的后续混音是另一步。即便替换部分片段，脚本仍保留“预剪稿·实机镜头待补”角标，不自动宣告正式成片。

S05 原片只能替换原计划允许的交火／通用环境镜头，不能冒充父亲、班长、S08 取舍、S09 接防、S10 搬运或 S12 守门。若采用完整 S05 纯玩法备选，应使用它自己的镜头／音乐方案，不能将这六句剧情旁白直接罩在全段 S05 上。

## 渲染后检查与 HTML 接入

来源记录里的 `renderedFrames` 是脚本实际送入的帧数；脚本刚生成记录时，`independentMediaInspection` 和听审初始为待核，实际检查后再更新。主窗口需检查 MP4 能解码、视频 1,350 帧／30 fps、音轨与容器时长、六句字幕、最后 4 秒标题和全程角标。脚本退出成功不替代视觉与听审。

本次实际输出已由主窗口补充检查：完整解码1,350帧，容器45.00秒，六个抽取帧的中文／字幕／占位标记／标题可读且未裁切。结果见 [validation.json](output/validation.json) 与 [抽帧检查图](output/preedit-contact-sheet.jpg)。实时浏览器播放和用户听审尚未进行。

这份 MP4 只能接到 HTML 的“预剪试听”入口，正式影片槽继续 `null`。浏览器禁用时，不绕过设置做录屏或把播放未验写成通过。真实实机素材未到位前，文件名、入口和交接说明都保留“预剪”字样。
