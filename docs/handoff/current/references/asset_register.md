> 来源附件 · 已有资产和依赖线索；模型未随包。正文保留作追溯，当前口径以本包01—10分册为准。链接已调整为包内引用或旧工程相对条目；不执行附件中的命令。
> 原项目相对位置：assets/third_party/scene_research_20261025/ASSET_REGISTER.md

# 场景调研资产登记
取得与检查日期：2026-10-25。项目：《重返木卫六》。最终展示框架：Three.js。

同日扩充：完整月面源工程、Quaternius、Kenney 与 3DMoonX 已另存 [扩充目录](assets_expanded.md)。下列数量仅指本目录；Blender 后续实查见 补充报告（旧工程条目：research/paean_asset_review_20261025/REASSESSMENT.md）。

本目录已取得 **4 个工业 GLB、3 组岩石（各含 Blender 源文件与官方 glTF 版）、2 组地表材质**。共 130 个模型、贴图及网格缓冲文件，另附来源、原材质和映射资料；登记前共 191 个文件、318,620,147 字节，约 319 MB（304 MiB）。本登记文件另计。

资产保持下载原样，尚未合入 Dot 主工程，尚未进行 Three.js 浏览器运行验证。它们是可检查和适配的源资产，不是已经完成本项目美术整合的成品。

