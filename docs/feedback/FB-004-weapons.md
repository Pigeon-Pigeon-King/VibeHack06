# FB-004 · 成熟武器模型复用

日期：2026-10-31。分类：资产选型与武器功能需求。状态：需求已确认，首轮来源已核查；候选未接入游戏。

## 用户选择与预期

武器优先寻找成熟、可在 Three.js 使用的现有模型，不默认自己建模。候选枪型为 **AK-47、HK416、德拉贡诺夫、FAL、MP7、蝎式、乌兹**；这是用户给出的拟选范围，尚未确定每种枪的角色配发、关卡出现、操作差异和最终数量。“蝎式”的具体型号待选型时确认。

复现／触发条件：进入正式武器资产与武器系统制作。现有运行枪械仍为程序化代理；需求不是当前模型已经导入失败。

成熟模型仍需完成第一人称近景、ADS、分件、握持、换弹、枪口轴向、性能和许可检查。与项目现有资产流程一致，优先复用不要求重做概念图或重新生成；需改造的结构和画风再单独记录。

## 本机实际检索结果

2026-10-31 读取 [军事库索引](/Users/penguin/Assets/lowpoly-military/catalog/assets.json) 并检查实际 GLB 的 JSON chunk：

| 项目 | 证据 |
| --- | --- |
| 候选 ID | `github-operation-steel-tide-ak47/ak47_reloadable_world` |
| 实际文件 | `/Users/penguin/Assets/lowpoly-military/packs/github-operation-steel-tide-ak47/models/ak47_reloadable_world.glb`，2,046,524 字节 |
| 清单作者与许可 | taradavies 原始几何，Operation Steel Tide 适配；CC0-1.0＋MIT，包内 `SOURCE_LICENSE.md`、`LICENSE` 均存在；正式入库前再逐项核验许可边界 |
| 结构 | GLB 内存在 Magazine、ChargingHandle、MuzzleDeviceTip、FrontIronSight、RearIronSight、Stock 等节点；是否满足本作接触／运动范围尚未运行验证 |
| 清单成本 | 24,488 个唯一网格三角形；若保留全部网格节点实例，含备用弹匣共 28,870 三角形。内嵌纹理；真实渲染成本待测 |
| 动作限制 | 实际 GLB 的 animation clips 为 0；可分件不等于已有换弹动作或手臂绑定 |
| 状态 | 仅选型候选，未复制入项目、未导入或验收 |

本次在上述 1,389 条主模型清单中按名称／ID 检索，未定位到其余指定枪型。没有以通用 M4 代理冒充 HK416，亦未把未找到解释为网上不存在。首轮外部核查如下。

## GitHub 武器来源核查（2026-10-31）

**当前优先候选为 Operation Steel Tide 的 AK-47。** 它已同时具备固定版本、原作者许可和可解析的分件 GLB；这只足以进入本作适配验证，不表示第一人称武器完成。HK416、MP7、Uzi 找到了精确命名的 GitHub 文件，但仍有许可或交付格式缺口。SVD、FAL、蝎式和后续 PTRD-41，本轮未确认同时满足“GitHub 实际模型文件＋原作许可可追溯”的精确候选。

本轮读取固定提交的完整 GitHub 文件树、README、资产许可和原作者页面，下载少量文件到 `/tmp/ganymede-weapon-research/` 作数据检查，未运行上游仓库代码、未复制到本作运行资产、未接入武器系统。可重查的完整提交号、模型路径、摘要和检查结果见 [weapon-sources.json](weapon-sources.json)；临时下载目录不是项目依赖。

