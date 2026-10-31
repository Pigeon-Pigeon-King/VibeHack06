# 当前版路演材料交接 · 2026-10-31

## 本次最终交付 · 已按用户要求停止新增录制

- 已完成45.000秒故事剪辑、8页HTML及可离线打开的ZIP。影片主文件：artifacts/trailer-45s/v2/delivery-cut/ganymede-story-trailer-45s.mp4；HTML入口：artifacts/submission/presentation/index.html。
- 依用户“不要再录制，立刻完成剪辑和html交付”，所有游戏采集均已停止，take03未启动。当前成片使用3.6秒S05有效原片，以及S01/S05两张完整加载的实机截图；其余为截图剪辑推拉与末4秒片名。影片已明确标出“实机录屏”或“实机截图”，不称为连续战斗演示。
- 使用已完成的45秒专用配乐、闻川旁白和中文字幕；按用户裁决不再等待游戏同期音效。S01损坏WebM、资源未加载完整的图片及旧northgate白盒素材全部排除。
- HTML已接入这两张实机图和最终MP4；未拍到的4个图像槽保留线稿占位，讲稿仍为120秒、影片45秒、切换余量15秒。
- 已通过Paean技能的独立临时Playwright流程完成实际采集和HTML浏览器检查；此前CUA报错仅为历史接口状态，不再作为本次HTML交付障碍。8页翻页、图片加载和内嵌影片播放通过，视频时长45.000秒，实际播放进度增加1.377秒，图片和控制台错误均为0。
- 成片完整音视频解码通过：1920×1080、30fps、1350帧、H.264＋AAC。六帧目视确认中文字幕及片名完整。用户听审及完整游戏真人验收未由本次剪辑代替。
- 来源与剪辑记录：artifacts/trailer-45s/v2/delivery-cut/manifest.json；媒体验收：同目录qa/qa.json；HTML检查：artifacts/submission/browser-qa/2026-10-31T11-01-21-647Z/result.json。

以下为按当时状态保留的历史记录；当前交付以上述结果为准。

素材盘点读取基线：`main@b3c88dd50b848c54b6a3016cdff24bc167ae7a0d`。当前发布源码为 `a9030c6`，包含手机兼容与菜单开发候选清理；GitHub仓库后续已由主窗口按用户授权改为公开，GitHub Pages与Clide入口已经交付。本窗口未重新进行手机或浏览器验收，也不把旧媒体绑定到新提交；新截图应登记真正录制时的构建。

## 先纠正截图归属

盘点时，`artifacts/release-20261031/screenshots/` 中以下三张 LEGACY 副本来自旧的独立 `northgate` 验证场，不是正式战役 S05 的 `frontgate`：

- `03-s05-ads-cover-line-LEGACY.jpg`
- `04-s05-evacuation-task-LEGACY.jpg`
- `05-s05-objective-direction-LEGACY.jpg`

请由截图清单负责人纠正其场景标题与 manifest。旧图中“接通称重台撤离线”的 HUD 属于旧独立验证场；不能因两处均叫北闸，就按当前 S05 交付。固定版本代码证据、原图路径与摘要见 [S05素材盘点](s05-media-inventory.md)。本窗口没有覆盖或更名截图代理的文件。

01／02 对应历史 S05，仍没有绑定当前交付构建。限定范围内检查46个图片文件，可证明属于盘点基线 `b3c88dd` 的截图为0张，实际玩法视频为0个；后续也未新增 `a9030c6` 的实拍证据。不能将这五张历史副本填作新版实拍完成。

## 已可直接使用

