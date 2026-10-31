# 地图覆盖接入交接（2026-10-31）

工作区：`/Users/penguin/VibeHack06-asset-coverage`；仅此工作区写入。基线 `0b3b05b`。未修改 main、人物、各 environment builder、public 原件；未提交 Git。

结果：15 个真实场景都通过了生产 GLB 的节点、索引、属性、材质读取与全组原子替换测试；图片解码以 Texture mock 代替。全部 solids 的 ID、顺序、坐标、尺寸、旋转与 openFact 序列化 SHA 与基线相同。这证明构造和加载合同，**不证明画面、手感、可通行内部或浏览器 FPS 已验收**。

接入通过 PortKit 的 WeakMap 语义记录精确取得实例索引，不使用 S05/S11 的旧坐标扫描。公共 workshop/container/cover/tank/light/beam、地面、边界、平屋面、梁栏、直管、冰岸、远景建筑走架构；tractor 和终端主体归道具 owner，架构只接终端钢基座。跳过所有 generatedSlot/generatedPropHost 后代。旧目标在整组所有 LOD 就绪后才隐藏；失败保留旧目标；远处只切生产模型降面版，不重新显示白盒。

弧顶按原 20 段轮廓抽取 8 个内接弦面，生产屋面板贴外壳、钢梁组成细拱肋；尺寸适配测试同时验证原外包围与原内侧椭圆开口。楼梯采用生产墙板/踏板组合，原栏杆继续原路径；S01/S02 动态坍塌屋面、横梁、碎片挂在原移动父节点上。白/黄路标和警示色层保留，旧黑色路面/甲板接缝仅在同一覆盖矩形的生产地板成功后随其原子隐藏。

大场景仍有明确的几何成本风险。每个单盒装配最多 4,096 片；source aspect 限制未放宽。下表三角数是**整个场景每个 placement 选择同一级 LOD 的上界**，尚未视锥剔除，不含道具、角色、阴影或 UI。LOD0/1/2 全部几何常驻、共享 LOD0 材质/纹理。某些旧 Hyper3D 复杂源的 LOD2 保 UV 后仍很高面；不能把“LOD2”当作固定 384 面。

| 场景 | production placements | 单级批次 | LOD0 tris | LOD1 tris | LOD2 tris | 原目标实例/地面 | 未归架构接管 primitive |
|---|---:|---:|---:|---:|---:|---:|---:|
| northgate | 2,221 | 136 | 11,577,142 | 3,660,918 | 1,306,084 | 362 | 8 |
| prologue | 2,728 | 134 | 13,995,310 | 4,387,782 | 1,445,516 | 226 | 7 |
| handover | 2,526 | 131 | 13,022,738 | 4,098,984 | 1,384,422 | 294 | 0 |
| nightshift | 807 | 47 | 4,706,224 | 1,429,976 | 797,000 | 74 | 36 |
| workers | 5,978 | 261 | 30,457,248 | 9,432,524 | 3,030,572 | 733 | 14 |
| childhood | 2,271 | 141 | 12,316,366 | 3,561,750 | 1,474,470 | 113 | 42 |
| mainhall | 2,271 | 141 | 12,316,366 | 3,561,750 | 1,474,470 | 113 | 42 |
| frontgate | 2,638 | 163 | 13,953,152 | 4,391,904 | 1,699,372 | 667 | 14 |
| transfer | 3,068 | 177 | 16,140,148 | 5,065,120 | 1,919,280 | 698 | 24 |
| flank | 5,147 | 279 | 26,388,234 | 8,216,586 | 2,776,384 | 996 | 27 |
| escort | 8,583 | 428 | 43,492,878 | 13,556,298 | 4,303,100 | 946 | 16 |
| relief | 3,197 | 171 | 16,493,626 | 5,064,396 | 1,669,202 | 387 | 2 |
| rescue | 4,515 | 290 | 24,581,166 | 7,252,960 | 2,971,992 | 696 | 0 |
| medical | 586 | 26 | 2,903,112 | 878,960 | 224,872 | 23 | 7 |
| epilogue | 2,614 | 181 | 13,320,986 | 4,179,322 | 1,305,134 | 304 | 0 |

