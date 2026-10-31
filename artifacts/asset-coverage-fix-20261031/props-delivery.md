# 道具与历史枪交付记录

工作区：`/Users/penguin/VibeHack06-asset-coverage`。原 main、运行资产文件和付费 API 均未改动；未执行 Git 提交。

- `GeneratedPropBindings.ts` 注册真实动态 host 或精确 PortKit 实例成员；`GeneratedSceneAssets.ts` 按组原子换入、保留 fact 显隐和 transform，并在失败/取消时保留旧视觉、释放迟到租约。
- 15 个场景入口实例化并解析真实 GLB，116 个显式/语义绑定组，共 247 个道具/固定补充实例；具体记录在 `props-runtime-checks.json`。S04 两类真实运输车辆、S03箱/风机、历史餐盒/行李、各关门/终端/箱柜/椅/医疗桌物件已接。
- `GeneratedWorldWeapons.ts` 将历史厅 3 个 rifleModel 宿主换为项目内已有 AK，两个历史入口各 3 实例；借用同一 ModelLibrary 和 prepareWorldAK47 校准，保持原 fact/transform，使用可见网格贴地；没有独立下载池或新源模型。
- 最新 TypeScript 全树检查通过；本职责文件 `git diff --check` 通过。
- 新枪 + 既有 WorldAK + 道具 + 架构覆盖共 64 条测试通过。
- 后续交叉复核：PreparedGameLevel、GeneratedWorldWeapons、GeneratedSceneAssets、chapter paths、finale paths、navigation 共 6 文件 58 条测试通过（与上项存在重叠，不相加为独立总数）。
- 原碰撞列表由 architecture coverage 对基线 `0b3b05b` 的完整 hash 验证；门/物资/枪显隐、模型跟随、失败/取消、原子换入、共享释放均有测试。

Node 测试只替代图片解码，保留真实 GLB 节点、几何和材料结构解析；尚未宣称 WebGL、画面、穿插或性能验收。车型复用、缺少分件与专用模型候选详见 `remaining-props.md`。当前继续承担患者车/监视器/世界枪生命周期的独立只读 review。

独立 review 补充（只读源码）：

- 完整阅读 ImportedPatientCart、DepartureMonitor、PreparedGameLevel，并跟踪 ImportedCharacter/ModelLibrary/main 的有关租约、身份与动态调用。未发现患者车或 worldWeapons 新增 P1 生命周期问题。
- 找到监视器素材失败未进入主告警的 P2；根代理已补 assetErrors、素材预热、幂等 dispose 与迟到 ready 保护。复读确认，ImportedPatientCart + PreparedGameLevel 的 35 条回归通过。
- 找到供给车箱体接触 P2：旧箱底 .650m 对后段实际床面 .537–.545m 悬空，前箱 z=.7 处与 .736m 靠背穿插。根代理提出两箱改为长 .50m、x=±.18、z=-.35；只读真实 GLB raycast 242 点复核：所有点命中平床面，最高 .546664m，外缘 x=±.337666m，与约 x=±.45m 护栏分离。推荐箱底 .549m（最高点净距 2.34mm），改动由根代理执行。
- 病人连续 120 次 setPose 未出现累积翻转：Zhou 腰轴差为 0，Meng 约 0.000068rad；身份仍分别为 CH-ZHOU/CH-MENG。该数值检查不替代最终画面验收。

S03 最后补接与冻结：

- 原装备架四组方块枪/零件已隔离为四个 `upright-rack` 宿主，并使用同一正式 AK 完整模型；枪口向上，0.89m，位于原枪架前面，原台面和碰撞未变。没有把整枪称为拆解零件。
- `night-rack-ak-1` 按既有 `weapon-collected` 事实显隐，读取已领取检查点时也保持隐藏；其他三支仍为库存陈列。
- 最终跨入口计数：场景道具/固定补充 247 个实例、116 个绑定组；独立世界枪 10 个实例（S01/S02各3、S03四支），共 257 个放置实例。两个运行检查 JSON 均已刷新；数量不是同时驻留量，也不代表未生产专用品已完成。
- 裸露冰芯 4 根与 8 个端帽已加入剩余候选；现有闭合 SAMPLE-CORECASE 不被当作独立裸芯来源。
- 最后回归：world weapons + props + architecture coverage + chapter paths 共 58 条通过；随后补上 PreparedGameLevel 构造边界测试对第三个 IO owner 的 mock，PreparedGameLevel + world weapons 共 33 条通过。TypeScript 与职责文件 diff-check 通过。文件已冻结，无新增 API、无 Git 提交。
