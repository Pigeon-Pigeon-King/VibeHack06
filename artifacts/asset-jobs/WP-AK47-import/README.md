# WP-AK47 代表武器入库

记录日期：2026-10-31。状态：本地原件、运行副本、许可与第一人称适配已建立，几何与生命周期检查通过；随后已在浏览器观察真实网格／材质、腰射、瞄准、装填与触屏局部操作。近景手部接触、手机真机与 Windows 验收待做。本记录不表示七种候选枪械已可用。

来源是本机 `lowpoly-military` 的 `github-operation-steel-tide-ak47/ak47_reloadable_world`，没有付费生成、网络下载或修改原库。taradavies 的原始几何为 CC0-1.0；Operation Steel Tide / AetherRadar 的适配及内嵌生成纹理为 MIT。已逐项读取本机包内 `SOURCE_LICENSE.md`、`LICENSE`、`pack.json` 与主 catalog 条目；本次没有重新在线核验最初发布页。源许可记录说明原 `.blend` 的外部图片与 HDR 未进入适配模型，当前 GLB 的六张 PNG 都在 BIN chunk 内。

原件保存在 `assets/source/WP-AK47/`，运行版位于 `public/models/weapons/ak47-world-r1.glb`，两者字节相同、各 2,046,524 bytes，SHA-256 均为 `d121eb62491e7f2cc573cd7bdb04e4a482f1eca3b16df7976b2ee2306ea4e1c1`。副本许可位于 `public/licenses/WP-AK47/`，运行没有共享库绝对路径、兄弟目录或外部纹理依赖。

`src/assets/weapon-catalog.ts` 导出 `ak47Source(baseURL)`。`src/presentation/ImportedWeaponView.ts` 实现 `WeaponModel`，构造参数为 `ModelLibrary`、`ModelSource` 与 `WeaponLoadStatus` 回调；另有 `retry()`。加载期间保留原枪械代理，成功后隐藏代理枪本体，保留方块手臂并挂入真正 GLB。状态文案为“装备载入中”／“装备载入失败”。没有修改枪械伤害、弹速、弹药、任务逻辑或手持物整体升降系统。

适配先读取实际 POSITION 顶点和节点变换。原本体沿 −Z，长度约 1.40005 m；代码采用统一比例校准到项目展示长度 0.89 m，这一长度是展示契约，不冒充制造商尺寸认证。握把从 FurnitureGeometry 的真实握把顶点求中心，支撑手取护木底面。前准星使用中央柱顶，避免把两侧更高护圈当准星；后照门取实际开口中线。两点求得微小旋转后，同一 ADS 平移使其同时位于相机中心。枪口挂在原始 `MuzzleDeviceTip`，不是另猜一处枪口。

默认隐藏 `SpareMagazine`、`Suppressor`、`OpticMount`、`OpticRailAdapterGeometry` 与 `OpticRailContact`。源 GLB 为 11 个 mesh 资源、24,488 唯一三角形；默认可见枪本体为 10 个 mesh、23,644 三角形。还有代理手臂，未将 mesh 数冒充实际渲染 draw calls。资源包含六个材质、六张 1024 PNG、十个 texture 条目；GPU 上传／显存、实际 draw calls 和帧时尚未测量。

GLB 的 animation clips 为 0。弹匣抽出与返回、后段拉机柄和开火机柄位移都是本项目程序化表现，每次从原节点位置与四元数重建，不累积漂移。手臂依旧是方块代理，当前近景手掌包覆与换弹接触不算正式动作验收。

`tests/imported-weapon.test.ts` 的 12 项检查使用真实 Three.js GLTFLoader 解析模型，Node 环境只替代图片解码为 Texture 对象。检查覆盖原件摘要／内嵌资源、真实部件、统一比例、1366×768／844×390／390×844 的 ADS 几何对齐、竖屏腰射机匣投影、弹匣与机柄复位、完整收枪、异步重试与迟到租约、共享资源所有权。没有用这个替代真实 PNG 解码、纹理渲染或浏览器输入证据。

复现几何记录：在仓库根目录执行 `node artifacts/asset-jobs/WP-AK47-import/inspect-import.mjs`，更新 `import-record.json`。`source-side-geometry.png` 和 `iron-sight-geometry.png` 是实际顶点生成的正交诊断图，使用区分部件的平色，未解码纹理，也不是游戏截图。

浏览器补验范围及原图见 [运行证据](../../asset-runtime-evidence.md)：桌面瞄准和横屏触控持枪已观察，出现过的金属过暗已加入程序化间接反射后复查。竖屏机匣偏出画面已修正并在S05的390×844画面复查。后续需补手与握把接触、近墙收枪、完整演出交接、手机及 Windows 包的资源加载和成本。当前禁止把几何检查或这些诊断图标为真人／真机验收；`import-record.json` 保留几何阶段的原始范围。
