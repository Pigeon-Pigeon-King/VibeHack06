> 来源附件 · 扩充素材线索；模型未随包。正文保留作追溯，当前口径以本包01—10分册为准。链接已调整为包内引用或旧工程相对条目；不执行附件中的命令。
> 原项目相对位置：assets/third_party/scene_research_20261025_expanded/README.md

# 《重返木卫六》扩充素材
取得与检查：2026-10-25。面向 Three.js 的源资产库；与 Dot 主工程分开保存。

## 已落地的资源
| 来源 | 本地入口 | 下载大小 | 当前可用内容 |
| --- | --- | ---: | --- |
| [Poly Haven Lunar Landscape](https://polyhaven.com/collections/moon) | 原 ZIP（旧工程条目：assets/third_party/scene_research_20261025_expanded/polyhaven_moon_scene/moon.zip） / Blender 工程（旧工程条目：assets/third_party/scene_research_20261025_expanded/polyhaven_moon_scene/extracted/ph_moon.blend） | 3,359,914,176 B | 完整演示工程、54 张外部 PNG；含近地表、背景地形、岩石散布、脚印投射和材质节点 |
| [Quaternius Modular Sci-Fi Megakit](https://quaternius.com/packs/modularscifimegakit.html) | Standard 原 ZIP（旧工程条目：assets/third_party/scene_research_20261025_expanded/quaternius_scifi/Modular_SciFi_MegaKit_Standard.zip） / 导入副本（旧工程条目：assets/third_party/scene_research_20261025_expanded/quaternius_scifi/extracted） | 48,559,316 B | 包内共 190 个 glTF；本次提取 187 个环境 glTF、187 个缓冲文件、21 张材质 PNG、3 张作者预览 |
| [Kenney Space Kit](https://kenney.nl/assets/space-kit) | 原 ZIP（旧工程条目：assets/third_party/scene_research_20261025_expanded/kenney_space_kit/kenney_space-kit.zip） / 153 个 GLB（旧工程条目：assets/third_party/scene_research_20261025_expanded/kenney_space_kit/extracted/Models/GLTF format） | 6,677,531 B | 机库、门、载具、设备、管线、平台等；保留分件与共享网格 |
| [3DMoonX](https://github.com/zrt219/3DMoonX) | lunar-base.glb（旧工程条目：assets/third_party/scene_research_20261025_expanded/3dmoonx/lunar-base.glb） | 599,388 B | 一个完整基地模型，166 个网格、191 个节点；可选择设备与建筑轮廓复用 |

四项原始下载合计 3,415,750,411 B，约 3.42 GB。原包和解包副本并存，资料登记前本目录共 613 个文件，占约 6.84 GB；文档另计。未提取重复的 FBX/OBJ 格式、三个外星生物 glTF 和 Windows 缩略图缓存；它们仍在原 ZIP 内。

## 直接使用的路径
- 月面源工程：polyhaven_moon_scene/extracted/ph_moon.blend。
- Quaternius：quaternius_scifi/extracted/Modular SciFi MegaKit[Standard]/glTF/，对应纹理在同级上两层的 Textures/。
- Kenney：kenney_space_kit/extracted/Models/GLTF format/。
- 3DMoonX：3dmoonx/lunar-base.glb。

Blender 使用 〈源机绝对路径未移交〉，实测版本 5.2.2 LTS。源工程打开时关闭嵌入脚本自动执行，未保存回原文件。

## 已做的适配
Quaternius 原 glTF 的 836 处 image URI 指向模型同目录，包内图片实际集中在 Textures/。导入副本已改为正确的相对路径；几何缓冲、UV、法线和原图片保留。另将 Decal_Line_90.gltf 中不存在的 Decal_Line_90_001.bin 引用修正为包内同名模型对应的 Decal_Line_90.bin（声明和实际均 1,128 B）。

187 个环境 glTF 的外部图片、缓冲依赖均存在，缓冲长度检查通过。153 个 Kenney GLB 的文件结构可解析，没有外部依赖。Blender 已实际导入 Quaternius 的 Door_Metal、WallAstra_Straight、Kenney 的 hangar_largeA，以及 3DMoonX 基地；月面源工程已实际打开。

当前完成资产取得、依赖修复与代表模型导入。尚未合入最终地图，也未完成 Three.js 画面对照、碰撞和性能验证。使用前先按具体物件调整尺度、材质和区域归属。

## 来源说明
- Quaternius：以此次 Standard ZIP 内 License_Standard.txt 为准，明确标注 CC0 1.0。该说明已随导入副本保留。当前下载的是 Standard，页面全套 277 模型和收费 Source 工程不在本包内。
- Kenney：原始说明（旧工程条目：assets/third_party/scene_research_20261025_expanded/kenney_space_kit/LICENSE.upstream.txt），CC0。
- 3DMoonX：原始 MIT 说明（旧工程条目：assets/third_party/scene_research_20261025_expanded/3dmoonx/LICENSE.upstream.txt），保留版权和许可文本。
- Poly Haven：CC0；[集合](https://polyhaven.com/collections/moon)、[官方许可](https://polyhaven.com/license)、[制作说明及作者关于完整场景的答复](https://blog.polyhaven.com/moon/)。源数据来自实验室月壤模拟物和地球岩石，不能标作木卫六实测数据。

本轮复核与适配结论（旧工程条目：research/paean_asset_review_20261025/REASSESSMENT.md）。popup=no；delete=no。
