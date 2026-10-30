# 来源索引与版本优先级

整理日期：2026-10-30。范围为当前游戏相关文件及用户在本会话中的明确决定。原工作目录不是Git仓库，无源提交SHA；本包没有伪造版本冻结或新的校验链。

## 使用顺序

1. 用户当前指令与本包D01—D17决定。
2. 01—10分册整合后的当前产品口径。
3. 人物因果参考事实表与完整小说；环境按木卫三设定迁移。
4. 历史方案用于追溯理由；出现旧低速、73人或小地图范围时不覆盖最新口径。
5. 原型测试记录只适用于其中注明的运行环境与范围。

## 随包来源

来源正文的本地链接已经移植；未随包条目保留原项目相对位置，不依赖源机服务。附件里的命令只是原记录，不作为当前执行指令。

| 附件 | 原项目相对位置 | 怎样使用 |
| --- | --- | --- |
| [novel_original.md](references/novel_original.md) | 重返木卫六_完整小说_v1.md | 完整小说，旧天体设定；人物与情感来源 |
| [novel_outline_v5.md](references/novel_outline_v5.md) | 木卫六_三万字小说章节大纲_v5.md | 十四章规划；字数为当时目标 |
| [source_bible.md](references/source_bible.md) | game-adaptations/重返木卫六/analysis/SOURCE_BIBLE.md | 人物事实与改编边界 |
| [world_ganymede.md](references/world_ganymede.md) | game-adaptations/重返木卫六/design/WORLD_SETTING_GANYMEDE.md | 当前世界方向；精细参数为工作设定 |
| [campaign_scale.md](references/campaign_scale.md) | game-adaptations/重返木卫六/design/CAMPAIGN_SCALE_REVISION.md | 三关尺度依据；旧低速核算已停用 |
| [game_design.md](references/game_design.md) | game-adaptations/重返木卫六/design/GAME_DESIGN.md | 十二段与密度修订；文内历史预算须区分 |
| [art_direction.md](references/art_direction.md) | game-adaptations/重返木卫六/design/ART_DIRECTION.md | 人物、演出、声音与资产职责 |
| [combat_encounters.md](references/combat_encounters.md) | game-adaptations/重返木卫六/design/COMBAT_ENCOUNTERS.md | 容错与来路原则；73人旧配额已停用 |
| [map_ganymede_v2.md](references/map_ganymede_v2.md) | game-adaptations/重返木卫六/design/MAP_DESIGN_GANYMEDE.md | 功能锚点与拓扑；旧全图尺寸已停用 |
| [walkthrough_review.md](references/walkthrough_review.md) | game-adaptations/重返木卫六/build/blender/campaign_v4/combat_v1/walkthrough_v3/review_20261028/问题梳理.md | 旧预演问题复核，不代表最新版本 |
| [northgate_playtest.md](references/northgate_playtest.md) | game-adaptations/重返木卫六/build/blender/campaign_v4/combat_v1/northgate_playable_v2/PLAYTEST_NOTES.md | 2026-10-30局部自动化记录；非真人或Mac验收 |
| [northgate_scene.md](references/northgate_scene.md) | game-adaptations/重返木卫六/build/blender/campaign_v4/combat_v1/northgate_playable_v2/SCENE_AND_FLOW.md | V2实际局部场地；不锁定新地图 |
| [asset_register.md](references/asset_register.md) | assets/third_party/scene_research_20261025/ASSET_REGISTER.md | 已有资产和依赖线索；模型未随包 |
| [assets_expanded.md](references/assets_expanded.md) | assets/third_party/scene_research_20261025_expanded/README.md | 扩充素材线索；模型未随包 |
| [fps_research.md](references/fps_research.md) | research/fps_foundations_hyper3d_20261030/README.md | FPS底座调研记录；不是完整底座已验收 |
| [hyper3d_research.md](references/hyper3d_research.md) | research/fps_foundations_hyper3d_20261030/HYPER3D_INTEGRATION.md | 既有Hyper3D接入研究；本包另列当日官方核对 |

## 本会话决定的依据

人类叛军＋外部支持；封锁与运力重建；陆闻川和周延命名；周延牺牲／闻川存活；成长先完成；结尾只赢得登陆机会；木卫三地球化；Three.js最终展现；多关卡尺度；真实弹丸；最新3倍速度与动作解耦；有叙事用途的实物掩体；本轮可重做具体关卡并使用Hyper3D／Tripo。这些源自用户消息，未伪造外部文档或聊天ID。

## 未随包的大体积材料

| 原项目相对位置 | 内容与使用方式 |
| --- | --- |
| incoming/dot_blender/20261025_v1/HIMALIA_BLENDER/blend/MASTER_SCENES.blend | Dot最初主工程；可提取组件，整体设计曾被用户认为过于简单 |
| assets/third_party/scene_research_20261025/ | 工业GLB、岩石与地表、贴图映射；见附件登记 |
| assets/third_party/scene_research_20261025_expanded/ | Poly Haven月面、Quaternius、Kenney、3DMoonX；不是最终地图 |
| game-adaptations/重返木卫六/build/blender/ | 各轮Blender场景、导出与地图原型，按需要定向取用 |
| game-adaptations/重返木卫六/build/blender/campaign_v4/combat_v1/northgate_playable_v2/ | 最新北闸局部源码与QA，当前包只带场地／测试说明 |
| research/visual_upgrade_20261027/slop-newyork/ | 已取得的城市与人物参考源码；不可当成整套本作成品 |
| research/fps_animation_staging_20261027/ | 动作、景别与调度研究线索 |

模型、贴图、浏览器缓存和凭据不在包内。本包重在产品构思，开始选定切片后再取用必要资产依赖。

## 本次查阅的外部一手入口

- [Hyper3D Quick Start](https://docs.hyper3d.ai/en/get-started/quick-start)与[MCP说明](https://hyper3d.ai/features/mcp)：异步生成与Codex接入。
- [Tripo SDK](https://developers.tripo3d.ai/en/docs/sdk)与[Codex插件](https://developers.tripo3d.ai/en/docs/codex-plugin)：v3接入及官方插件；旧API变更提示已记入06。
- [VibeHacks 06](https://vibecafe.ai/hacks/6)：开发原创规则；资源兑换标签本次工具未读取成功，不推断用户额度。

这些链接在2026-10-30查阅，账号功能与接口以后重新核对。本包不复制第三方教程全文。Nativue方法来源为本机已安装Skill，随包只有方法摘要，Mac应使用当地实际版本。

## 证据与完成状态

本次完成文档整合与包内链接／数据一致性核对；没有重跑旧游戏，没有在Mac测试，没有独立C评审，没有用户最终验收。popup=no；delete=no。