未归架构接管数量只计算 PortKit 实际构造记录，包括条件隐藏实体；其中可能是下游道具/武器 owner 要接的对象、信息叠层或真正缺资产。它不包含非 PortKit 的 Jupiter/天空、F35B、实时屏幕、任务指示器、角色或特效。不能把某场景该列为 0 解释成全场景全生成，更不能把 catalogue ID 数量当作已上屏数量。

S04 巴士已经由并行道具 owner 在 `chapter-environments.ts:252` 的 `workers-transfer-vehicle` 原子槽替为 `PROP-VEH-TRANSPORT`（长 7 m、原坐标与 yaw）；原 bus 碰撞仍为 `[3.3,3.0,7.0]`。这是复用运输车的临时车型，不是已产专用公交车；门/路线/任务行为没有由地图层修改。

## 剩余实体与具体源码

下表按实际构造调用位置分组。完整 JSON 逐个保存 batch/index、矩阵、初始可见性、调用栈、场景和文件 SHA。数量仅对应这一调用的真实剩余实例。B/C/D 的定义与表下注释见 JSON；跨场景重复项保留，便于独立验收。

### northgate

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| B | 基座或散落混凝土块 | 2 | `src/presentation/environment.ts:95` | 可按明确用途复用生产板/护墩，但需要单独定义碎块与基座的放置边界。；可复用候选：ARCH-FLOOR-METAL, ARCH-COVER-CONCRETE |
| B | 旧四分之一弯管 | 1 | `src/presentation/environment.ts:118` | 已有弯头源，但两端轴向和接头中心尚未逐件校准，当前保留原型。；可复用候选：ENV-PIPEKIT-ELBOW |
| C | 短支架/独立细节实体 | 5 | `src/presentation/environment.ts:119` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |

### prologue

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| B | 基座或散落混凝土块 | 7 | `src/presentation/environment.ts:151` | 可按明确用途复用生产板/护墩，但需要单独定义碎块与基座的放置边界。；可复用候选：ARCH-FLOOR-METAL, ARCH-COVER-CONCRETE |

### handover

本次 PortKit 架构扫描无剩余项；其他系统仍应独立核查。

### nightshift

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| C | 短支架/独立细节实体 | 1 | `src/presentation/chapter-environments.ts:116` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |
| B | 港区导向图实体背板 | 1 | `src/presentation/chapter-environments.ts:161` | 地图文字/色块是信息叠层；背板可进一步明确用 ARCH-WALL-PAINT，保留文本朝向。；可复用候选：ARCH-WALL-PAINT |
| D | 导向图上的信息色块 | 5 | `src/presentation/chapter-environments.ts:163` | 纯地图信息叠层，允许保留；当前保守 primitive 扫描列出，非生产物体缺失。 |
| C | 样本冰芯 | 4 | `src/presentation/chapter-environments.ts:167` | 样本应归道具（不能误改成工业直管）；平冰板不能把高冰岸模型强压平。需要独立源或经目检的源网格衍生。；可复用候选：PROP-MATERIAL-TUBE, MAP-C-ICEBANK-01 |
| C | 冰芯样本的端帽 | 8 | `src/presentation/chapter-environments.ts:168` | 应与冰芯道具一起由 props owner 接管，工业管法兰尺寸和材质不匹配。；可复用候选：PROP-MATERIAL-TUBE |
| B | 武器架/四支旧陈列枪零件 | 1 | `src/presentation/chapter-environments.ts:170` | 武器由独立 WorldAK 模块负责；架体可明确组合生产壁板/钢梁，避免把枪托当结构件。；可复用候选：WP-AK47, ARCH-WALL-PAINT, ARCH-BEAM-STEEL |
| B | 武器架/四支旧陈列枪零件 | 4 | `src/presentation/chapter-environments.ts:173` | 武器由独立 WorldAK 模块负责；架体可明确组合生产壁板/钢梁，避免把枪托当结构件。；可复用候选：WP-AK47, ARCH-WALL-PAINT, ARCH-BEAM-STEEL |
| B | 武器架/四支旧陈列枪零件 | 4 | `src/presentation/chapter-environments.ts:174` | 武器由独立 WorldAK 模块负责；架体可明确组合生产壁板/钢梁，避免把枪托当结构件。；可复用候选：WP-AK47, ARCH-WALL-PAINT, ARCH-BEAM-STEEL |
| C | 细缆线、管线或枪管（按源码上下文区分） | 4 | `src/presentation/chapter-environments.ts:175` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| B | 武器架/四支旧陈列枪零件 | 4 | `src/presentation/chapter-environments.ts:176` | 武器由独立 WorldAK 模块负责；架体可明确组合生产壁板/钢梁，避免把枪托当结构件。；可复用候选：WP-AK47, ARCH-WALL-PAINT, ARCH-BEAM-STEEL |

