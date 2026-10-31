# 已生成场景道具接入：冻结的 8 件

本记录覆盖 `production-20261031-tex1024-v1` 的 8 件静态道具，以及 `GeneratedSceneAssets` 在 5 个场景中的既定位置。13 项专属测试已通过；真实 GLTFLoader 能解析全部运行几何和材质。测试在 Node 中替换了图片解码，**没有浏览器／第一人称／手机／Windows 实景验收**，不能将本记录视为全地图替换完成。

2026-10-31 主窗口已在 `main.ts` 的场景加载／释放处接线，并提供 4 个独立 `PortKit.visualSlot`。这里未修改主窗口的共享入口，也未合入美术窗口正在制作的另一套广泛地图替换／`PortKit.asset` 加载方案。后续必须由主窗口统一两套入口，防止同一占位被两个 loader 同时替换。

## 固定来源与复现

- 取用时间：2026-10-31 06:02:50.465114 UTC（北京时间 14:02:50）。
- 只读来源工作区：`/Users/penguin/VibeHack06`；接入工作区：`/Users/penguin/VibeHack06-worktree`。
- 原清单更新时间：2026-10-31 05:53:52.783870 UTC。
- 原清单 SHA-256：`56b763f761c3e2d2c582563edc0879f270727a95e8a0e5ab15e8c385705000ee`。
- [source-manifest.json](source-manifest.json) 是当时 8 件、73,533,616 B 的原清单逐字节快照；[source-snapshot.json](source-snapshot.json) 保存任务 ID、供应商、源 GLB、已审查概念图及摘要。主树后续新增模型不会自动扩充此批。
- 原 GLB 留在主工作区各自 `assets/source/tripo/` 与 `assets/source/hyper3d/`，未改写，也未整包复制生产队列。运行依赖全部在本项目 `public/assets/generated/production-20261031/`，不读取主工作区、父／兄弟目录或供应商 URL。
- 当前 [运行 manifest](../../../public/assets/generated/production-20261031/manifest.json) 与 [代码清单](../../../src/assets/scene-asset-catalog.ts) 保存不同的 `sourceSha256`／运行 `sha256`。运行版经过纹理预算处理，不能再宣称与原 GLB 逐字节一致。

本轮未提交生成任务、未付费、未发布、未改整体项目许可证、未 commit。这里保留已授权生产资产的归属与任务证据，不替代供应商条款或发布许可检查。

## 纹理预算处理

[resize-glb-textures.py](resize-glb-textures.py) 使用现有本地 Pillow 11.3.0，对运行副本内嵌图片执行最长边 1024 的确定性缩放。JPEG 使用质量 90、4:4:4、不渐进编码；PNG 保留 alpha 并使用压缩级别 9。使用 LANCZOS，法线图缩放后重新归一 XYZ，不翻转 Y。原材质／纹理／采样器 JSON 保留，因此 baseColor／emissive 的 sRGB 语义及 normal／metallicRoughness 的线性数据语义仍由 glTF 槽位决定。没有新增 Draco、KTX 或其它解码器要求。

每个非图片 bufferView 都进行逐字节比较，包括位置、索引、UV、法线，以及转换器复用到人物时的权重／骨架／动画数据。场景模型未简化、拉伸或重建。每件的 `textures-<ID>.json` 保存源→运行 SHA、图片尺寸、编码字节、非图数据 SHA 和显存估算。转换器拒绝原地覆盖源文件。

```sh
python3 artifacts/asset-integration/scenery/resize-glb-textures.py \
  --input /absolute/path/to/original.glb \
  --output public/assets/generated/production-20261031/ASSET.glb \
  --report artifacts/asset-integration/scenery/textures-ASSET.json \
  --max-size 1024
```

独立复跑长凳转换获得字节一致的运行 GLB；透明 PNG 小样缩放后仍为 RGBA 且 alpha 保留，证据见 [texture-converter-verification.json](texture-converter-verification.json)。

| 资产 | 供应商 | 原→运行字节 | 三角形 | 原纹理边长→运行边长 |
| --- | --- | ---: | ---: | --- |
| BG-CRANE | Hyper3D | 5,331,512 → 3,154,172 | 19,718 | 2048 → 1024 |
| ENV-LIGHTKIT-POLE | Hyper3D | 2,319,412 → 1,393,544 | 11,374 | 2048 → 1024 |
| PROP-BENCH | Tripo | 11,641,764 → 1,256,928 | 4,592 | 4096 → 1024 |
| PROP-LIFE-MUG | Tripo | 8,377,524 → 834,268 | 3,626 | 4096 → 1024 |
| PROP-MEDICAL-BAG | Tripo | 17,454,464 → 1,569,588 | 5,518 | 4096 → 1024 |
| PROP-TANK | Hyper3D | 3,169,960 → 1,690,788 | 15,130 | 2048 → 1024 |
| PROP-TERMINAL-CONSOLE | Tripo | 10,952,596 → 1,617,188 | 9,819 | 4096 → 1024 |
| PROP-VEH-TUG | Tripo | 14,286,384 → 2,185,792 | 18,122 | 4096 → 1024 |

