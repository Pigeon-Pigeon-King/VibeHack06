# 全场景地图生产资产覆盖审计

审计主线 `a9030c684655b2d3f35082125055f0e7c84ac2da`。仅审计，未改运行代码/资源，未调用生产API、未运行UI。

结论：S04截图中的白盒有明确代码根因。PortKit仍默认画primitive，生成资源只覆盖显式选择的少数场景/实例；把catalog全量已准备等同全关卡已替换是不成立的。

A = 本轮实机确认对应实例已替换（本轮未核验）；B = 已生产但未绑定、部分绑定、仅新增，或加载/校验失败保留旧物；C = 缺对应生产构件或专用机械分件合同；D = 纯信息叠层/不可见碰撞。下面“替换组”是成功加载后的代码路径证据，不冒充A。

## 实际构造与选择器核对

通过Node/Vite SSR构造全部15个ScenarioId，运行真实bindArchitecture；没有网络、GLB解码或WebGL。全部声明目标的数量校验通过，道具slot均存在，catalog全部运行路径文件存在。数量只代表可核实绑定/placement，不是物体数量、屏幕占比或生成成功率。

| 场景 | 架构替换组 | 旧primitive目标 | 架构新增组 | 架构placement数 | 道具替换slot数 | 道具placement数 |
|---|---:|---:|---:|---:|---:|---:|
| S01 / childhood | 0 | 0 | 1 | 1 | 0 | 0 |
| S02 / mainhall | 0 | 0 | 1 | 1 | 0 | 0 |
| S03 / nightshift | 0 | 0 | 0 | 0 | 0 | 0 |
| S04 / workers | 0 | 0 | 0 | 0 | 0 | 0 |
| S05 / frontgate | 17 | 434 | 4 | 1779 | 3 | 16 |
| S06 / transfer | 17 | 434 | 5 | 1780 | 3 | 16 |
| S07 / flank | 17 | 434 | 5 | 1780 | 3 | 16 |
| S08 / escort | 0 | 0 | 2 | 72 | 0 | 0 |
| S09 / relief | 0 | 0 | 0 | 0 | 0 | 0 |
| S10 / rescue | 0 | 0 | 0 | 0 | 0 | 0 |
| S11 / medical | 3 | 12 | 0 | 650 | 3 | 16 |
| S12 / epilogue | 1 | 1 | 1 | 2 | 1 | 1 |
| legacy-prologue / prologue | 0 | 0 | 0 | 0 | 0 | 0 |
| legacy-northgate / northgate | 0 | 0 | 0 | 0 | 0 | 0 |
| legacy-handover / handover | 0 | 0 | 0 | 0 | 0 | 0 |

同一S05基底被S06/S07重建，不能把三次计数相加当三个独立资产族。S08的72个placement=60桥下模块+12桥墩；旧桥面/桁架/栏杆没有一个因此隐藏。

## 共同根因与生命周期