| 材料 | 位置 | 状态 |
| --- | --- | --- |
| 游戏短简介、故事引入、S05试玩说明 | [current-release-intro.md](current-release-intro.md) | 可复制；未将完整战役或设备验收写成完成 |
| 8页HTML演示 | [index.html](presentation/index.html) · [离线ZIP](ganymede-presentation.zip) | 图片与45秒视频保留占位；文字、标题、备注与计时已完成 |
| 两分钟口播 | [SPEECH_2MIN.md](../../docs/submission/SPEECH_2MIN.md) | 沿用用户修订；120秒目标待真人试读 |
| 透明标题 | [ganymede-title-v1.png](../../assets/source/branding/ganymede-title-v1.png) | 2172×724 RGBA；来源与Alpha已核对 |
| 45秒音乐＋闻川旁白试听 | [MP3](presentation/assets/trailer-audio-preview.mp3) | 与声音窗口冻结文件摘要一致；不含实机SFX，待用户听审 |
| 45秒可播放预剪稿 | [MP4](../trailer-45s/v2/preedit-project/output/trailer-45s-preedit.mp4) · [编辑配置](../trailer-45s/v2/preedit-project/project.json) | 已实际编码；11段明确占位、音乐／旁白／字幕／末4秒标题，不是实机成片 |
| 独立音乐、六句干声、旁白轨及字幕 | `design/audio/trailer45-v2/delivery/` | 三份WAV母带均45.000秒；使用声音窗口实际时码 |
| S05拍摄与45秒玩法备选 | [S05_CAPTURE_AND_45S.md](S05_CAPTURE_AND_45S.md) | 待实拍清单，不是完成片 |

路演继续使用 **120秒宣讲＋45秒影片时槽＋15秒切换余量**。原95秒现场操作段不恢复；本次短介绍是介绍页／另行口播的备选，不额外塞入两分钟正文。

## 当前无法完成的实拍

本窗口调用 CUA 得到 `browsers: []`，直接创建Codex内置浏览器 `iab` 及重置后重试均返回 `Local browser use is disabled in Work settings`。用户随后提供的设置截图明确显示网站浏览为“始终允许”；工具结果与界面设置不一致，原因尚未查明，不能直接解释成用户未授权。当前会话仍未获得可用于实际游戏录制的浏览器表面。

因此新版五张截图与45秒实机视频仍未产出。补拍前需要恢复允许的浏览器控制表面，或由用户提供真实原片；不需要等待完整战役验收，只需在实际S05局部完成这次拍摄。图像占位、旧图与音频不会被拼成冒充实机的成片。

用户要求立即开始视频后，已导出清楚标注占位的45秒预剪MP4并接入HTML备注工具。它用于核对现有音乐、旁白、字幕与片尾合成，正式影片槽仍保留空值；与上文“实机视频未产出”不冲突。

S05是正式 `frontgate`，不是旧 `northgate`。S10专属的Q请求掩护、协作搬运等画面不能在S05中虚构；父亲／班长回忆、护送取舍、接防、救援与结尾守门仍按指定章节补拍。S05普通玩法备选与原剧情版分开记录。

原BGM静音、保留实机SFX的底层分组接口存在，但当前UI没有独立入口，章节旁白还有独立播放器。录制预设须由运行负责人接入并确认。本窗口不修改 `src` 或 `public`；该音频入口缺口不妨碍将来先拍静态截图。

## 链接与版本接手

本机游戏入口为 [http://127.0.0.1:5188/](http://127.0.0.1:5188/)，本轮只确认HTTP 200，不据此声明已实际操作新版。

| 用途 | 地址 | 交付状态 |
| --- | --- | --- |
| 首选在线试玩 | [GitHub Pages游戏](https://pigeon-pigeon-king.github.io/VibeHack06/) | 主窗口核对入口、JS、CSS、GLB、MP3与清单HTTP 200，摘要匹配冻结构建；不等同浏览器操作验收 |
| 备用试玩入口 | [Clide](https://7ja2szw7s.clide.app/) | 入口以iframe加载同版GitHub Pages；完整包上传曾返回413，不能声称全部资产托管于Clide |
| 公开源码 | [GitHub仓库](https://github.com/Pigeon-Pigeon-King/VibeHack06) | 主窗口回执确认公开；远端main为a9030c6，Glowin邀请pending |
| 完整游戏镜像 | [GPT Site](https://return-to-ganymede.muddy-curry-7368.chatgpt.site) | 主窗口已交接版本1部署成功；381个游戏文件匹配冻结构建，为完整游戏 |

来源为主窗口交接及 [Pages发布回执](../release-20261031/github-pages/README.md)、[HTTP文件核对](../release-20261031/github-pages/http-verification.json)。机器可读地址见 [release-links.json](release-links.json)。本窗口没有另行发布、改变可见性或核验邀请。

主窗口另有 [发布简介](../release-20261031/GAME_INTRO.md)，本窗口的介绍补充保留用户要求的十年占领、回归愿望与双复仇线。HTML仅在演讲者备注里增加试玩与源码链接，主画面继续维持少字布局。