合计 **73,533,616 → 13,702,268 B**。每件各有 1 个网格／1 个几何资源／1 个材质／3 张内嵌图片、0 骨骼、0 动画片段。24 张运行图片均为 1024×1024。RGBA8 加完整 mip 链估算由总计 1,472 MiB 降至 128 MiB；每唯一模型约 16 MiB。此估算不含其它场景资产、渲染目标、CPU 解码副本、驱动对齐等，也不是实测驻留量。

| 单次场景 | 此模块独立下载量 | 模型网格实例 | 此模块三角形 | 此模块纹理估算 |
| --- | ---: | ---: | ---: | ---: |
| frontgate／transfer／flank | 8,424,296 B | 4，另有 2 个自有底座 | 64,368（含底座） | 64 MiB |
| medical | 3,660,784 B | 4，双凳共用 1 份资源 | 18,328 | 48 MiB |
| epilogue | 1,617,188 B | 1 | 9,819 | 16 MiB |

这是资产本身的成本，不等于整场景 draw calls／显存；阴影还会追加渲染工作。没有建立常驻无限缓存或全批预加载。

## API 与释放顺序

```ts
const dressing = new GeneratedSceneAssets(modelLibrary, {
  parent: environment.root,
  scenario,
  baseURL: document.baseURI,
  onStatus: status => { /* pending/loading/ready/error/cancelled */ },
});

await dressing.ready; // 状态列表；单件失败保留原场景并返回 error，不让整个场景失败。
dressing.getStatus();
dressing.dispose();  // 必须先于 environment.dispose()/disposeModelTree()
```

- constructor 自动挂载 `root`；放在环境 `PortKit.flush()` 之后。不需要 `update()`，模型都是静态陈设。
- 通过现有 `ModelLibrary.acquire(source, {signal})` 持有租约；最多同时处理两组放置任务。两个长凳为一组，等待两者都成功才隐藏旧 slot。重复实例共享几何／材质／纹理，各自有独立 root。
- 成功后只隐藏 `generated-fallback:<slot-id>`。slot 缺失时拒绝加载该替换组，避免覆盖合批占位；失败时释放已成功的半组并保留整个占位。
- `dispose()` 先 abort 请求，detach 本模块 root 和每个租约 root，再 `lease.dispose()`；只直接释放自己创建的底座几何／材质。已完成的两份场景租约互不提前释放，最后一份归还后共享资源只释放一次。
- 切场景后的迟到返回立即归还租约，不附着旧场景。重复 dispose 无效。读取状态不暴露内部 map。
- 主窗口当前 `load()` 先释放旧 `generatedScenery` 再释放旧 environment；整体 Game.dispose 也遵守此顺序。不得再让通用遍历直接处置尚在树内的租约几何。

## 实际放置点与接触边界

所有尺寸采用**单一等比系数**，以已检查源模型的一个轴长度标定，glTF +Y 保持朝上，再显式绕 Y 转向。底部中心放在表中位置，源网格／材质／主要轮廓不改。表中尺寸为真实顶点变换后的世界 AABB（X×Y×Z），不是制作概念图的期望尺寸。

| 资产／placement | 场景 | 底部中心坐标（米） | 实测 AABB 尺寸（米） | 接入方式 |
| --- | --- | --- | --- | --- |
| 牵引车 `front-tug` | frontgate、transfer、flank | [21, 0, 20] | 2.67949 × 2.00250 × 4.52398 | `front-tug` slot 替换 |
| 罐体 `front-east-tank` | 同上 | [43, 0, 10] | 6.2 × 7.23652 × 6.17659 | `front-east-tank` slot 替换 |
| 吊机 `front-background-crane` | 同上 | [78, 0, 60] | 39.26020 × 30 × 18.53029 | 围界外独立 43×22m 底座，无新增可走路径 |
| 灯杆 `front-background-light` | 同上 | [58, 0, 36] | 2.28854 × 5 × 0.93951 | 围界外独立 3.2×2m 底座 |
| 左凳 `medical-bench-left` | medical | [-414.5, 0, 63.5] | 1.8 × 0.5068846643 × 0.4536818683 | 与右凳共同替换 `medical-rest-bench` |
| 右凳 `medical-bench-right` | medical | [-412.5, 0, 63.5] | 同左凳 | 同组成功才替换；后围板仍可见 |
| 护理包 `medical-supply-bag` | medical | [-417, 1.062, 56] | 0.4 × 0.28600 × 0.24000 | 既有补给箱盖 y=1.06 上方 2mm |
| 生活杯 `medical-water-mug` | medical | [-414.16, 0.962, 60.39] | 0.11821 × 0.1 × 0.13460 | 既有桌面 y=0.96 上方 2mm，避开原容器 |
| 终端 `epilogue-reception-console` | epilogue | [2.2, 0, 6] | 3.5 × 1.37651 × 1.10073 | `epilogue-reception-console` slot 替换桌／玻璃，标签外置 |