- S04 workers 没有任何 GeneratedArchitecture/GeneratedSceneAssets 绑定；车辆、围墙、仓房、路障仍由primitive构造，现象由代码直接解释。不是catalog里模型少一个名字。（src/presentation/chapter-environments.ts:310, src/presentation/architecture-bindings.ts:106, src/assets/scene-asset-catalog.ts:836）
- PortKit不是自动替换器。workshop/container/cover/tank/tractor/terminal/light每次调用仍画primitive；仅visualSlot或明确旧instance选择器可替换。（src/presentation/port-kit.ts:49, src/presentation/port-kit.ts:138, src/presentation/port-kit.ts:166, src/presentation/port-kit.ts:184, src/presentation/port-kit.ts:196, src/presentation/port-kit.ts:217, src/presentation/port-kit.ts:230）
- 生产完成、资源存在、placement新增、旧物体被隐藏、实际可见是不同状态。所有94条catalog runtime记录文件存在；此次未解码/渲染，不能证明A。（src/assets/scene-asset-catalog.ts:761, src/presentation/architecture-bindings.ts:113）
- S01/S02拱冠、S08桥下模块/桥墩、S05远立面/吊机/岗亭/弯管、S06/S07廊道、S12远船均targets=[]，成功也不隐藏原环境。（src/presentation/architecture-bindings.ts:113, src/presentation/architecture-bindings.ts:128, src/presentation/architecture-bindings.ts:137, src/presentation/architecture-bindings.ts:150）
- 当前架构LOD只在生成几何层间切换，远距不会重新显示whitebox。旧placement-plan里far-whitebox待办是历史文字，不能当当前行为。primitive来源主要是未绑定或加载失败。（src/presentation/ArchitectureTransactions.ts:307, src/presentation/architecture-placement-plan.ts:152）
- GeneratedSceneAssets整slot Promise.allSettled成功才隐藏slot；失败/缺slot/Box3不匹配保留旧物。ArchitectureTransactions全目标/全部LOD准备好才原子隐藏指定instances；错误恢复。关卡ready允许degraded完成，不能等同素材全成功。（src/presentation/GeneratedSceneAssets.ts:86, src/presentation/GeneratedSceneAssets.ts:113, src/presentation/ArchitectureTransactions.ts:272, src/chapter-transition/PreparedGameLevel.ts:146）
- 所有场景还有程序化Jupiter球与DataTexture；这是真实可见天空，不是D信息层。若最新“全部可见地图实体必须Tripo/Hyper”字面包括天体，需要明确天空处理；不能悄悄算已覆盖。（src/presentation/environment.ts:21, src/presentation/environment.ts:206）
- GeneratedSceneAssets background foundation本身新建BoxGeometry，当前四处front背景基础仍是primitive；road实体路面、窗框、灯杆、屏幕机壳同样不能因无碰撞就归D。（src/presentation/GeneratedSceneAssets.ts:147, src/assets/scene-asset-catalog.ts:766, src/assets/scene-asset-catalog.ts:787）

实际触发：main.ts:195/225 → PreparedGameLevel.ts:54构造environment → :58/:66启动两生成owner；main.ts:571更新架构LOD。GeneratedArchitecture按scene绑定且限制两并发组；GeneratedSceneAssets按slot原子替换。异步失败不会阻止降级关卡进入，UI仅提示部分素材保留临时模型。

## 逐场景实体核对

### S01 / childhood

只新增高处MAP-A-ARCH-01拱冠，原主厅/下层空间未替换。

入口：`src/presentation/history-environments.ts:46`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- 主/下层地面、围墙、基础、主厅外壳/门楣、柱梁和管道
- 可移动屋顶分片、楼梯/平台/下层走廊屋面和栏杆
- 长椅、置物堆、消防柜、倒柜/脱门、展示屏实体边框
- 床垫/直立床垫、饭盒/散落饭粒、掉落枪、坍塌碎块/梁等随事实显隐的实体

**C：不能靠同名catalog冒充解决的专用缺口**

- 专用可倒塌/断裂屋面与碎片
- 维护滑门/下层隔断及可动分件
- 栏杆/楼梯踏步/消防柜/动态布物等专用资产或批准模块装配

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/history-environments.ts:25`, `src/presentation/history-environments.ts:35`, `src/presentation/history-environments.ts:46`, `src/presentation/architecture-bindings.ts:128`。

架构绑定逐组（完整实例/placement结构见maps.json）：

- `S01-S02-entry-arch-crown`：addition；旧目标 0；新placement 1；MAP-A-ARCH-01。

D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S02 / mainhall

与S01共用完整环境；坍塌、隔断、物件移动不是生成模型动作。

入口：`src/presentation/history-environments.ts:46`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- 同S01全部厅室结构；未新增任何旧实例替换
- 事实驱动屋面坍塌、瓦砾、门/隔断、床垫和饭盒显隐均primitive

**C：不能靠同名catalog冒充解决的专用缺口**

- 与S01同一可动/断裂构件缺口

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/history-environments.ts:46`, `src/presentation/OpeningView.ts:9`, `src/presentation/architecture-bindings.ts:128`。

架构绑定逐组（完整实例/placement结构见maps.json）：

- `S01-S02-entry-arch-crown`：addition；旧目标 0；新placement 1；MAP-A-ARCH-01。

D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S03 / nightshift

0建筑绑定，0生成摆放。

入口：`src/presentation/chapter-environments.ts:92`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- 地面/边界、四个房间的墙/顶/门楣、走廊梁/灯/长管
- 风机壳体、叶片转子和卡阻物；储罐和工具台/工具
- 供给架、取送箱、交付桌、护理柜、空转运床
- 港区地图板、样品台/芯样、武器架和出口门框

**C：不能靠同名catalog冒充解决的专用缺口**