| 型号 | GitHub 固定版本与实际模型路径 | 格式 | 模型许可／原作者 | 结构、动作证据 | 首轮决定 |
| --- | --- | --- | --- | --- | --- |
| AK-47 | [AetherRadar/operation-steel-tide @ 7ef7b539](https://github.com/AetherRadar/operation-steel-tide/tree/7ef7b539af1e0166e1d2735dc0ba200a08ba6492/assets/models/steel_tide_ak74)：`assets/models/steel_tide_ak74/ak47_reloadable_{fp,world}.glb` | GLB；另有可编辑 `.blend` | taradavies 原始几何 CC0；适配方自制纹理及构建代码 MIT；见下方核查 | 两个 GLB 均实查：11 个 mesh、6 个材质、6 张内嵌图、0 skin、0 animation；有弹匣／枪机柄／瞄具及挂点 | **保留，优先适配一把**；需本作手臂、动作、尺度、ADS 与性能验收 |
| HK416 | [AsmundSchei/WeaponCollection @ a3fd6b50](https://github.com/AsmundSchei/WeaponCollection/tree/a3fd6b507230a7a8b4ecc38beb05caffc58d16f0/Content/Game/Assets/Models/Weapons/HK416)：`Content/Game/Assets/Models/Weapons/HK416/HK416.uasset` | Unreal `.uasset`，4,922,116 字节；同目录有材质／纹理／Skeleton | 仓库根许可与 README 称 CC0、来源 Sketchfab；**未找到此枪对应原作者和原作许可链接** | 文件字符串识别为 SkeletalMesh，指向上游电脑的 `HK416.fbx`；没有该 FBX。未解析骨架、分件或动画 | **暂缓**；不能从仓库标签推定第三方模型许可，也不能直接由 GLTFLoader 使用 |
| HK416 A5，另一线索 | [yegors/hard-lines @ 4a3de089](https://github.com/yegors/hard-lines/blob/4a3de089a6be0a8000c130123ac7108736d1d1a9/public/models/hk416.glb)：`public/models/hk416.glb`；`art/hk416.blend` | GLB 690,108 字节；Blender 源文件存在 | 构建脚本称来自 Tripo Gen 2；本次查到的根目录、README、package.json **未给出覆盖此模型的复用许可** | 只查文件树及构建说明，未下载／实查模型；上游称有分件不当成本作证据 | **暂缓**；公开可下载和 AI 生成均不能代替许可 |
| MP7 | [AsmundSchei/WeaponCollection @ a3fd6b50](https://github.com/AsmundSchei/WeaponCollection/tree/a3fd6b507230a7a8b4ecc38beb05caffc58d16f0/Content/Game/Assets/Models/Weapons/MP7)：`Content/Game/Assets/Models/Weapons/MP7/MP7.uasset` | Unreal `.uasset`，731,697 字节 | 同上，仅有镜像者 CC0 声明；原作者未对应 | 字符串识别为 StaticMesh，导入来源为未随仓库交付的 `MP7.fbx`；分件／动作未查 | **暂缓**；需原件与逐项来源，再考虑转换 |
| Uzi | [tldbs0420/Team_6-GameSoftware_2025 @ 5e0fee31](https://github.com/tldbs0420/Team_6-GameSoftware_2025/blob/5e0fee31300fc7481b6cd2473e3c600977c157e6/Assets/5%20Models/Weapons/Uzi/Uzi.fbx)：`Assets/5 Models/Weapons/Uzi/Uzi.fbx` | FBX 61,642,172 字节；另有 Unity `.anim` 与材质／纹理 | README 链至 1Matzh；枪本体可追到 Gintoki1234 的 CC BY 4.0，动画页另列第三方手臂，镜像又称修改过手网格；**组合包权利链未闭合** | 只读 `.fbx.meta`：列有 Equip、Fire、Reload、Reload_Empty、Run、Walk、Unequip 等；未下载大 FBX、未实际播放 | **整包暂缓**；优先追原作者枪本体，另配本作手臂；不把有动作名当作合格动作 |
| SVD／德拉贡诺夫 | 本轮未确认精确 GitHub 候选；下方有 Tabasco 原作备选 | — | — | — | 保留需求；不能将 `Sniper_Rifle_East` 的通用名称直接改报 SVD |
| FAL | 本轮未确认精确 GitHub 候选；下方有 FN FAL 50.63 原作备选 | — | — | — | 保留需求；通用 Battle Rifle 不作为精确 FAL |
| 蝎式 | 本轮未确认精确 GitHub 候选；下方原作明确为 vz.61 | — | — | — | **vz.61 与 Scorpion EVO 暂不代选**；原作线索不等于已确定枪型 |
| PTRD-41（后续） | 本轮未确认精确 GitHub 候选；下方有原作者页面备选 | — | — | — | 仅来源线索，不改变 FB-005 的待设计状态 |

### AK-47 的许可与数据边界

- [taradavies 原作者页](https://opengameart.org/content/ak-47-1)明确标注 AK-47、作者和 CC0；[固定版本资产许可](https://github.com/AetherRadar/operation-steel-tide/blob/7ef7b539af1e0166e1d2735dc0ba200a08ba6492/assets/models/steel_tide_ak74/LICENSE.md)区分原始几何与适配方新纹理，不能把仓库根 MIT 覆盖到所有第三方模型。目录名 `steel_tide_ak74` 是上游兼容命名，源页与交付说明均指 AK-47。
- 上游[来源记录](https://github.com/AetherRadar/operation-steel-tide/blob/7ef7b539af1e0166e1d2735dc0ba200a08ba6492/source_art/third_party/taradavies_ak47/LICENSE_EVIDENCE.md)说明原 `.blend` 的两张木纹和 HDR 来历未附，适配时全部移除并重建材质。**不要直接补下载这些失踪贴图**；本轮已验证交付 GLB 的图片与 buffer 无外部 URI，未执行上游重建流程。
- 本机 world 文件的 Git blob SHA-1 为 `350714a533e6e1596a8643af44ad669e3e0745d3`，与固定 GitHub 文件树一致；SHA-256 为 `d121eb62491e7f2cc573cd7bdb04e4a482f1eca3b16df7976b2ee2306ea4e1c1`。FP 文件下载后 SHA-256 为 `54d719c39b30963b5e52294e8601ee203f1eab607ba7e4da0ad70c6da43406e2`，与上游交付记录一致。
- FP 实查为 **97,372 个唯一网格三角形／114,900 个全部网格节点实例三角形**；world 为 **24,488／28,870**。差异包括备用弹匣复用网格；这两种计数均不是实际 draw call、帧时间或当前可见面数。两个文件都没有骨骼或动画片段，必须另作手臂接触及换弹时序。上游持枪尺度、挂点与 Godot 验收不继承为本作 Three.js 验收。

### 通用 GitHub 备选，不能冒充精确型号

[petroulacl/fps-asset-kit @ a19b7458](https://github.com/petroulacl/fps-asset-kit/tree/a19b7458a593598211c95ec46ef4eb4b6d1f94d7/weapons)实际包含 Pichuliru 的 Flat Guns。已交叉核对原作者 [West](https://opengameart.org/content/cc0-flat-guns-west)／[East](https://opengameart.org/content/cc0-flat-guns-east) 页面为 CC0，并将下面四个 GitHub GLB 与原作者 ZIP 内同名文件逐字节比对，均一致。页面说“可制作动画”而非已交付整套动作。以下是下载 GLB 后的检查值，均为 1 mesh、7 个材质、0 张纹理、无外部 URI、**0 animation**：

| 实际模型路径（仓库相对路径） | 三角形 | Skin／关节 | 已见节点与适用边界 |
| --- | ---: | --- | --- |
| `weapons/flat_guns_west/Flat Guns West/GLB/Rifle_Assault_West.glb` | 4,353 | 1／19 | 弹匣、枪机、拉柄、瞄具及附件关节；仅通用突击步枪 |
| `weapons/flat_guns_west/Flat Guns West/GLB/Rifle_Battle_West.glb` | 3,173 | 1／17 | 弹匣、枪机、枪托、瞄具等；仅通用战斗步枪 |
| `weapons/flat_guns_west/Flat Guns West/GLB/SMG_Compact_West.glb` | 2,201 | 1／14 | 弹匣、枪机、枪托及附件关节；不能直接标为 MP7／Uzi／蝎式 |
| `weapons/flat_guns_east/Flat Guns East/GLB/Sniper_Rifle_East.glb` | 2,943 | 1／13 | Bolt、Magazine、Stock、Attach_Scope 等；不能直接标为 SVD |

这些是低成本骨架／挂点验证备选，未检查权重、关节运动范围、模型轮廓或本作近景，不作为成熟第一人称成品。README 示例路径还省略了 `Flat Guns West/` 中间目录，应按真实文件树取文件。

另核查 [deeming-games/unity-fps-asset @ e0974630](https://github.com/deeming-games/unity-fps-asset/blob/e0974630b914d9ecb6e31e726039cceaa69b9610/README.md)：C# 代码 MIT，模型／动画／声音由 DJMaesen 提供、CC BY 4.0。文件树只见 `Assets/Models/Weapons/AssaultRifle/source/AssaultRifle.fbx` 和 Pistol 等通用命名；未找到所需七种精确型号，未把其代码许可当作模型许可，也未下载整个 Unity 工程。

### 原作者备选来源（不计作 GitHub 找到的模型）

这些补充用于后续选型；除 Tabasco 的小型 SVD 源包外，本轮仅核查页面和公开元数据，未下载模型。Sketchfab 数字是平台元数据，不能当成本机实测；CC BY 项目须保留原作者、作品链接、许可和修改说明。

| 型号与原作者 | 原作与许可证据 | 当前知道的交付／动作限制 |
| --- | --- | --- |
| HK416 A7 · r4m | [原作](https://sketchfab.com/3d-models/hk-416-a7-free-download-a16768f0ffa24737a4fe324a411cfbd9)，公开 API 指向 CC BY 4.0 | 平台 30,088 面、0 动画；未验下载格式、分件和权重。它不是上方 Asmund 模型的已证实来源 |
| SVD · Tabasco | [Various Small Arms 原作](https://lpc.opengameart.org/content/various-small-arms-assault-rifles-sniper-pistol)；作者于 2023-12-15 追加 public domain／CC0，页面仍并列旧 CC BY 3.0 | 401,491 字节 ZIP 确有 `dragunov.blend`。只读检查见 2,063 三角形、5 个材质、1 个 Bolt 骨骼；Blender 5.2.3 明确警告旧于 2.50 的动画未载入、须先用 4.5 转换，**不能记为无动画或已可播**。还存在未随包附带的 `SVD_Rifle.jpg` 引用，运行导出前须核清／去除；未导出 GLB |
| FN FAL 50.63 · notcplkerry | [Low-Poly FN FAL Paratrooper](https://sketchfab.com/3d-models/low-poly-fn-fal-paratrooper-d00782d68be24259a9f19612706ce6c4)，CC BY 4.0 | 平台 8,059 面、0 动画；原作明确为折叠托 50.63，未验格式和可动件 |
| MP7 A1 · Steve Henry／Trinitite_Studio | [原作](https://sketchfab.com/3d-models/hk-mp7-a1-27cd4b48fb14451c86adad4c559082d6)，CC BY 4.0 | 平台 32,487 面、0 动画；作者自行说明外形并非完全准确。它不是 Asmund 镜像的已证实来源 |
| Škorpion vz.61 · kutejnikov | [原作](https://sketchfab.com/3d-models/skorpion-vz-61-07bc7764f1d2460586c2907ff7f32753)，CC BY 4.0 | 平台 5,758 面、0 动画；原作另链 OpenGameArt。只支持 vz.61 方向，不能代选 EVO；分件／格式未查 |
| IMI Uzi Model B · Gintoki1234 | [作者发布页](https://gintoki1234.itch.io/uzi)及 [Sketchfab 原作](https://sketchfab.com/3d-models/uzi-6d997976cf5845b48c6e8b7495b3551b)，明确 CC BY 4.0 | 作者声明已绑定、只有枪托展开动作；平台记录 1 动画。**枪托动画不等于换弹动作**。优先从此追单独枪本体，不连同未知手臂包整包入库 |
| PTRD-41 · GoldbergR | [原作](https://sketchfab.com/3d-models/ptrd-41-low-poly-a488a286014648c2981790d864e74a03)，CC BY 4.0 | 平台 3,680 面、0 动画；未验格式、枪机／弹药分件或遭遇适配 |

Uzi 镜像所链 [1Matzh 动画页](https://sketchfab.com/3d-models/uzi-first-person-animations-2026-remake-73266e9f1eb949b69a3ab11d8f636048)自身标为 CC BY 4.0，但同时列出 Gintoki1234 枪本体及 Blue-Spirit 的 Division Agent；当前原作页已有 2026 修订，不能假定与镜像 FBX 版本一致。镜像 README 又声明换过手网格，需另追该手网格的原始权利；本轮不将整包标为可采用。

排除明确称从商业游戏提取的包，例如 [MP7 COD:MW2019](https://sketchfab.com/3d-models/mp7-codmw2019-pbr-8daf308d8f0f4858b2c7f505bfaa88c8) 与 [MP7 Counter Strike 2](https://sketchfab.com/3d-models/mp7-counter-strike-2-a4daa40f66124b29b8c0c5118ff8abc7)。上传者页面的 CC 标签不能解决其注明的上游商业游戏来源。没有采购、登录、提交生成任务或引入这些文件。

下一步先以 AK-47 做一个独立适配候选：保存原件与许可、校准尺寸及枪口轴向、检查全部可动件，随后制作本作手臂／ADS／射击／完整换弹并测实际成本。其余枪型继续按精确型号和来源筛选，不以本次来源研究宣称七种武器或 PTRD 遭遇已实现。

## 实际影响与方案

影响正式武器资产、`src/presentation/characters.ts` 的第一人称武器接口、`src/combat/` 的武器参数与弹丸、输入／UI 的切换和弹药状态，以及存档武器身份。现有单一武器实现不能只替换外观就宣称七种武器可用。

依 [资产接口](../ASSET_PIPELINE.md) 保存来源、原件、运行版与许可，再接入一把代表武器验证，随后复用一致的挂点和动作接口扩展。验收须覆盖实际模型、持枪／ADS／装填、碰撞遮挡、飞行弹丸、切换／重试，以及 Windows 资源加载；当前均待执行。

<a id="ptrd-41"></a>

## FB-005 · PTRD-41 阻击轻型装甲车辆

日期：2026-10-31。分类：新武器＋新遭遇需求。状态：已记录，待关卡设计与实现。

用户提议在某个环节加入 PTRD-41 反坦克步枪，用于阻击敌方轻型装甲车辆的突击。这是游戏内的遭遇用途；尚未指定章节、车辆类型、武器获取方式和任务成功条件。

- **预期**：获得／使用重型步枪、识别来袭车辆、实际弹丸命中、车辆响应和任务结果构成完整可玩片段。
- **实际影响**：武器模型与操作、弹丸和游戏伤害、车辆动画／碰撞／路线、遭遇阶段、失败／重试、声音与字幕。本轮仅找到上方 GoldbergR 的非 GitHub 原作线索，未下载或确认其可动件／动作，也未接入。
- **设计方案**：先在完整战役中确定适合已有反扑因果的段落，再定义车辆进入、掩体与射界、阻击窗口和车辆失能／撤退等可见游戏结果；不擅自替换已确认的人物成长、死亡或结局。
- **依赖**：主窗口关卡策划、FB-003 的战斗行为、FB-004 的武器接口与资产筛选；目前未向其他窗口发送消息。
- **验收证据**：待确定最终模型并保存原件／许可，补正常速度遭遇操作、可见弹丸与车辆状态、失败／重试和检查点一致性。文档记录不代表该遭遇已存在。
