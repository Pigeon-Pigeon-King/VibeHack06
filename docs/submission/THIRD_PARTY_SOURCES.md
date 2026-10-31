# 第三方来源与实际生产状态

2026-10-31。范围为备用候选HEAD `7877cbf`＋工作区、明确选择的历史Windows ZIP，以及主项目声音运行候选manifest。此表记录**实际读取的本地来源与复制证据**，没有逐项在线重新核验条款，也不决定整个游戏的许可证或作法律放行。完整审计结果与输入范围见 [装包审计](PACKAGING_AUDIT.md)。

## 进入本次网页／桌面技术栈

| 项目／版本 | 记录中的许可与来源 | 当前分发证据／边界 |
| --- | --- | --- |
| Three.js 0.186.0 | MIT；安装版 `node_modules/three/LICENSE`；[上游](https://github.com/mrdoob/three.js) | 候选 `licenses/dependencies/Three.txt` 与原文逐字一致；历史ASAR也有 `LICENSES/Three.txt`。包含使用到的addons，不混用CDN版本 |
| `@dimforge/rapier3d-compat` 0.21.0 | **Apache-2.0**；安装版 `LICENSE`；[上游](https://github.com/dimforge/rapier.js) | 候选 `licenses/dependencies/Rapier.txt` 与原文逐字一致；历史ASAR也有副本。内嵌WASM字节已核对，兼容包不是运行时下载WASM的证据 |
| Electron 45.1.0 | Electron MIT文本＋随二进制发布的Chromium／其他第三方声明；[上游](https://github.com/electron/electron) | 只用于Windows桌面容器；历史ZIP有 `LICENSE` 和 `LICENSES.chromium.html`，Electron原文与安装版一致。须保留完整运行目录；未Windows实机运行 |
| Vite8.3.5、TypeScript7.0.2、Vitest5.0.5、Electron Packager20.3.0、types等 | 锁文件与安装包是版本证据，各自许可仍随源码／工具分发方式核对 | 本次不是全部npm依赖SBOM；这些开发工具不因安装在本机就全部进入网页包。不得将整个node_modules作为游戏资源发布 |

Three许可文本SHA-256：`8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc`；Rapier：`4c05555705e3efde601fb1252ae48f1d63992af8a8fb8947745b7fa834e8f519`。文件存在与原文一致分别检查，不能用许可网页链接替代本次已要求保留的原文副本。

## 已接入的复用美术

| 资产 | 来源、作者与已有记录 | 当前事实与待核 |
| --- | --- | --- |
| AK-47 world-r1 | 原几何taradavies，[OpenGameArt AK-47](https://opengameart.org/content/ak-47-1)，本地记录CC0-1.0；Operation Steel Tide／AetherRadar适配与自制嵌入贴图按附带MIT，修订 `7ef7b539af1e0166e1d2735dc0ba200a08ba6492` | 项目原件、public与dist GLB摘要相同；MIT、原 `SOURCE_LICENSE.md` 和本作NOTICE已入包。原件没有clips；本作换弹／握持表现不因此成为供应商动画。原包说明已去掉来源不明的外部木纹／HDR；本审计核对自包含GLB，不重新鉴定像素来源 |
| F-35B网格与机构组件 | [FGMEMBERS/F-35B](https://github.com/FGMEMBERS/F-35B)，修订 `2726b3bdf3c7c54ea09a5d4a248e86a739604ca7`；Petar Jedvaj、Detlef Faber、F-GTUX、Stuart Cassie、Gary Brown及上游贡献者；原记录GPL-3.0 | 许可全文、NOTICE与组件对应源码ZIP已在public／dist；上游10文件摘要一致。本次组件源码包尚缺两项进行中的最新改动，不能称已同步；GPL发行范围／对应源码充分性另作待核，本轮不擅改整体游戏许可 |
| Headwind Corridor的F-35B转换／色板 | 用户明确授权复用自己的历史成果；原工厂与数值文件保留上游GPL署名；色板没有单独license头 | 保留作者与修改记录，不能把用户授权改写成CC0或替第三方取消条件。色板与原工厂归档保留，本作引用项目内副本，无兄弟目录运行依赖 |

候选路径：`public/licenses/WP-AK47/`、`public/licenses/reused-aircraft/f35b/`、`public/sources/reused-aircraft/f35b-ganymede-source.zip`。AK-47入库依据为候选 `assets/source/WP-AK47/{catalog-entry.json,pack.json,SOURCE_LICENSE.md,LICENSE}` 及 `artifacts/asset-jobs/WP-AK47-import/import-record.json`；F-35B依据为候选 `docs/REUSE_MILITARY_AIR_ASSETS.md` 与固定上游manifest。

本机军事库中其他型号只是候选，不能都列成当前运行资产。BREAKWATER F/A-18F记录的CC BY-NC-SA 4.0、EC135记录的GPL-2.0-or-later、MQ-28记录的CC-BY-4.0继续保留在选型记录；本次未把这些模型复制进候选运行链路。未来实际选用时逐件复核，不以用户拥有旧项目删除第三方来源。

## 已实际制作、尚未进入本次dist的内容

| 内容 | 本次可确认的阶段 | 分发前需保存的依据 |
| --- | --- | --- |
| ImageGen概念图及Tripo／Hyper3D生成资产 | 制作窗口已确认本次实际生产；候选已只读检查陆闻川、周延的Tripo绑定GLB，各41骨、无动画clips，尚未替换运行角色代理。不能继续沿用旧文档“未使用服务”的过时结论 | 经审查的概念修订、实际输入摘要、模型／绑定任务的安全ID摘要、原件／运行版摘要、适用账户与输出使用条款证据、作者与修改记录；来源／绑定／动作／实机状态分别记录 |
| 音乐：ACE-Step1.5／MLX | 运行候选manifest含11个cue、29文件；代码／模型修订、生产参数、输出hash已有本地记录，当前未游戏集成 | 音乐provenance当前没有license／输出使用依据字段；补安全来源与适用版本依据，不能只凭“AI生成”认定免除所有来源核对 |
| 配音：Qwen3-TTS／MLX-Audio | 制作窗口已有实际试音与用户选择；当前224文件运行manifest明确排除新对白／群众声音 | 音色来源、生成与用户选择记录、对应模型／代码版本和许可依据；完整对白另批生产，不能将试音数当作全战役配音完成 |
| 角色／工业场景原创代码与代理 | 当前仍承担大量游戏运行表现 | 不冒充正式3D成品；项目整体许可尚未在本次审计中作新决定 |

本轮没有读取Tripo／Hyper3D原始服务task响应。这些响应可能含临时签名下载URL，不应整体随公开源码或网页包分发；制作窗口应提供脱敏后的生产事实摘要。模型权重、缓存、账号配置、原始大型素材与概念审查原件均不因工具记录而自动进入交付包。

正式新资产仍按已批准的概念图→Tripo／Hyper3D或自制流程；工具不禁用GLB、声音或供应商目录。本项目有明确资产授权，Paean纯代码约束不用于否定这条已批准路线。

## 声音来源清单

当前实际运行仍为 `src/presentation/Sound.ts` 的临时合成声。以下是主项目 `design/audio/production-01/runtime/` **准备中**声音来源，以 `manifest.json`、`CREDITS.md`、`sfx-provenance.json`、`music-provenance.json` 为依据。224个文件摘要／头部已核对，不表示已经在游戏加载或全部试听通过。

| 来源／作者 | 本地记录的许可／授权 | 公开来源与用途边界 |
| --- | --- | --- |
| Ben Jaszczak、Brian Nelson、Kevin Heras、Matthew Nanney（bart提交） | CC0-1.0 | [Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library)；AK-47与其他实际记录枪型；相似枪型代理仍保留原型号 |
| SpringySpringo | CC0-1.0 | [Gun Reload Sounds](https://opengameart.org/content/gun-reload-sounds)；通用机械／换弹 |
| Kenney | CC0-1.0 | [Impact Sounds](https://kenney.nl/assets/impact-sounds)、[Interface Sounds](https://kenney.nl/assets/interface-sounds)、[RPG Audio](https://kenney.nl/assets/rpg-audio) |
| HaelDB、Thimras | CC0-1.0 | [Leather Cloth Armor](https://opengameart.org/content/footsteps-leather-cloth-armor)、[Metal Footsteps](https://opengameart.org/content/metal-footsteps-on-concrete) |
| IgnasD、LEGIT Audio | CC0-1.0 | [Wind](https://opengameart.org/content/wind)、[The Shop](https://opengameart.org/content/the-shop) |
| OwlishMedia、artisticdude、bart、laleksic、qubodup | CC0-1.0 | [202 More Sound Effects](https://opengameart.org/content/202-more-sound-effects)、[Swishes](https://opengameart.org/content/swishes-sound-pack)、[68 Workshop Sounds](https://opengameart.org/content/68-workshop-sounds)、[Various Sound Effects](https://opengameart.org/content/various-sound-effects)、[Metal Interactions](https://opengameart.org/content/metal-interactions) |
| Rudmer_Rotteveel | CC0-1.0 | Freesound条目 [336008](https://freesound.org/people/Rudmer_Rotteveel/sounds/336008/)、[343746](https://freesound.org/people/Rudmer_Rotteveel/sounds/343746/) |
| derjuli、priesjensen、tbsounddesigns | CC0-1.0 | Freesound条目 [824109](https://freesound.org/people/derjuli/sounds/824109/)、[495795](https://freesound.org/people/priesjensen/sounds/495795/)、[405322](https://freesound.org/people/tbsounddesigns/sounds/405322/) |
| 用户自制VTOL／BREAKWATER设计与本作命中提示 | 明确的项目复用授权／原创本地设计 | 制作侧 `source/sfx/user-owned/AUTHORIZATION.txt`；该授权不改称CC0，不覆写录音来源 |

这些链接是已读取的制作记录中的公开来源，本轮没有进行逐页条款重查。许可不足／对应关系不完整应标待核；不把链接能打开、文件能播放或用户试听通过混同于版权来源完整。

给玩家的运行包保留简短CREDITS、必要原文／NOTICE与安全manifest；母带、原始录音、模型缓存和供应商响应留在制作存档。涉及源码提供义务的组件须单独保留其已选择的对应源码交付，不用“只交运行版”一概省略。