- 交互风机可动叶轮/阻塞物分件
- 空床/架柜/门框及实物地图板分件

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/chapter-environments.ts:20`, `src/presentation/chapter-environments.ts:29`, `src/presentation/chapter-environments.ts:65`, `src/presentation/chapter-environments.ts:92`。


D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S04 / workers

0建筑绑定，0生成摆放。截图车辆/围墙/仓房/路障保持primitive符合当前代码。

入口：`src/presentation/chapter-environments.ts:310`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- 主地面与边界、街道灯杆、冰锥/远建筑/吊机
- 所有workshop仓房的箱体/屋面/门窗/通风机
- militaryTruck军用卡车、transferBus通勤巴士；未绑定PROP-VEH-TRANSPORT
- 各处cover路障、储罐、长管、三终端机壳
- 横墙与滑门/门框、运输分隔墙、上下楼梯/天桥/栏杆/支腿
- 院区顶棚/柱、玻璃温室/弧顶

**C：不能靠同名catalog冒充解决的专用缺口**

- 卡车与巴士的各自正确外形/尺寸或专用ID；不得把运输车自动视为两者都覆盖
- 可动滑门分件、温室透明板/弧顶、楼梯/栏杆组件

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/chapter-environments.ts:184`, `src/presentation/chapter-environments.ts:215`, `src/presentation/chapter-environments.ts:233`, `src/presentation/chapter-environments.ts:247`, `src/presentation/chapter-environments.ts:288`, `src/presentation/chapter-environments.ts:310`。


D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S05 / frontgate

17架构替换组匹配434个primitive目标；另4架构组仅添加。3道具slot成功后替换。

入口：`src/presentation/frontgate-environment.ts:90`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- 六仓房只替换主体+平顶；卷门、九道门条、窗玻璃/框、屋顶通风箱/格栅仍在
- 大门底座/斜撑/起吊缆绳/执行器、称重板/岗亭窗、作业道路
- 后路线弧顶棚/柱、零件架、小储罐(-48,-32)、墙帽/钢肋
- 8盏原灯只绑定北侧1盏；其余原灯仍在，新增远灯不代替它们
- 原吊机仍在；远建筑只替换最前3座主体/顶/烟囱，剩余5座仍原体，3张新增立面不隐藏它们
- 过滤机组slot外地基、4处新背景foundation仍primitive

**C：不能靠同名catalog冒充解决的专用缺口**

- 专用卷门/门窗/通风设备、吊机小附件/大门执行器分件
- 弧形棚、栏杆及称重设备不能仅靠平板宣称完整替换

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/frontgate-environment.ts:11`, `src/presentation/frontgate-environment.ts:25`, `src/presentation/frontgate-environment.ts:38`, `src/presentation/frontgate-environment.ts:71`, `src/presentation/port-kit.ts:166`, `src/presentation/architecture-bindings.ts:61`。

架构绑定逐组（完整实例/placement结构见maps.json）：

- `S05-ground`：replacement；旧目标 1；新placement 999；ARCH-FLOOR-METAL。
- `S05-boundaries`：replacement；旧目标 4；新placement 82；ENV-WALLKIT-PANEL。
- `S05-worker-screens`：replacement；旧目标 2；新placement 100；ARCH-WALL-PAINT。
- `S05-workshop-repair`：replacement；旧目标 2；新placement 60；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-north-west`：replacement；旧目标 2；新placement 52；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-north-east`：replacement；旧目标 2；新placement 72；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-east-long`：replacement；旧目标 2；新placement 138；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-weigh-booth-building`：replacement；旧目标 2；新placement 52；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-rear-building`：replacement；旧目标 2；新placement 66；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-main-gate-structure`：replacement；旧目标 9；新placement 67；ARCH-BEAM-STEEL。
- `S05-pipelines`：replacement；旧目标 2；新placement 46；ENV-PIPEKIT-STRAIGHT。
- `S05-ice-silhouette`：replacement；旧目标 11；新placement 11；MAP-C-ICEBANK-01。
- `S05-far-heat-trio`：replacement；旧目标 9；新placement 3；BG-HEAT。
- `S05-freight-containers`：replacement；旧目标 180；新placement 4；ARCH-CARGO-CONTAINER。
- `S05-cover`：replacement；旧目标 178；新placement 19；ARCH-COVER-CONCRETE。
- `S05-far-facades`：addition；旧目标 0；新placement 3；MAP-C-FACADE-01。
- `S05-pipe-return-elbow`：addition；旧目标 0；新placement 1；ENV-PIPEKIT-ELBOW。
- `S05-external-inspection-booth`：addition；旧目标 0；新placement 1；PROP-BOOTH。
- `S05-secondary-tank`：replacement；旧目标 23；新placement 1；PROP-TANK。
- `S05-north-lamp`：replacement；旧目标 3；新placement 1；ENV-LIGHTKIT-POLE。
- `S05-dock-crane`：addition；旧目标 0；新placement 1；BG-CRANE。

整组道具fallback slots：`front-tug`, `front-filter-machinery`, `front-east-tank`。其它catalog placements没有slot，只是新增。

D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S06 / transfer

继承S05替换范围；新增外侧MAP-B-CORRIDOR不替换任务转接门。

入口：`src/presentation/transfer-environment.ts:13`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- S05所有遗留项
- 东隔墙/门楣/可动卷门、弧形候车棚/支腿/斜撑
- 控制柜/基座/铰接盖/拉杆、D02房间墙顶/门廊/柱
- 管线、换热器、电池架、水槽/水龙头/急救盒/绷带
- 水瓶/杯/无线电/桌、外终端、工具桌/工具

**C：不能靠同名catalog冒充解决的专用缺口**

- 卷门、机柜盖/拉杆等可动分件
- 水槽/龙头/急救盒与设备间专用结构

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/transfer-environment.ts:13`, `src/presentation/architecture-bindings.ts:133`。