### workers

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| C | 细缆线、管线或枪管（按源码上下文区分） | 1 | `src/presentation/chapter-environments.ts:326` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| C | 建筑窗片/展示橱窗 | 12 | `src/presentation/chapter-environments.ts:379` | 需要经验证可分离的生产窗片或新增玻璃窗模块；不把完整外立面塞入薄窗槽。；可复用候选：MAP-C-FACADE-01 |
| C | 温室玻璃主体（弧顶已由生产屋面替换） | 1 | `src/presentation/chapter-environments.ts:395` | 需要独立温室/透明墙体生产资产；现有 MAP-C-FACADE-01 是不透明外立面，不能填掉玻璃体。 |

### childhood

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| C | 大厅圆柱的圆形柱脚 | 5 | `src/presentation/history-environments.ts:88` | 已有直管可供柱身；当前无匹配的圆形厚底座，需要源部件衍生或独立基座。；可复用候选：ENV-PIPEKIT-STRAIGHT |
| C | 建筑窗片/展示橱窗 | 1 | `src/presentation/history-environments.ts:137` | 需要经验证可分离的生产窗片或新增玻璃窗模块；不把完整外立面塞入薄窗槽。；可复用候选：MAP-C-FACADE-01 |
| C | 大厅展示窗/展品剪影细节 | 1 | `src/presentation/history-environments.ts:138` | 窗片和展示内容需要单独合同；玻璃、展示物与边框不能用整体外立面覆盖。 |
| C | 大厅展示窗/展品剪影细节 | 1 | `src/presentation/history-environments.ts:139` | 窗片和展示内容需要单独合同；玻璃、展示物与边框不能用整体外立面覆盖。 |
| C | 大厅展示窗/展品剪影细节 | 1 | `src/presentation/history-environments.ts:140` | 窗片和展示内容需要单独合同；玻璃、展示物与边框不能用整体外立面覆盖。 |
| B | 倒塌柜体、分离柜门或消防柜 | 1 | `src/presentation/history-environments.ts:148` | 可由 props owner 以生产柜作倒伏摆放；分离门需显式部件合同，不能完整柜叠在门板位置。；可复用候选：PROP-SAMPLE-CABINET |
| B | 倒塌柜体、分离柜门或消防柜 | 1 | `src/presentation/history-environments.ts:150` | 可由 props owner 以生产柜作倒伏摆放；分离门需显式部件合同，不能完整柜叠在门板位置。；可复用候选：PROP-SAMPLE-CABINET |
| B | 倒塌柜体、分离柜门或消防柜 | 1 | `src/presentation/history-environments.ts:152` | 可由 props owner 以生产柜作倒伏摆放；分离门需显式部件合同，不能完整柜叠在门板位置。；可复用候选：PROP-SAMPLE-CABINET |
| C | 短支架/独立细节实体 | 1 | `src/presentation/history-environments.ts:171` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |
| C | 圆形小实体/仪表端盖/瓶（精确源码见该行） | 1 | `src/presentation/history-environments.ts:173` | 当前几何是专用短圆柱，不能因形似圆柱而替成整根工业管。 |
| C | 便当独立盖/食物/随身小物 | 1 | `src/presentation/history-environments.ts:109` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |
| C | 便当独立盖/食物/随身小物 | 1 | `src/presentation/history-environments.ts:110` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |
| C | 便当独立盖/食物/随身小物 | 1 | `src/presentation/history-environments.ts:111` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |
| C | 便当独立盖/食物/随身小物 | 1 | `src/presentation/history-environments.ts:112` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |
| C | 松散床垫/枕头/铺盖 | 1 | `src/presentation/history-environments.ts:122` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TRANSFER |
| C | 松散床垫/枕头/铺盖 | 1 | `src/presentation/history-environments.ts:123` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TRANSFER |
| C | 松散床垫/枕头/铺盖 | 1 | `src/presentation/history-environments.ts:132` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TRANSFER |
| C | 松散床垫/枕头/铺盖 | 1 | `src/presentation/history-environments.ts:133` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TRANSFER |
| C | 便当独立盖/食物/随身小物 | 1 | `src/presentation/history-environments.ts:208` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |
| C | 便当独立盖/食物/随身小物 | 19 | `src/presentation/history-environments.ts:211` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |

### mainhall

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| C | 大厅圆柱的圆形柱脚 | 5 | `src/presentation/history-environments.ts:88` | 已有直管可供柱身；当前无匹配的圆形厚底座，需要源部件衍生或独立基座。；可复用候选：ENV-PIPEKIT-STRAIGHT |
| C | 建筑窗片/展示橱窗 | 1 | `src/presentation/history-environments.ts:137` | 需要经验证可分离的生产窗片或新增玻璃窗模块；不把完整外立面塞入薄窗槽。；可复用候选：MAP-C-FACADE-01 |
| C | 大厅展示窗/展品剪影细节 | 1 | `src/presentation/history-environments.ts:138` | 窗片和展示内容需要单独合同；玻璃、展示物与边框不能用整体外立面覆盖。 |
| C | 大厅展示窗/展品剪影细节 | 1 | `src/presentation/history-environments.ts:139` | 窗片和展示内容需要单独合同；玻璃、展示物与边框不能用整体外立面覆盖。 |
| C | 大厅展示窗/展品剪影细节 | 1 | `src/presentation/history-environments.ts:140` | 窗片和展示内容需要单独合同；玻璃、展示物与边框不能用整体外立面覆盖。 |
| B | 倒塌柜体、分离柜门或消防柜 | 1 | `src/presentation/history-environments.ts:148` | 可由 props owner 以生产柜作倒伏摆放；分离门需显式部件合同，不能完整柜叠在门板位置。；可复用候选：PROP-SAMPLE-CABINET |
| B | 倒塌柜体、分离柜门或消防柜 | 1 | `src/presentation/history-environments.ts:150` | 可由 props owner 以生产柜作倒伏摆放；分离门需显式部件合同，不能完整柜叠在门板位置。；可复用候选：PROP-SAMPLE-CABINET |
| B | 倒塌柜体、分离柜门或消防柜 | 1 | `src/presentation/history-environments.ts:152` | 可由 props owner 以生产柜作倒伏摆放；分离门需显式部件合同，不能完整柜叠在门板位置。；可复用候选：PROP-SAMPLE-CABINET |
| C | 短支架/独立细节实体 | 1 | `src/presentation/history-environments.ts:171` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |
| C | 圆形小实体/仪表端盖/瓶（精确源码见该行） | 1 | `src/presentation/history-environments.ts:173` | 当前几何是专用短圆柱，不能因形似圆柱而替成整根工业管。 |
| C | 便当独立盖/食物/随身小物 | 1 | `src/presentation/history-environments.ts:109` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |
| C | 便当独立盖/食物/随身小物 | 1 | `src/presentation/history-environments.ts:110` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |
| C | 便当独立盖/食物/随身小物 | 1 | `src/presentation/history-environments.ts:111` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |
| C | 便当独立盖/食物/随身小物 | 1 | `src/presentation/history-environments.ts:112` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |
| C | 松散床垫/枕头/铺盖 | 1 | `src/presentation/history-environments.ts:122` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TRANSFER |
| C | 松散床垫/枕头/铺盖 | 1 | `src/presentation/history-environments.ts:123` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TRANSFER |
| C | 松散床垫/枕头/铺盖 | 1 | `src/presentation/history-environments.ts:132` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TRANSFER |
| C | 松散床垫/枕头/铺盖 | 1 | `src/presentation/history-environments.ts:133` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TRANSFER |
| C | 便当独立盖/食物/随身小物 | 1 | `src/presentation/history-environments.ts:208` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |
| C | 便当独立盖/食物/随身小物 | 19 | `src/presentation/history-environments.ts:211` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TOOL-LUNCHBOX |

