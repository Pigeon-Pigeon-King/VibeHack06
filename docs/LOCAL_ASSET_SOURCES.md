# 本机军事资产来源与复用入口

用户指定的历史聊天：[检索下载军事 Lowpoly 模型](codex://threads/01a0bdb3-9932-71b3-861b-b6071db9f639)。这是既有通用生产成果，不是为《重返木卫三》专门制作的资产。此索引用于减少重复检索和生产；原库保持原样。

## 已核对的库存

本轮读取实际 catalog 并检查每条模型路径或工厂模块存在。原始库有 **1,389 条模型，25 个来源包**；代码库有 **164 个模型工厂**。这些是条目数量，不能当成 1,553 件独立高质量成品；代码库并非对所有原网格的一一还原。

| 入口 | 作用与当前证据 |
| --- | --- |
| [原始模型索引](/Users/penguin/Assets/lowpoly-military/catalog/assets.json) | 模型、依赖、许可、作者、面数、骨骼和动画；1,389 条主文件路径均存在 |
| [原始模型说明](/Users/penguin/Assets/lowpoly-military/REFERENCE_README.md) | 本地预览、搜索、带依赖复制的方法 |
| [代码工厂索引](/Users/penguin/Assets/lowpoly-military/code/catalog/assets.json) | 164 个 ID，所属模块均存在；可用于快速代理或匹配风格的道具 |
| [代码库说明](/Users/penguin/Assets/lowpoly-military/code/README.md) | 工厂调用、参数、更新和释放方式 |
| [代码来源](/Users/penguin/Assets/lowpoly-military/code/docs/SOURCES.md) 与 [许可](/Users/penguin/Assets/lowpoly-military/code/LICENSE.md) | 新写代码采用 MIT；不覆盖第三方设计与原件的许可条件 |

本轮验证的是清单与文件存在，未重新播放所有模型，也未证明它们在本作中合适。目录的 generated_at 是原库记录；不能拿它代替本轮检查时间。

清单 SHA-256：原始 `c518cf752efb3cdee3fb932a273e8f74b0e953166e63dd7533772bfe0b91641d`；代码 `d0cbfa9abc69e930db0c6fd0fabbaf9b10e20c5149dd763e77560a340c41abc6`。

## 优先试选

| 实际 ID | 清单记录 | 可先服务的需求与限制 |
| --- | --- | --- |
| `kenney-city-kit-industrial/shipping-container-a` | CC0；402 三角形；静态 | 北闸货运区模块，需统一材质与尺度 |
| `kenney-factory-kit/crane-lift` | CC0；304 三角形；静态 | 港口机具代理；有网格不表示有起吊动作 |
| `github-wrad-arms/arms` | CC0；1,196 三角形；1 个 skin；无动画片段 | 手臂接口参考；风格需与方块人物协调，不视为完成持枪／换弹 |
| `github-operation-steel-tide-ak47/ak47_reloadable_world` | CC0＋MIT；24,488 三角形；无 clips | 世界武器候选，第一人称分件和挂点另验；不是默认选定枪型 |
| `github-operation-steel-tide-ccby/bamen_military_soldier` | CC-BY-4.0；11,104 三角形；1 个 skin；无 clips | 比例／绑定参考；不直接代表本作方块人物方向 |
| 代码 `cargo-container`、`scene-wall-gate` | 668／128 三角形；4／3 draw calls | 货箱、围墙门代理；几何复用需在实际镜头检查 |
| 代码 `military-truck`、`diesel-generator` | 816／488 三角形；7／5 draw calls | 卡车、机组代理；配色与外形需适配寒冷港区 |
| 代码 `ak-style-rifle`、`m4-style-rifle` | 572／448 三角形；各 5 draw calls | 武器状态和挂点验证；代码 animated 标签不等于有骨骼动画库 |

筛选按场景用途进行，不把低面数自动等同于低成本。原库例如某路障达到 60,928 三角形；必须检查模型、材质、依赖和同屏实例数。

## 接入方式

1. 从清单按 ID 定位，检查原包许可与依赖，再预览轮廓、比例、动作和最近观看距离。
2. 原始网格使用库内 `tools/library.py copy` 复制选定 ID 及依赖／许可；代码工厂使用 `code/tools/export-assets.py` 导出选定 ID 及依赖。复制目的地在本项目内，保留来源和修改记录。
3. 运行只加载项目内资源，不直接引用 `/Users/penguin/Assets` 或兄弟项目。项目代码不随原库更新而隐式变化。
4. 在 [资产接口](ASSET_PIPELINE.md) 下登记 stable ID、原件摘要、运行版、尺寸、朝向、挂点、许可和验证状态。共享库里的历史 PASS 不能替代本项目实测。

历史库曾为 Paean 的代码资产方案服务；本项目为用户明确允许网格与生成资产的 Three.js 桌面游戏，按当前项目要求选型。当前阶段尚未复制任何上述模型进入本作。