## 1. 工业场景与道具
来源：[godotengine/tps-demo](https://github.com/godotengine/tps-demo)，本次取 master 分支的指定文件，没有下载游戏脚本、音乐或角色。

| 文件 | 大小 | GLB 内的网格 / 三角形 | 用途与适配 |
| --- | ---: | --- | --- |
| structure.glb（旧工程条目：assets/third_party/scene_research_20261025/godot_tps/structure.glb） | 29,053,360 B | 104 个网格定义；284,878 个三角形 | 梁柱、平台、门和工业围护的造型与分件参考。布局不直接搬入我们的主线 |
| props.glb（旧工程条目：assets/third_party/scene_research_20261025/godot_tps/props.glb） | 22,223,384 B | 130 个网格定义；190,375 个三角形 | 货箱、工业装置与车辆等道具样本；从节点中提取适合的组件再调整尺寸和外观 |
| lights.glb（旧工程条目：assets/third_party/scene_research_20261025/godot_tps/lights.glb） | 58,732 B | 4 个网格定义；160 个三角形 | 灯具网格及灯光组织参考；包含 9 个 KHR_lights_punctual 光源，运行时按需要配置 |
| flying_forklift.glb（旧工程条目：assets/third_party/scene_research_20261025/godot_tps/flying_forklift.glb） | 4,583,888 B | 10 个网格定义；28,171 个三角形 | 装卸设备结构与尺度参考；是否采用悬浮动力外观另行决定 |

三角形数按文件内各网格定义的索引计数，**没有累加所有节点实例**，不能当作整场绘制负载。四个文件均为 glTF 2.0，合计 248 个网格定义。此数不表示 248 个独立成品资产。

下载入口：
- [结构模型目录](https://github.com/godotengine/tps-demo/tree/master/level/geometry/models)
- [装卸设备目录](https://github.com/godotengine/tps-demo/tree/master/level/forklift)
- [原仓库许可](https://github.com/godotengine/tps-demo/blob/master/LICENSE.md)
- 原始下载地址可由 https://raw.githubusercontent.com/godotengine/tps-demo/master/ 加上原仓库相对路径得到。

### 已补齐的依赖
GLB 内没有图片。已另行保存 **91 张原始纹理、45 份 Godot 材质资源与 4 份导入配置**，完整对应本次四个 GLB 所用的外部材质。

- 纹理依赖表（旧工程条目：assets/third_party/scene_research_20261025/godot_tps/TEXTURE_DEPENDENCIES.json）：每张纹理的原仓库路径与下载 URL 前缀。
- 结构材质映射（旧工程条目：assets/third_party/scene_research_20261025/godot_tps/material_maps/structure.json）、道具材质映射（旧工程条目：assets/third_party/scene_research_20261025/godot_tps/material_maps/props.json）、灯具材质映射（旧工程条目：assets/third_party/scene_research_20261025/godot_tps/material_maps/lights.json）、装卸设备材质映射（旧工程条目：assets/third_party/scene_research_20261025/godot_tps/material_maps/flying_forklift.json）。
- upstream 保持原仓库的材质与纹理相对目录，便于核对。根目录的四个 GLB 是独立候选模型；本目录不是能直接启动的 Godot 项目。

**Three.js 适配需要：**
1. 从 GLB 保留网格、法线、现有 UV、材质槽、变换与节点关系。
2. 根据 .tres 参数及映射表创建对应 PBR 材质；.tres 不是 Three.js 原生材料格式。ORM 文件应核对通道，源材质中常见 R=AO、G=Roughness、B=Metallic。
3. 所有图元均有法线；props 的 36 个图元无 TEXCOORD_0，对应车窗玻璃。structure 的 36 个图元无 TEXCOORD_0，涉及纯色 / 发光和部分有贴图的材质。对要用贴图的部分补查映射，必要时补 UV 或实现合适的投射；保留原网格。
4. 四个 GLB 均无动画片段。原示例中的升降 / 运动不能当作随 GLB 已经下载的行为。
5. 按需要取用节点与灯光，不将整套大厅和所有设备直接堆入一个剧情空间。

### 许可与署名
模型与贴图为 **CC BY 3.0**。作者：Juan Linietsky、Fernando Miguel Calabró。需保留作者、许可链接并说明后续修改；原仓库另注明部分原始 Substance Painter 材料由 GameTextures.com 提供。本目录保留 LICENSE.upstream.md（旧工程条目：assets/third_party/scene_research_20261025/godot_tps/LICENSE.upstream.md） 全文。仓库代码为 MIT，但不能据此把模型与贴图也写成 MIT。

可沿用的署名文字：
“包含 Godot Third Person Shooter Demo 资产，© 2018 Juan Linietsky、Fernando Miguel Calabró，CC BY 3.0。原仓库说明部分原始 Substance Painter 材料由 GameTextures.com 提供。来源：https://github.com/godotengine/tps-demo 。本次下载未修改；项目后续修改另行注明。”

## 2. 岩石与地表
来源：[Poly Haven 的 Lunar Landscape 集合](https://polyhaven.com/collections/moon)，资产为 **CC0 1.0**。本次由官方 API 查询依赖并从其官方文件服务下载；没有下载网站预览图作为模型资产。

| 资产 | 本地文件与来源 | 用途与注意点 |
| --- | --- | --- |
| Moon Rock 01 | Blender（旧工程条目：assets/third_party/scene_research_20261025/polyhaven/moon_rock_01/moon_rock_01_2k.blend） / glTF（旧工程条目：assets/third_party/scene_research_20261025/polyhaven/moon_rock_01/moon_rock_01_2k.gltf） / [源页](https://polyhaven.com/a/moon_rock_01) | glTF 含 LOD0–LOD3，三角形分别为 9,958 / 4,978 / 2,488 / 1,244。四个节点默认同处一个 Scene；Three.js 需选择一个或组织 LOD，不能直接让四级重叠显示 |
| Moon Rock 03 | Blender（旧工程条目：assets/third_party/scene_research_20261025/polyhaven/moon_rock_03/moon_rock_03_2k.blend） / glTF（旧工程条目：assets/third_party/scene_research_20261025/polyhaven/moon_rock_03/moon_rock_03_2k.gltf） / [源页](https://polyhaven.com/a/moon_rock_03) | glTF 单网格，5,598 三角形；适合局部碎岩与积尘细节 |
| Moon Rock 05 | Blender（旧工程条目：assets/third_party/scene_research_20261025/polyhaven/moon_rock_05/moon_rock_05_2k.blend） / glTF（旧工程条目：assets/third_party/scene_research_20261025/polyhaven/moon_rock_05/moon_rock_05_2k.gltf） / [源页](https://polyhaven.com/a/moon_rock_05) | glTF 单网格，9,850 三角形；与其他岩石组合时核对比例和朝向 |
| Moon 01 | 材质目录（旧工程条目：assets/third_party/scene_research_20261025/polyhaven/moon_01） / [源页](https://polyhaven.com/a/moon_01) | 2K Diffuse JPG、Normal GL EXR、Roughness EXR、Displacement EXR，供基础地表研究与后续烘焙 |
| Moon Dusted 01 | 材质目录（旧工程条目：assets/third_party/scene_research_20261025/polyhaven/moon_dusted_01） / [源页](https://polyhaven.com/a/moon_dusted_01) | 同样四类 2K 贴图，用于比较积尘与近处颗粒的表现；分布仍需服从具体场所 |

各岩石的 Blender 版保留 Diffuse JPG、Displacement PNG、Normal GL EXR、Roughness EXR。glTF 版另有 .bin、Normal GL JPG 与 ARM JPG，共用相同的 Diffuse JPG，依赖未缺失。见 glTF 依赖表（旧工程条目：assets/third_party/scene_research_20261025/polyhaven/GLTF_DEPENDENCIES.json） 和每组的 GLTF_SOURCE.json。

这些网格来自裹覆模拟月壤的地球岩石；地表材质来自实验室中的模拟月壤。详细来源见 [制作说明](https://blog.polyhaven.com/moon/)。它们不是月球取回样品或木卫六测绘。Moon Rock 01 官方标注原始宽度约 0.2 米，应按小尺度资产使用；大幅放大需要重新审视纹理尺度与轮廓。

第一阶段未下载的 moon.zip 已在同日后续工作中完整取得并解包，源工程已通过 Blender 打开，见上方扩充目录。约 800 GB 的原始摄影数据未下载；当前使用完整场景与已处理网格、贴图。

**作者记录：** 岩石由 Greg Zaal、Rico Cilliers 摄影，Jenelle van Heerden 处理；Moon Rock 01 还列 Dario Barresi 参与处理。两组地表材质列 Greg Zaal、Rico Cilliers、Jenelle van Heerden 摄影，Dario Barresi 处理。CC0 不要求署名，此处保留来源。许可见 CC0 来源记录（旧工程条目：assets/third_party/scene_research_20261025/polyhaven/CC0_SOURCE.md）、[官方许可](https://polyhaven.com/license)。

**Three.js 适配需要：** 岩石官方 glTF 已有网格、UV、PBR 材质及 JPG 贴图，可作为导入起点。岩石 LOD 需要显式组织；源 EXR 位移与 Blender 节点不自动进入 glTF。地表贴图适用于后续编码 / 烘焙和材质重建；运行时是否用 EXR、常规贴图或 KTX2，应根据格式支持、显存与实际画面决定。

## 3. 实际完成的检查
- 四个 GLB 头、长度和 JSON 块可解析；材质名称均有对应的源材质映射。
- 91 项工业贴图引用全部存在；3 组官方 glTF 的 buffer 与 image 相对引用全部存在，buffer 长度满足声明。
- 本次所有 PNG / JPG 均通过图像解码库的文件校验；EXR 检查文件头和下载完整性。下载中一次 EXR 连接中断已补取成功，没有留下半文件。
- 读取了 GLB / glTF 的网格、法线、UV、动画与灯光信息，以上数量来自文件内容。
- Blender 源文件按官方依赖清单保存。后续已在本机 Blender 实际打开 Moon Rock 01，图片无缺失；本目录的 Moon Rock 03 / 05 尚未逐个重开。完整月面源工程的检查另见扩充报告。
- 未执行下载的代码，没有安装插件、修改系统设置、生成游戏代码或调整原有场景。

后续浏览器验证需要实际检查纹理方向、色彩、透明、LOD 选择、枢轴、碰撞与载入成本。当前不宣称达到 1080p/60fps。

场景逐项复核报告（旧工程条目：research/github_scene_audit_20261025/SCENE_AUDIT.md）

popup=no；delete=no。