架构绑定逐组（完整实例/placement结构见maps.json）：

- `S05-ground`：replacement；旧目标 1；新placement 999；ARCH-FLOOR-METAL。
- `S05-boundaries`：replacement；旧目标 4；新placement 82；ENV-WALLKIT-PANEL。
- `S05-worker-screens`：replacement；旧目标 2；新placement 100；ARCH-WALL-PAINT。
- `S05-workshop-repair`：replacement；旧目标 2；新placement 60；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-north-west`：replacement；旧目标 2；新placement 52；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-north-east`：replacement；旧目标 2；新placement 72；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-east-long`：replacement；旧目标 2；新placement 138；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-weigh-booth-building`：replacement；旧目标 2；新placement 52；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-rear-building`：replacement；旧目标 2；新placement 66；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-main-gate-structure`：replacement；旧目标 9；新placement 67；ARCH-BEAM-STEEL。
- `S05-pipelines`：replacement；旧目标 2；新placement 46；ENV-PIPEKIT-STRAIGHT。
- `S05-ice-silhouette`：replacement；旧目标 11；新placement 11；MAP-C-ICEBANK-01。
- `S05-far-heat-trio`：replacement；旧目标 9；新placement 3；BG-HEAT。
- `S05-freight-containers`：replacement；旧目标 180；新placement 4；ARCH-CARGO-CONTAINER。
- `S05-cover`：replacement；旧目标 178；新placement 19；ARCH-COVER-CONCRETE。
- `S05-far-facades`：addition；旧目标 0；新placement 3；MAP-C-FACADE-01。
- `S05-pipe-return-elbow`：addition；旧目标 0；新placement 1；ENV-PIPEKIT-ELBOW。
- `S05-external-inspection-booth`：addition；旧目标 0；新placement 1；PROP-BOOTH。
- `S05-secondary-tank`：replacement；旧目标 23；新placement 1；PROP-TANK。
- `S05-north-lamp`：replacement；旧目标 3；新placement 1；ENV-LIGHTKIT-POLE。
- `S05-dock-crane`：addition；旧目标 0；新placement 1；BG-CRANE。
- `S06-S07-cargo-corridor`：addition；旧目标 0；新placement 1；MAP-B-CORRIDOR-01。

整组道具fallback slots：`front-tug`, `front-filter-machinery`, `front-east-tank`。其它catalog placements没有slot，只是新增。

D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S07 / flank

继承S05/S06范围；新增侧翼设施无独立生成替换。

入口：`src/presentation/flank-environment.ts:124`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- S05/S06所有遗留项
- 高架维修平台/腿/撑、上下阶梯、栏杆与高处cover
- 泵房箱体/门窗/屋面、横竖管/基础与额外cover
- 旧换热机、长掩体、绕行阶梯/小平台/支腿/栏杆/管槽双管

**C：不能靠同名catalog冒充解决的专用缺口**

