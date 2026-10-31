# 60 件生产资产接入清单

这份清单对应本次统一构建候选。最终75文件／866项回归、类型检查和构建通过，详见 [最终验证](final/README.md)。已核对 **60 个独立生产 ID：13 人物、25 道具、22 架构资产**。它们的运行文件与源码入口存在；这不是全部地图、全部动作或实机画面已验收的声明。

[逐件来源、文件 SHA、字节数和调用／放置映射](all-assets.json) · [道具接入记录](props/README.md) · [架构接入记录](architecture/README.md) · [动作资产记录](tactical/assets-handoff.md)

## 本轮已完成

- 60 个生产 ID 与生产总表完全一致；107 个模型运行 GLB 的 SHA／bytes 全部通过。模型文件共 129,180,640 B。
- 旧场景目录中的 BG-CRANE、ENV-LIGHTKIT-POLE、PROP-TANK 与架构三档属于同一生产 ID，记录全部运行变体，未重复算成 63 件。
- 共享行走片段和 13 份战术包另列。连同模型共核对 121 个 GLB、162,272,264 B；17 个战术片段是片段种类，不是 17 个新增模型概念。
- 25 道具按真实章节使用／存放位置接入；22 架构通过 PreparedGameLevel → GeneratedArchitecture 挂到真实环境。人物通过身份/角色目录进入 NPC、人群或第一人称视图。
- 全部记录的运行路径位于项目 public 内；所有文件 SHA、字节数稳定。轻量检查了 GLB JSON 中的 buffer/image URI，均内嵌；没有解析顶点或执行新 GLTF 几何测试。
- 运行目录、ModelLibrary 调用及目录源码未发现本机生产库绝对路径依赖。sourcePath 仅作来源元数据，加载函数使用项目 runtimePath/url。

## 用户可检查的范围

| 类别 | 这轮实际接入 | 仍需实际检查 |
| --- | --- | --- |
| 13 人物 | 身份匹配、独立儿童模型、共享模型租约；NPC／人群／第一人称入口 | 皮肤变形、握枪、受伤/照护/搬运和多人接触 |
| 25 道具 | S05–S07 北闸、S11 救护点、S12 控制台等明确使用或存放位置 | 纹理、贴合和视觉/碰撞差异；车辆/门锁/担架不宣称机械动作已完成 |
| 22 架构 | S01/S02 入口拱冠，S05–S07 场地/建筑/远景，S08 桥下构件，S11 墙地屋面，S12 屋盖与岸外船 | 第一人称可见性、接缝、遮挡、比例和真实 LOD/渲染成本 |
| 共享动作 | 17 片段包已复制，当前 ImportedCharacter 可加载；5 片段进入受限人物状态选择 | 其余掩体、蹲下/起立、开火等片段没有声称全状态上线或视觉通过 |

战术接线当前选用 ready_idle、idle、run、crouch_idle、crouch_walk。它要求显式仿真时钟、成人且通过角色/状态过滤；儿童、CH-SHAO/CH-DOCTOR/CH-SHEN，以及伤倒、照护、搬运、约束、换弹等继续使用稳定回退。动作接线已冻结；不使用这些动作的回退人物不额外请求战术包，JSON中的来源与资源摘要保持有效。

## 60 个独立 ID