独立背景物不叠在原程序吊机／灯杆的同一位置；底座全部在前线 x=54 围界之外。吊机仍为 30m 高工业地标，不被缩成室内摆件。医疗台面道具不叠原有小物件。关卡任务锚、门动态、步行线路、原场地碰撞／导航均由原关卡保留；GeneratedSceneAssets 本身不会新增或删改 `SolidSpec`。

主窗口已把两个无靠背矮凳的占位体与碰撞改为实际尺寸，高 0.5068846642971039m、宽 1.8m、深 0.45368186831474306m，后围板单独保留。

**仍未精确贴合的接触代理：**牵引车保留旧 `2.65×2.70×4.35m` 旋转盒代理，实际车高约 2.0025m；罐体旧代理为 `6.665×9.2×6.665m`，实际高约 7.2365m；终端保留旧 4×1×1.2m 桌代理，真实屏幕顶部约 1.3765m。它们是原关卡的保守／简化代理，近距离站立接触、绕行与弹道轮廓仍需由共享场景负责人结合实景校准；此模块的测试不宣称碰撞外形完全贴合。尤其不能把车顶／罐顶空域命中或可走空隙视为已经验收。

这些 GLB 均是单网格静态资产：车轮、拖钩、吊机臂／吊钩、终端按钮及包扣没有独立运动接口。灯杆模型不自动提供照明；终端源贴图不是任务状态屏。原交互／灯光／任务逻辑继续由项目控制。

## 测试与边界

[focused-tests.json](focused-tests.json)：2026-10-31 北京时间 14:18:30 执行，**1 文件、13 测试全部通过**。命令：

```sh
PATH=/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin:$PATH \
  npm test -- tests/generated-scene-assets.test.ts --maxWorkers=1 --testTimeout=60000 \
  --reporter=default --reporter=json \
  --outputFile=artifacts/asset-integration/scenery/focused-tests.json
```

覆盖了运行 SHA／嵌入依赖、5 场景真实模型加载、地面／桌面高度、双凳新碰撞包络、吊机／灯杆底座承托、任务点及指定路径点净空、S12 北门通道、保持 authored solids、共享租约最后释放、缺 slot 安全回退、双凳部分加载失败、切场景取消与迟到释放、源尺寸变化拒绝、独立道具失败隔离、自有底座只释放一次、无配置场景不加载。

[runtime-geometry-audit.json](runtime-geometry-audit.json) 来自 [audit-scene-assets.mjs](audit-scene-assets.mjs) 的逐顶点检查：8 件 GLTFLoader 实际解析，103,503 个顶点条目（非合并顶点）、87,899 个三角形；非有限顶点 0，零长／非法法线 0。法线长度约 0.999999852–1.000000162。几何审计替换了图片解码，不能据此宣称贴图视觉正确。可使用 Node 22 的 `--experimental-strip-types` 复现此独立数值审计。

本批 8 件**全部有运行位置**，长凳有两个实例；总计 9 个唯一 placement 定义，前线 4 个定义在三张连续场景复用。其余场景返回空 placement 列表。`MAP-A-ARCH-01`、`MAP-B-CORRIDOR-01`、`MAP-C-FACADE-01`、`MAP-C-ICEBANK-01`、`MAP-E-PIER-01`、`MAP-F-ROOF-01` 及其余正在生产／另窗准备的模型不在此冻结批，没有被本模块复制、放置或验收。

后续仍需：第一人称在对应关卡实际看见并检查朝向／PBR／遮挡与阴影；车／罐／终端接触代理精确校准；剧情互动与角色接触；慢网／真实图片解码失败及切场景体验；整场景 draw／峰值显存／手机帧率；Windows 包验证。广泛地图替换须先统一 loader 与资源所有权，再扩充本清单，不能凭生产目录有文件就记为全地图完成。
