# 章节衔接旁白生产单

用户已要求由现有“音乐、音效与配音”窗口生产这批旁白，并在该窗口明确“旁白直接用闻川的声线就可以”。声线沿用已批准的闻川 B／lu.a19 base；角色口吻仍为克制、清楚的第三人称叙述，不将序章之外的信息改写成九岁闻川的亲历。

原文来源为 `src/chapter-transition/opening.json` 和 `bridges.json`，共开场 1 段、章节桥 11 段。只朗读 cues.text，heading、kicker 和开发备注不读。既有27条章节桥文字和SHA保持不变，新增开场按独立cue ID追加，避免重录已冻结条目。文字已按 human-fiction-zh 与 Humanizer 修订，并经根窗口复核。

生产总表位于 `docs/chapter-transition/narration-production.json`。`sources`记录两个原文文件的SHA，`sequences`记录开场与桥段顺序，`cues`提供稳定cueId/sequenceId/text/readingSeconds。用 `node scripts/chapter-transition/export-narration.mjs --check` 检查总表与原文同步；无 `--check` 时重新导出。runtime清单仍按下面的assets形状交付，生产总表不是已经生成声音的证明。

人名和动作先后读清，不在句末添加感叹，不额外预示死亡。沿用闻川B已批准的base与现有生产流程。供应商读音标注只用于纠正发音，不增删叙述内容。

生产窗口独占建议目录 `design/audio/chapter-bridge-01/`，与本模块、主窗口 Game/Sound 入口和既有对白分开。正文不在生产阶段擅自增删；发现不顺或读音问题按 cue ID 回报。可在供应商输入层标注人名发音和停顿，清单 text 仍须保留原文。

每条回交本地无损源、游戏可用 OGG/MP3、实际时长、哈希、生产来源及试听备注。每桥另给顺序连听版，用于听断句；运行仍使用单 cue 文件。游戏清单建议：

```json
{
  "schemaVersion": 1,
  "sourceTextSha256": "填写 bridges.json 的 SHA-256",
  "assets": [
    {
      "cueId": "bridge-s01-s02-01",
      "text": "与冻结文字完全一致",
      "file": "bridge-s01-s02-01.ogg",
      "durationSeconds": 7.23,
      "sha256": "实际文件哈希"
    }
  ]
}
```

runtime 文件复制到项目内部，路径相对调用方指定的音频 base；不交付运行时供应商 URL、临时下载地址或共享库绝对路径。实测时长覆盖整个文件，并保留自然句末停顿。readingSeconds 仅作缺失声音时的阅读降级，不用于裁切成品。

runtime清单同时保存生产总表的SHA-256及两个sources摘要；兼容已有批次时，可保留旧sourceTextSha256字段代表bridges.json，并补充sourceTextHashes数组表示开场与桥段两个来源。

验收逐条检查：总表中的全部 ID 完整且唯一、原文完全相符、人名读音、无截字或长空白、连听节奏、峰值与响度一致。配音窗口完成后将本地文件、清单和实测时长交给主窗口；主窗口统一接入新游戏开场及各章节桥，并做真实浏览器试听。
