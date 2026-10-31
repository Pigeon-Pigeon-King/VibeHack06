重返木卫三 · 开场及章节衔接旁白

31 cue：4条开场 + 27条章节桥。声音沿用用户已批准的闻川B / lu.a19原创AI base。
用户已授权本批制作完成后直接交主窗口接入，无需再次试听确认。

manifest.json 的 assets 可直接传给 HtmlNarrationPlayer。file 相对本 runtime 根目录，必须完整复制 audio/ 子目录；没有网络供应商或模型运行时依赖。
每条字幕的 text 和 cueId 与已冻结原文完全一致，只朗读 cues.text。
用媒体 ended 事件推进，别按 readingSeconds 裁切录音。MP3为48kHz单声道192kbps。

sourceTextSha256 保持代表 bridges.json；sourceTextHashes 同时记录 opening.json 与 bridges.json，productionListSha256记录31条生产总表。
无损原音、48kHz PCM24、复录历史、机器检查、性能记录及每段连听版留在对应生产目录。
机器ASR提示不等于真人听审；一个转写器重复字符提示已通过同源无提示复核处理，原记录保留。
