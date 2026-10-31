# 战役开场旁白

文案候选，供主窗口终审及旁白生产。开场先交代地点与眼前局势，再落到九岁闻川和父亲的行动；正文结束后进入 S01“检修门”。

## 最终正文

标题：重返木卫三

提示语：十年前 · 冰脊港

标题和提示语只显示，不朗读。旁白使用以下四条 cue 的 text。

| Cue ID | 字幕与旁白 | 阅读秒数 |
| --- | --- | ---: |
| opening-campaign-01 | 木卫三经过几代人的改造，有了可呼吸的空气；冰脊港的居民靠供热设施抵御寒冷。 | 10 |
| opening-campaign-02 | 当地爆发叛乱，工区居民挤进避难所，驻军守着入口，准备掩护人们从检修通道撤离。 | 10 |
| opening-campaign-03 | 九岁的陆闻川和父亲陆建平待在主厅，母亲许岚去了医院。 | 7 |
| opening-campaign-04 | 检修门前的过道被一张床垫堵住，陆建平准备过去帮人清出通路。 | 8 |

共 4 个 cue，119 个有效字（汉字、字母或数字），含标点为 130 字符。无音频时的阅读时长共 35 秒；各句按每秒 3.5 个有效字计算，向上取整到 0.5 秒，至少 3 秒。实际配音时长由后续音频测量确定。

## 逐句信息与来源


### opening-campaign-01

新增信息：交代木卫三已具备可呼吸的大气，并给出冰脊港依靠供热生活的环境条件。

来源：[当前世界规则](../handoff/current/02_WORLD_AND_STORY.md)的空气、温度、日常条目与冰脊港位置；[世界设定稿](../handoff/current/references/world_ganymede.md)的叛乱前改造与居住发展。

视点与时序边界：这是进入儿童视点前的简短背景。采用当前木卫三设定，不带入旧小说的木卫六名称、太阳与天空描写，也不添加工程年代或具体技术。

### opening-campaign-02

新增信息：说明居民为何聚在避难所，以及驻军防守入口、准备经检修通道撤离的眼前任务。

来源：[当前世界与故事](../handoff/current/02_WORLD_AND_STORY.md)的“为什么等了十年”；[序章时间线](../PROLOGUE_TIMELINE.md)的 T01、T02；[小说第一章开头](../handoff/current/references/novel_original.md)的避难厅与驻军撤离片段。

视点与时序边界：“当地爆发叛乱”采用当前历史框架，不判断九岁闻川对政治局势的理解。场景停在防守与准备撤离；不提前交代防线崩溃、轰炸、坍塌、暴行、任何人的结局或敌方势力来源。

### opening-campaign-03

新增信息：交代主角的姓名与年龄、父子所在的主厅，以及母亲因去医院而与他们分开的处境。

来源：[序章时间线](../PROLOGUE_TIMELINE.md)的九岁闻川视点；[人物分册](../handoff/current/03_CHARACTERS_AND_ARCS.md)的陆建平、许岚；[Opening.ts](../../src/mission/Opening.ts)的 populateOpening；[小说第一章](../handoff/current/references/novel_original.md)的父子饭盒与母亲离开片段。

视点与时序边界：只说明已经成立的人物身份与位置。不开启母亲在医院的独立场景，不替父母补写新的决定、伤情或转运经历。

### opening-campaign-04

新增信息：把父亲的行动缘由落在堵路的床垫上：他准备帮居民清出撤离通路，接入 S01 父子合作清理过道的场景。

来源：[人物分册](../handoff/current/03_CHARACTERS_AND_ARCS.md)的陆建平职责；[Opening.ts](../../src/mission/Opening.ts)的 updateOpening childhood phase 0、1 与 openingObjective；[history-layout.ts](../../src/content/history-layout.ts)的 lunch、mattress 与西侧检修门位置；[小说第一章](../handoff/current/references/novel_original.md)的床垫卡住过道。

视点与时序边界：使用“准备”保留待执行动作。收好饭盒的具体提示留在 S01，床垫挪开、门打开与父子向门口移动也由关内继续推进；此处不提前完成交接或撤离。

## 机器清单与配音要求

[opening.json](../../src/chapter-transition/opening.json) 是单个开场对象，id 为 opening-campaign，from 为 null，to 为 S01。null 表示新战役入口；不创建 S00 章节或存档关。四个 cue ID 是音频和字幕的稳定对应键，标题、提示语及本页审稿备注均不进入配音文本。

本轮 opening.json 的 SHA-256：2cedf112062c87b7f30119f44f10623124cfe1a2d6ecb892b1c196c5d1533194。

readingSeconds 沿用 [章节旁白清单](NARRATION.md) 的降级阅读规则。配音使用用户已选择的闻川 B 声线，文本保持第三人称叙述。录音读清“陆闻川、陆建平、许岚、冰脊港”，以短暂停顿区分地点、局势和人物；结尾落在父亲清理过道的行动上。机器清单仍只保存文字与阅读时长，音频文件按 cue ID 回交。

## Fiction 与 Humanizer 审校记录

本轮沿用已完整读取的 human-fiction-zh 主技能，以及 scene-card-template.md、revision-workflow.md、ai-residue-checklist-zh.md。先锁定进入 S01 前的状态，再逐层检查因果、人物知识、视点与句子节奏。四条 cue 分别提供环境、撤离压力、家庭位置和父亲清理通道的缘由。

Humanizer 使用同轮已读取的 3.1.0 只读副本，按嵌入／文件模式保留最终文字。来源：[blader/humanizer SKILL.md](https://raw.githubusercontent.com/blader/humanizer/main/SKILL.md)，许可证 MIT；SHA-256 为 0612f1dfb1672b0ea9b97e139bf1f06cabe98d8b27424fe8ff01e1fb4cc99cad。

局部修改记录：

- 世界背景初稿曾并列介绍港口、工区与医院，收束后只保留可呼吸的空气和供热条件，把空间留给眼前撤离。
- 人物句删去泛泛的“等待下一步安排”，保留年龄、姓名和父母位置。
- 主窗口冷读指出“闻川得先收好饭盒”像任务提示，并重复关内对白；末句改为陆建平准备帮人清出通路，饭盒操作留在 S01。
- 各句保留行动主语。叙事限制写在本页备注，不放入玩家字幕解释“尚未知道”或“并不意味着”什么。

冷读结果：四条 cue 由远到近，能连到 S01 的父子日常与清理过道；“当地”承接木卫三的冰脊港，末句点明陆建平的行动，清理通路仍待玩家进入剧情后完成。全段没有讲述后续坍塌、死亡、班长结局或十年后接应任务，也没有给出绝对年份、轰炸方或父亲直接死因。

## 本轮检查

2026-10-31，开场清单的 Node 断言检查通过：对象结构、from 为 null、目标 S01、四个 cue 的唯一 ID、阅读时长计算、总时长范围、正文与文档一致，以及列出的后续信息和编辑说明边界。此检查只读取清单与文档。实际录音、断句及开场与 S01 的接入由后续配音和运行验收。