### frontgate

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| C | 细缆线、管线或枪管（按源码上下文区分） | 1 | `src/presentation/frontgate-environment.ts:86` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| C | 短支架/独立细节实体 | 4 | `src/presentation/frontgate-environment.ts:14` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |
| C | 门式吊机提升机/吊钩独立部件 | 2 | `src/presentation/frontgate-environment.ts:19` | BG-CRANE 含整台吊机，不能拿整台模型替换小吊钩；可研究可分离源部件。；可复用候选：BG-CRANE |
| C | 细缆线、管线或枪管（按源码上下文区分） | 2 | `src/presentation/frontgate-environment.ts:20` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| C | 门式吊机提升机/吊钩独立部件 | 2 | `src/presentation/frontgate-environment.ts:21` | BG-CRANE 含整台吊机，不能拿整台模型替换小吊钩；可研究可分离源部件。；可复用候选：BG-CRANE |
| C | 建筑窗片/展示橱窗 | 1 | `src/presentation/frontgate-environment.ts:125` | 需要经验证可分离的生产窗片或新增玻璃窗模块；不把完整外立面塞入薄窗槽。；可复用候选：MAP-C-FACADE-01 |
| C | 门闸摄像头/警灯外壳 | 1 | `src/presentation/frontgate-environment.ts:158` | 颜色灯光属于信息叠层；实体外壳尚无专用生成模型。 |
| C | 门闸摄像头/警灯外壳 | 1 | `src/presentation/frontgate-environment.ts:160` | 颜色灯光属于信息叠层；实体外壳尚无专用生成模型。 |