- 楼梯/栏杆/管槽/换热器与专用平台模块

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/flank-environment.ts:31`, `src/presentation/flank-environment.ts:66`, `src/presentation/flank-environment.ts:84`。

架构绑定逐组（完整实例/placement结构见maps.json）：

- `S05-ground`：replacement；旧目标 1；新placement 999；ARCH-FLOOR-METAL。
- `S05-boundaries`：replacement；旧目标 4；新placement 82；ENV-WALLKIT-PANEL。
- `S05-worker-screens`：replacement；旧目标 2；新placement 100；ARCH-WALL-PAINT。
- `S05-workshop-repair`：replacement；旧目标 2；新placement 60；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-north-west`：replacement；旧目标 2；新placement 52；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-north-east`：replacement；旧目标 2；新placement 72；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-east-long`：replacement；旧目标 2；新placement 138；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-weigh-booth-building`：replacement；旧目标 2；新placement 52；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-workshop-rear-building`：replacement；旧目标 2；新placement 66；ARCH-WALL-PAINT, ARCH-ROOF-METAL。
- `S05-main-gate-structure`：replacement；旧目标 9；新placement 67；ARCH-BEAM-STEEL。
- `S05-pipelines`：replacement；旧目标 2；新placement 46；ENV-PIPEKIT-STRAIGHT。
- `S05-ice-silhouette`：replacement；旧目标 11；新placement 11；MAP-C-ICEBANK-01。
- `S05-far-heat-trio`：replacement；旧目标 9；新placement 3；BG-HEAT。
- `S05-freight-containers`：replacement；旧目标 180；新placement 4；ARCH-CARGO-CONTAINER。
- `S05-cover`：replacement；旧目标 178；新placement 19；ARCH-COVER-CONCRETE。
- `S05-far-facades`：addition；旧目标 0；新placement 3；MAP-C-FACADE-01。
- `S05-pipe-return-elbow`：addition；旧目标 0；新placement 1；ENV-PIPEKIT-ELBOW。
- `S05-external-inspection-booth`：addition；旧目标 0；新placement 1；PROP-BOOTH。
- `S05-secondary-tank`：replacement；旧目标 23；新placement 1；PROP-TANK。
- `S05-north-lamp`：replacement；旧目标 3；新placement 1；ENV-LIGHTKIT-POLE。
- `S05-dock-crane`：addition；旧目标 0；新placement 1；BG-CRANE。
- `S06-S07-cargo-corridor`：addition；旧目标 0；新placement 1；MAP-B-CORRIDOR-01。

整组道具fallback slots：`front-tug`, `front-filter-machinery`, `front-east-tank`。其它catalog placements没有slot，只是新增。

D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S08 / escort

60桥下deck+12piers均新增，0旧primitive隐藏；原桥通行面/栏杆/桁架仍在。

入口：`src/presentation/escort-environment.ts:193`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- 三岸地形、边界护栏、冰沟冰片/锥体/管、路灯和远建筑/烟囱
- 原三座桥的桥面、栏杆、桥墩、桁架
- 接待室墙/平顶/弧顶、终端/监控桌/机壳、电池/长椅/装卸门
- 折线屏墙/压顶、双顶棚/立柱、高台/阶梯/栏杆/cover
- 工业区所有仓房/货柜/牵引车/罐/掩体/吊机/弹药箱
- 医疗站屋面/墙/柱、柜/长椅/换药盘/条件枕头

**C：不能靠同名catalog冒充解决的专用缺口**

- 桥面以上栏杆/桁架/伸缩连接专用组件
- 装卸门/弧顶/医疗站小型结构

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/escort-environment.ts:17`, `src/presentation/escort-environment.ts:35`, `src/presentation/escort-environment.ts:67`, `src/presentation/escort-environment.ts:98`, `src/presentation/escort-environment.ts:121`, `src/presentation/escort-environment.ts:144`, `src/presentation/escort-environment.ts:172`, `src/presentation/architecture-bindings.ts:137`。

架构绑定逐组（完整实例/placement结构见maps.json）：

- `S08-bridge-subdecks`：addition；旧目标 0；新placement 60；ENV-BRIDGEKIT-DECK。
- `S08-bridge-piers`：addition；旧目标 0；新placement 12；MAP-E-PIER-01。

D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S09 / relief

0建筑绑定，0生成摆放。

入口：`src/presentation/relief-environment.ts:104`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- 院区地面/边界/大门/柱/灯杆、远建筑/烟囱/冰
- 仓房、储罐、牵引车、货柜、吊机
- 屏墙/横路障/掩体、顶棚/柱
- 休息室墙/平顶/弧顶、长椅/靠背、水桌/无线电桌/瓶杯/无线电、衣柜/管道和条件背带

**C：不能靠同名catalog冒充解决的专用缺口**

- 弧顶/座椅靠背/物件可动分件

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/relief-environment.ts:10`, `src/presentation/relief-environment.ts:40`, `src/presentation/relief-environment.ts:52`, `src/presentation/relief-environment.ts:71`。