| ID | 名称 | 类别／章节或入口 | 运行 GLB 数 |
| --- | --- | --- | ---: |
| ARCH-BEAM-STEEL | 钢梁模块 | 架构：S05、S06、S07 | 3 |
| ARCH-CARGO-CONTAINER | 货运集装箱 | 架构：S05、S06、S07 | 3 |
| ARCH-COVER-CONCRETE | 混凝土掩体 | 架构：S05、S06、S07 | 3 |
| ARCH-FLOOR-METAL | 金属地板模块 | 架构：S05、S06、S07、S11 | 3 |
| ARCH-ROOF-METAL | 金属屋面模块 | 架构：S05、S06、S07、S11 | 3 |
| ARCH-WALL-PAINT | 涂装墙模块 | 架构：S05、S06、S07、S11 | 3 |
| BG-CRANE | 港区吊机 | 架构：S05、S06、S07 | 4 |
| BG-HEAT | 远景供热厂 | 架构：S05、S06、S07 | 3 |
| BG-SHIP | 岸外接收船 | 架构：S12 | 3 |
| CH-DOCTOR | 医师 | 人物身份／角色入口 | 1 |
| CH-ENEMY | 敌兵 | 人物身份／角色入口 | 1 |
| CH-FATHER | 陆建平 | 人物身份／角色入口 | 1 |
| CH-LU | 陆闻川 | 人物身份／角色入口 | 1 |
| CH-LU-CHILD | 陆闻川 · 儿童独立模型 | 人物身份／角色入口 | 1 |
| CH-LUO | 罗敬 | 人物身份／角色入口 | 1 |
| CH-MENG | 孟齐 | 人物身份／角色入口 | 1 |
| CH-SHAO | 邵原 | 人物身份／角色入口 | 1 |
| CH-SHEN | 沈玉芬 | 人物身份／角色入口 | 1 |
| CH-XU | 许岚 | 人物身份／角色入口 | 1 |
| CH-ZHAO | 赵启明 | 人物身份／角色入口 | 1 |
| CH-ZHENG | 郑铎 | 人物身份／角色入口 | 1 |
| CH-ZHOU | 周延 | 人物身份／角色入口 | 1 |
| ENV-BRIDGEKIT-DECK | 桥下板模块 | 架构：S08 | 3 |
| ENV-LIGHTKIT-POLE | 工业灯杆 | 架构：S05、S06、S07 | 4 |
| ENV-PIPEKIT-ELBOW | 管道弯头 | 架构：S05、S06、S07 | 3 |
| ENV-PIPEKIT-STRAIGHT | 直管模块 | 架构：S05、S06、S07 | 3 |
| ENV-WALLKIT-PANEL | 工业墙板 | 架构：S05、S06、S07 | 3 |
| MAP-A-ARCH-01 | 避难所入口拱冠 | 架构：S01、S02 | 3 |
| MAP-B-CORRIDOR-01 | 货运连接廊 | 架构：S06、S07 | 3 |
| MAP-C-FACADE-01 | 港区外墙面层 | 架构：S05、S06、S07 | 3 |
| MAP-C-ICEBANK-01 | 冰岸远景 | 架构：S05、S06、S07 | 3 |
| MAP-E-PIER-01 | 桥墩 | 架构：S08 | 3 |
| MAP-F-ROOF-01 | 接收仓库屋盖 | 架构：S12 | 3 |
| PROP-ARMOR-CHEST | 可拆轻胸甲 | 道具：S11 | 1 |
| PROP-ARMOR-HELMET | 敌兵头盔 | 道具：S11 | 1 |
| PROP-ARMOR-LEFT-BRACE | 左膝旧支具 | 道具：S11 | 1 |
| PROP-BENCH | 工业长凳 | 道具：S11 | 1 |
| PROP-BOOTH | 查验岗亭 | 架构：S05、S06、S07 | 3 |
| PROP-CARGO | 货箱 | 道具：S07、S05、S06 | 1 |
| PROP-DOOR-LEAF | 滑动门叶 | 道具：S07、S05、S06 | 1 |
| PROP-DOOR-LOCK | 滑动门锁杆 | 道具：S07、S05、S06 | 1 |
| PROP-FAN | 风机 | 道具：S07、S05、S06 | 1 |
| PROP-FILTER | 滤芯维护机组 | 道具：S07、S05、S06 | 1 |
| PROP-LIFE-MUG | 生活杯 | 道具：S11 | 1 |
| PROP-MEDICAL-BAG | 护理包 | 道具：S11 | 1 |
| PROP-PUMP | 泵组 | 道具：S07、S05、S06 | 1 |
| PROP-RADIO-HEADSET | 单耳耳麦 | 道具：S11 | 1 |
| PROP-RADIO-PACK | 通信背包 | 道具：S11 | 1 |
| PROP-SAMPLE-CABINET | 样本柜 | 道具：S11 | 1 |
| PROP-SAMPLE-CORECASE | 冰芯匣 | 道具：S11 | 1 |
| PROP-STRETCHER | 手提担架 | 道具：S11 | 1 |
| PROP-TANK | 工业罐体 | 架构：S05、S06、S07 | 4 |
| PROP-TERMINAL-CONSOLE | 港务控制台 | 道具：S12 | 1 |
| PROP-TERMINAL-HANDHELD | 手持终端 | 道具：S11 | 1 |
| PROP-TOOL-BAG | 维修包 | 道具：S07、S05、S06 | 1 |
| PROP-TOOL-LUNCHBOX | 饭盒 | 道具：S07、S05、S06 | 1 |
| PROP-TOOL-ROLL | 工具卷 | 道具：S07、S05、S06 | 1 |
| PROP-TRANSFER | 转运车 | 道具：S11 | 1 |
| PROP-VEH-TRANSPORT | 人员货物运输车 | 道具：S07、S05、S06 | 1 |
| PROP-VEH-TUG | 港区牵引维修车 | 道具：S07、S05、S06 | 1 |

## 保留的表现与验收边界

并未宣称整张地图所有白盒已替换。S03/S04/S09/S10 没有本轮新增架构替换声明；浅拱顶、动态医疗帘/床/输液设施、部分门窗机械细节和信息叠层仍保留既有或独立表现。道具负责人已替换的滤芯/泵、储物柜、双凳等应以 props 映射为准，不能把原架构方案的旧“未覆盖”清单直接当成当前仍缺。

旧碰撞与导航继续负责玩法，生成视觉不自动成为精确物理外形。桥下构件未替换原可行走桥面；远景面层不等于整栋建筑可进入。S02/S07 声明复用已挂载结构，但本轮架构负责人的六场景数值证据未单独重跑这两个入口。

本分工只做文件摘要、路径、轻量 GLB 依赖元数据和源码调用核对，没有运行重几何解析、全套测试、构建、浏览器、手机或 Windows。制作窗口已有的几何/生命周期测试在各专属记录里，不能替代真实画面、真人操作或性能验收。本轮不发布；后续 Clide／本机／GitHub 测试不由本清单自动发起。