### transfer

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| C | 细缆线、管线或枪管（按源码上下文区分） | 1 | `src/presentation/frontgate-environment.ts:86` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| C | 短支架/独立细节实体 | 4 | `src/presentation/frontgate-environment.ts:14` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |
| C | 门式吊机提升机/吊钩独立部件 | 2 | `src/presentation/frontgate-environment.ts:19` | BG-CRANE 含整台吊机，不能拿整台模型替换小吊钩；可研究可分离源部件。；可复用候选：BG-CRANE |
| C | 细缆线、管线或枪管（按源码上下文区分） | 2 | `src/presentation/frontgate-environment.ts:20` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| C | 门式吊机提升机/吊钩独立部件 | 2 | `src/presentation/frontgate-environment.ts:21` | BG-CRANE 含整台吊机，不能拿整台模型替换小吊钩；可研究可分离源部件。；可复用候选：BG-CRANE |
| C | 建筑窗片/展示橱窗 | 1 | `src/presentation/frontgate-environment.ts:125` | 需要经验证可分离的生产窗片或新增玻璃窗模块；不把完整外立面塞入薄窗槽。；可复用候选：MAP-C-FACADE-01 |
| C | 门闸摄像头/警灯外壳 | 1 | `src/presentation/frontgate-environment.ts:158` | 颜色灯光属于信息叠层；实体外壳尚无专用生成模型。 |
| C | 门闸摄像头/警灯外壳 | 1 | `src/presentation/frontgate-environment.ts:160` | 颜色灯光属于信息叠层；实体外壳尚无专用生成模型。 |
| B | 倒塌柜体、分离柜门或消防柜 | 1 | `src/presentation/transfer-environment.ts:41` | 可由 props owner 以生产柜作倒伏摆放；分离门需显式部件合同，不能完整柜叠在门板位置。；可复用候选：PROP-SAMPLE-CABINET |
| C | 短支架/独立细节实体 | 1 | `src/presentation/transfer-environment.ts:43` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |
| C | 短支架/独立细节实体 | 1 | `src/presentation/transfer-environment.ts:45` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:87` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:89` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:90` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:91` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:92` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:102` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:99` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |

### flank

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| C | 细缆线、管线或枪管（按源码上下文区分） | 1 | `src/presentation/frontgate-environment.ts:86` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| C | 短支架/独立细节实体 | 4 | `src/presentation/frontgate-environment.ts:14` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |
| C | 门式吊机提升机/吊钩独立部件 | 2 | `src/presentation/frontgate-environment.ts:19` | BG-CRANE 含整台吊机，不能拿整台模型替换小吊钩；可研究可分离源部件。；可复用候选：BG-CRANE |
| C | 细缆线、管线或枪管（按源码上下文区分） | 2 | `src/presentation/frontgate-environment.ts:20` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| C | 门式吊机提升机/吊钩独立部件 | 2 | `src/presentation/frontgate-environment.ts:21` | BG-CRANE 含整台吊机，不能拿整台模型替换小吊钩；可研究可分离源部件。；可复用候选：BG-CRANE |
| C | 建筑窗片/展示橱窗 | 1 | `src/presentation/frontgate-environment.ts:125` | 需要经验证可分离的生产窗片或新增玻璃窗模块；不把完整外立面塞入薄窗槽。；可复用候选：MAP-C-FACADE-01 |
| C | 门闸摄像头/警灯外壳 | 1 | `src/presentation/frontgate-environment.ts:158` | 颜色灯光属于信息叠层；实体外壳尚无专用生成模型。 |
| C | 门闸摄像头/警灯外壳 | 1 | `src/presentation/frontgate-environment.ts:160` | 颜色灯光属于信息叠层；实体外壳尚无专用生成模型。 |
| B | 倒塌柜体、分离柜门或消防柜 | 1 | `src/presentation/transfer-environment.ts:41` | 可由 props owner 以生产柜作倒伏摆放；分离门需显式部件合同，不能完整柜叠在门板位置。；可复用候选：PROP-SAMPLE-CABINET |
| C | 短支架/独立细节实体 | 1 | `src/presentation/transfer-environment.ts:43` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |
| C | 短支架/独立细节实体 | 1 | `src/presentation/transfer-environment.ts:45` | 当前形状未匹配明确生产模块；保留确切代码与位置供后续用途裁决，不自动猜素材。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:87` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:89` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:90` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:91` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:92` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:102` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |
| C | 建筑窗片/展示橱窗 | 1 | `src/presentation/flank-environment.ts:71` | 需要经验证可分离的生产窗片或新增玻璃窗模块；不把完整外立面塞入薄窗槽。；可复用候选：MAP-C-FACADE-01 |
| B | 基座或散落混凝土块 | 2 | `src/presentation/flank-environment.ts:75` | 可按明确用途复用生产板/护墩，但需要单独定义碎块与基座的放置边界。；可复用候选：ARCH-FLOOR-METAL, ARCH-COVER-CONCRETE |
| C | 水槽、龙头、纱布/瓶体等护理专用件 | 1 | `src/presentation/transfer-environment.ts:99` | 当前无匹配的独立水槽/龙头/绷带/瓶体源；不以医疗包或整台转运床替代。 |

### escort

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| B | 桥栏顶部警示盖条 | 6 | `src/presentation/escort-environment.ts:26` | 主体栏杆已生成，可进一步随其目标原子移除盖条，或单独生产警示栏盖条。；可复用候选：ENV-WALLKIT-PANEL, ARCH-WALL-PAINT |
| C | 港岸平冰板 | 2 | `src/presentation/escort-environment.ts:53` | 样本应归道具（不能误改成工业直管）；平冰板不能把高冰岸模型强压平。需要独立源或经目检的源网格衍生。；可复用候选：PROP-MATERIAL-TUBE, MAP-C-ICEBANK-01 |
| D | 监视器显示面 | 1 | `src/presentation/escort-environment.ts:84` | 显示平面由 monitor renderer 提供实时信息；面本身可以保留，框与桌架分别归结构。 |
| C | 细缆线、管线或枪管（按源码上下文区分） | 2 | `src/presentation/escort-environment.ts:169` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| C | 吊钩配重/钩头 | 2 | `src/presentation/escort-environment.ts:170` | 需要 BG-CRANE 可验证的独立部件或专用小模块，当前不猜测提取。；可复用候选：BG-CRANE |
| B | 换垫托台 | 1 | `src/presentation/escort-environment.ts:193` | 可明确由生产地板板面+钢梁腿组合，当前保守交道具 owner 处理与患者靠位。；可复用候选：ARCH-FLOOR-METAL, ARCH-BEAM-STEEL |
| C | 松散床垫/枕头/铺盖 | 1 | `src/presentation/escort-environment.ts:195` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TRANSFER |
| C | 松散床垫/枕头/铺盖 | 1 | `src/presentation/escort-environment.ts:196` | 完整便当盒或转运床不等于可分开的盖、食物、软垫；需独立部件生产或经验证的源部件提取。；可复用候选：PROP-TRANSFER |

### relief

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| C | 细缆线、管线或枪管（按源码上下文区分） | 1 | `src/presentation/relief-environment.ts:39` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| C | 圆形小实体/仪表端盖/瓶（精确源码见该行） | 1 | `src/presentation/relief-environment.ts:92` | 当前几何是专用短圆柱，不能因形似圆柱而替成整根工业管。 |

### rescue

本次 PortKit 架构扫描无剩余项；其他系统仍应独立核查。

### medical

| 类别 | 实体 | 数量 | 来源 | 后续 |
|---|---|---:|---|---|
| C | 输液架、液袋/软管或帘杆 | 2 | `src/presentation/medical-environment.ts:73` | 生产轮廓需包含细杆、液袋与软管各独立用途；当前不以工业粗管替换。 |
| C | 输液架、液袋/软管或帘杆 | 2 | `src/presentation/medical-environment.ts:74` | 生产轮廓需包含细杆、液袋与软管各独立用途；当前不以工业粗管替换。 |
| C | 细缆线、管线或枪管（按源码上下文区分） | 2 | `src/presentation/medical-environment.ts:75` | 吊机绳索/IV 软管无独立生产模块；细杆若属武器需交给 AK 挂接 owner，不能用粗工业管填充。 |
| C | 输液架、液袋/软管或帘杆 | 1 | `src/presentation/medical-environment.ts:85` | 生产轮廓需包含细杆、液袋与软管各独立用途；当前不以工业粗管替换。 |

### epilogue

本次 PortKit 架构扫描无剩余项；其他系统仍应独立核查。

## 文件与验证

运行改动：`port-kit.ts`、`architecture-bindings.ts`、`GeneratedArchitecture.ts`、新增 `architecture-auto-bindings.ts`。保留现有 `ArchitectureTransactions.ts` 的资源、原子性和 LOD 实现；`architecture-placement-plan.ts` 中旧 S05/S11 静态计划不再被运行 binder 使用，只复用实测 source profile/catalog。

测试：新增 `tests/architecture-coverage.test.ts` 与原始碰撞 SHA fixture；更新 `tests/architecture-integration.test.ts` 为所有 15 场景；联合 `architecture-transactions.test.ts`、`generated-scene-assets.test.ts`，最终 51 项通过。最终 51 项相关测试与全项目 tsc --noEmit 均通过。此次交付后源代码冻结，后续全套/build 由根代理统一执行。

复现：绝对 Node `/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin/node`，运行上述四个 Vitest 文件；运行 `artifacts/asset-coverage-fix-20261031/collect-architecture-remaining.mjs` 刷新逐实例来源。该收集脚本只在当前 Node 进程临时包裹 PortKit.part 采集 source-mapped 调用栈，不改运行源文件。

关键限制：装配 fit 是包围尺寸合同，源模型的门洞、碰撞、导航、开口不可由 AI 模型自动保证；这些继续由旧模拟实体决定。均匀缩放的 tank 源形状较矮宽，可能不能填满原高瘦碰撞体；灯杆横臂也须实机看齐。性能、贴图方向和视觉穿插等待根代理离线图像审查及以后获得浏览器权限的实机验收。