D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S10 / rescue

0建筑绑定，0生成摆放。

入口：`src/presentation/rescue-environment.ts:24`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- 大地面、围墙、全路线workshop/储罐/货柜/掩体
- 机器硬掩体+顶、平台、弹药箱
- 黑色实体路面、接运弧棚/柱、路线和站点灯杆

**C：不能靠同名catalog冒充解决的专用缺口**

- 机器掩体/接运弧棚专用几何；人物推车/车辆由actor审计单独确认

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/rescue-environment.ts:9`, `src/presentation/rescue-environment.ts:24`。


D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S11 / medical

地面+10墙体/门楣+平顶12primitive目标匹配；三道具slot整组替换。

入口：`src/presentation/medical-environment.ts:17`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- 巨幅弧形vault仍在平顶上方；未被S11-ceiling选择
- 桌/屏幕机壳、西柜、供给箱、长椅背板
- 原水台杯仍在；生成mug是旁置新杯，catalog明说clear of existing vessel
- 输液架/袋/管、可伸缩门帘/导轨、门框等

**C：不能靠同名catalog冒充解决的专用缺口**

- 医疗帘与滑轨可动分件、输液系统/医疗台柜
- 不能用整张医务场景GLB代替可达内部空间

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/medical-environment.ts:17`, `src/presentation/architecture-bindings.ts:78`, `src/assets/scene-asset-catalog.ts:798`。

架构绑定逐组（完整实例/placement结构见maps.json）：

- `S11-ground`：replacement；旧目标 1；新placement 143；ARCH-FLOOR-METAL。
- `S11-walls`：replacement；旧目标 10；新placement 417；ARCH-WALL-PAINT。
- `S11-ceiling`：replacement；旧目标 1；新placement 90；ARCH-ROOF-METAL。

整组道具fallback slots：`medical-sample-cabinets`, `medical-spare-trolley`, `medical-rest-bench`。其它catalog placements没有slot，只是新增。

D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### S12 / epilogue

仅接收仓房1块平屋面替换，另远船新增；reception-console slot整组替换。

入口：`src/presentation/epilogue-environment.ts:21`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- 地面/边界、各仓房主体门窗/其余屋顶、储罐
- 报告/需求桌和机壳、道路、路灯
- 接待室墙/柱/门楣/平顶+弧顶、活动接收门
- 泊位实体灯杆；非发光颜色本身
- 条件触发的两架AIR-VTOL-F35B-REUSED来自本地代码资产工厂，非Tripo/Hyper生产模型

**C：不能靠同名catalog冒充解决的专用缺口**

- 活动接收门及接待室弧顶等专用构件
- 若用户新规则覆盖所有飞行可见实体，F35B需规则裁决或对应生产资产

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/epilogue-environment.ts:21`, `src/presentation/architecture-bindings.ts:150`, `src/presentation/DeferredAirCover.ts:31`, `src/presentation/EpilogueAirCover.ts:25`, `src/presentation/reused-aircraft.ts:31`。

架构绑定逐组（完整实例/placement结构见maps.json）：

- `S12-receiving-warehouse-roof`：replacement；旧目标 1；新placement 1；MAP-F-ROOF-01。
- `S12-offshore-receiving-ship`：addition；旧目标 0；新placement 1；BG-SHIP。

整组道具fallback slots：`epilogue-reception-console`。其它catalog placements没有slot，只是新增。

D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### legacy-prologue / prologue

可由ScenarioId构造的旧场景；0生成绑定。

入口：`src/presentation/environment.ts:121`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- siteBase全部地面/边界/铁丝围栏/灯/远楼/冰
- 大厅墙/柱/弧顶/肋/门框、集装箱/掩体/仓房、瓦砾

**C：不能靠同名catalog冒充解决的专用缺口**

- 弧顶/围栏/瓦砾分件

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/environment.ts:46`, `src/presentation/environment.ts:121`。


D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### legacy-northgate / northgate

与frontgate不同ScenarioId；0生成绑定，不能把S05结果套到此旧场景。

入口：`src/presentation/environment.ts:84`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- siteBase全部地面/边界/铁丝围栏/灯/远楼/冰
- 仓房/集装箱/罐/牵引车、大门结构/称重板/掩体/终端/实物牌板/管线支架

**C：不能靠同名catalog冒充解决的专用缺口**

- 围栏/大门机械/称重设备专用分件

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/environment.ts:46`, `src/presentation/environment.ts:84`。


D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

### legacy-handover / handover

0生成绑定。

入口：`src/presentation/environment.ts:154`。置信度：代码绑定高；本次未验证屏幕可见。

**B：仍未替换的可见实体族**

- siteBase全部地面/边界/铁丝围栏/灯/远楼/冰
- 仓房/货柜/牵引车/储罐/掩体/终端
- 医疗棚墙/弧顶/柱/柜

**C：不能靠同名catalog冒充解决的专用缺口**

- 围栏/医疗棚弧形结构

可复用方向：地/墙/顶/钢梁用ARCH-FLOOR-METAL / ARCH-WALL-PAINT / ARCH-ROOF-METAL / ARCH-BEAM-STEEL；集装箱用ARCH-CARGO-CONTAINER；路障用ARCH-COVER-CONCRETE；管线/灯/罐/冰/远楼使用对应ENV/PROP/MAP/BG模块。均需按实物包围盒、轴向和实际走廊尺寸装配，不是所有family都能用同一模型。物件详查由道具审计补齐。

证据：`src/presentation/environment.ts:46`, `src/presentation/environment.ts:154`。


D：不可见碰撞、文字与提示色可以保留；桌面/终端壳、路面、窗/门、灯杆、支架、牌板及背景foundation均是物体，不归D。

## 审计边界、已读文件与SHA

以下文件逐行完整读取；SHA为审计时文件内容。catalog部分重复记录通过实际模块加载/路径存在性核验，不声称人工完整逐行读完。

- `src/presentation/environment.ts`（239行），SHA256 `1e1fcacbd3266c56781f4d89281222b0f537e2182c529b57277c20a711cc00aa`
- `src/presentation/port-kit.ts`（270行），SHA256 `376fad70765f5deb83508f8e1790a2ae460746549e2bafdcb79e815b7f016d72`
- `src/presentation/GeneratedArchitecture.ts`（69行），SHA256 `5f7893b44bfdbe6f5896b704c97c477c28df9cc99ed84672287f280e344619d4`
- `src/presentation/ArchitectureTransactions.ts`（367行），SHA256 `a9a4fe0e099c3ca42bd24f4383a706a38855c0e7d23205c0366ecb3964f95da4`
- `src/presentation/architecture-bindings.ts`（155行），SHA256 `0d27cad039a0809c3d0b48be7c64357486e22adef9ef496490dc6f68bcbce26b`
- `src/presentation/architecture-placement-plan.ts`（176行），SHA256 `46ca91546be17585f351b269ffe53b0aabdbe1312d939a648ada4b6b3b4b1702`
- `src/presentation/GeneratedSceneAssets.ts`（178行），SHA256 `ac95b900b57db7a31f660572c0f5ef90c8e54bee08badef4042f86d0af4ea74a`
- `src/presentation/chapter-environments.ts`（388行），SHA256 `ab18ae1a0d171397e84df665bd73227b6f3aecfdf4e65b57c3d597069fb3ca6f`
- `src/presentation/history-environments.ts`（242行），SHA256 `33e1be218aacefb0f8a1781a517b5a8fcb72b33c2baa626cedf6c1a53f793ad6`
- `src/presentation/frontgate-environment.ts`（187行），SHA256 `4c1406764928e6debce8c29ea9cc99406eef72e525ffe8bbde2362c08035b0df`
- `src/presentation/transfer-environment.ts`（119行），SHA256 `0108ca36e6087ec058c34de02ccb933cd002085c05ab9b7584085da8c3a0bc89`
- `src/presentation/flank-environment.ts`（153行），SHA256 `deb6f4da42c716a2aa1924c2d2fbef835b9eb35bb5dcd1532e41a2ccd7defa74`
- `src/presentation/escort-environment.ts`（213行），SHA256 `04608328cc139c5a1c1909151bc84f9ed165b05b91743ab5035a0bd4328f1f16`
- `src/presentation/relief-environment.ts`（120行），SHA256 `b5eb8851d98e1138cf71e5b783dcbde927a8f82c73fd7b32a663478e405386c8`
- `src/presentation/rescue-environment.ts`（78行），SHA256 `b3758eb88a2611603e261a481d314c3d50d65548c965a3892e92a511c559503d`
- `src/presentation/medical-environment.ts`（92行），SHA256 `1aea2e05560dcb16ed34afb28bc342896e39d3fbb73b4ff028980a33cd9cbe6c`
- `src/presentation/epilogue-environment.ts`（82行），SHA256 `f9f69262e079e95a3d54ec0c4311f6fe579f3458a1d87c37bfa422c0e03177b7`
- `src/presentation/DeferredAirCover.ts`（92行），SHA256 `66299d08e1666e61cb27e7dab8b73b81695877a307ca9259d790386573ab23ea`
- `src/presentation/EpilogueAirCover.ts`（104行），SHA256 `9bcda4c5c19d94b72bc75a4cd22352305eab9fa474250f7d0a7825d8939c0c52`
- `src/presentation/OpeningView.ts`（36行），SHA256 `26ff1a9e2dc25f69c8e8c2564db89de6f7ab4bc11f76b3a92367758517af6eb1`
- `src/presentation/reused-aircraft.ts`（78行），SHA256 `3160547dcaffcf99578d8dfda58ee2786166d3854aa161ba34cd3b3c760181a7`
- `src/chapter-transition/PreparedGameLevel.ts`（219行），SHA256 `f14287926438078d57d7ff36072c00509c70f12c6e227bbae87466d12e6a7933`

部分读取：

- `src/assets/scene-asset-catalog.ts`，SHA256 `aafcc3c8b0f9991736aef1b1cb268db7ae1fb77979f8e91ca4f2f8ac49bd5165`：All placement functions and source-record schema read; all catalog records loaded in SSR and public paths existence checked. Large source record middle not line-by-line read.
- `src/assets/architecture-catalog.ts`，SHA256 `f79168de201474f2d4987ed5c079245b2cfcc45c4b13b7bce4585081fb8f57ea`：Source schema/resolver read; every record loaded in SSR and public path existence checked; repeated source records not line-by-line read.
- `src/contracts.ts`，SHA256 `d56ad0c13e6586826a5653179d28fd48bbe27ada47f3b44f8aecdab179fe82bd`：ScenarioId list read.
- `src/content/chapter-flow.ts`，SHA256 `c87c7e22ddced05db1085c166f61ec8e8458ea4f718659cba88a64633948bbca`：All scene ID/scenario mapping read via search.
- `src/main.ts`，SHA256 `e84a9e051e2749b01d9c7ce690644988c941f3f06a90716e8ee818099762bec4`：Entry imports, create/prepareGameLevel calls, architecture.update and degraded-status UI searched only.

未完全覆盖：

- src/presentation/reused-aircraft/f35b.js and its generated geometry data: wrapper/trigger read, deep source factory not read; non-Tripo/Hyper reused aircraft flagged.
- src/content/*-layout.ts: imported and executed by actual builders; not independently line-by-line audited; no claim to audit mission/AI/nav.
- Character/weapon/patient-cart/interactive vehicle actor renderers and UI/VFX are outside this maps owner; other audit owners must cover them.
- ModelLibrary/GLTF decoding internals and all GLB meshes/textures: runtime resource existence checked, not visual/material verification.
- Historical artifact copies of GeneratedArchitecture/placement plans: current src runtime version audited; artifact drafts are not additional active coverage.

未提供全物体覆盖百分比；普通批次中包含信息色与实物，简单用triangle、asset ID或mesh数当完成率会失真。未宣称所有模型已上屏、内部可通行、碰撞/导航已适配。

逐实例证据补充：maps.json 的 commonPortKitEntities 逐次记录真实builder调用、原点矩阵、各primitive批次索引范围及被哪个生成组选择；groups.targets 保留实际目标索引，batchResiduals 保留其余数量，namedNonBatchMeshes 列非批次Mesh。所有统计来自内存构造与选择器，未加载GLB。剩余数量含D叠层，不能当物理物体数或覆盖率。
