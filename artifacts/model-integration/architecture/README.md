# 架构模型运行接入 · 2026-10-31 16:32

状态：**已接入可检查候选，未做浏览器／WebGL／真人画面验收**。本分工不改 `main.ts`、`PreparedGameLevel.ts`、环境构建器、PortKit、物理／导航／任务，也不构建、提交 Git 或发布。主入口由主窗口／PreparedGameLevel 负责人接入。

## 入口

```ts
import { GeneratedArchitecture } from './presentation/GeneratedArchitecture';

const architecture = new GeneratedArchitecture(modelLibrary, {
  parent: environment.root, scenario, baseURL,
  onStatus: status => { /* id, state, error?, placements?, drawBatches? */ },
});
await architecture.ready;
architecture.update(cameraWorldPosition);
// 必须先于 environment.dispose()；另已注册 model-tools 的预遍历释放钩子。
architecture.dispose();
```

`ready: Promise<readonly ArchitectureStatus[]>`。状态为 `pending | loading | ready | error | cancelled`；普通加载／绑定失败结束为 error，保留原白盒；显式取消结束为 cancelled。共享 `ModelLibrary.acquire()` 是唯一运行加载入口，没有另建 GLTFLoader。测试中的 GLTFLoader 仅用于真实 GLB 的离线解析。

`getStatus()` 返回快照，`coverage()` 返回来源测量、替换结果和仍未覆盖的可见网格；`update()` 可无参数调用，无参数时保留当前档位。未接入相机更新前，生成物初始采用最粗档。`drawBatches` 是三档累计分配的 InstancedMesh 数，不能称为渲染器实际 draw calls。

## 文件职责

- `src/assets/architecture-catalog.ts`：冻结的 66 条 ID／SHA／相对 URL／材质来源记录。
- `src/presentation/ArchitectureTransactions.ts`：移植原生产包的静态几何烘焙、材质批次、原子替换、LOD、引用计数及取消释放。允许明确的无旧目标装饰组；其余替换必须提供精确目标。
- `src/presentation/architecture-placement-plan.ts`：原 S05/S11 测量方案，1771／650 放置与未覆盖清单。
- `src/presentation/architecture-bindings.ts`：真实环境根批次的精确实例索引绑定、冻结期望数量及额外模型位置。仅查看当前已建好的实例，绝不重跑环境 builder 来发现实例，不新增 solids。
- `src/presentation/GeneratedArchitecture.ts`：供 PreparedGameLevel 接入的共享库／生命周期适配器；最多两个组并行准备。
- `public/models/architecture-r1/`：66 个项目内 GLB，62,655,080 B；没有运行时绝对文件路径或外部 URL。

## 实际章节覆盖

| 场景 | 实际解析／挂载检查 | 放置 | 三档累计批次 |
|---|---:|---:|---:|
| S05 frontgate | 21 组 ready | 1779 | 198 |
| S11 medical | 3 组 ready | 650 | 54 |
| S01 childhood | 1 组 ready | 1 | 3 |
| S06 transfer | 22 组 ready | 1780 | 201 |
| S08 escort | 2 组 ready | 72 | 6 |
| S12 epilogue | 2 组 ready | 2 | 6 |

六个真实环境总计覆盖 22 种资产／66 个不同 GLB 源，逐一核对了冻结 SHA。另声明 S02 mainhall 同历史建筑入口、S07 flank 同 S05/S06 地理结构；这两个入口没有单独做本轮真实 GLB 挂载测试，不能混称已逐章验收。没有把 S08 桥模块复制进没有该桥的 S09／S10 场景。

22 项对应用途详见 `handoff.json` 的 assetCoverage：六种 ARCH 为地板、墙、屋面、梁、货柜、掩体；ENV-WALL 为边界；ENV-PIPEKIT-STRAIGHT 为 S05 原管道；MAP-C-ICEBANK／BG-HEAT 为原远景替换；MAP-C-FACADE 为远景建筑面层；PROP-TANK 为 S05 第二储罐；ENV-LIGHTKIT-POLE 为北侧灯；PROP-BOOTH 为边界外查验岗；ENV-PIPEKIT-ELBOW 为管路回弯；BG-CRANE 为码头背景；MAP-A 为历史入口高位拱冠；MAP-B 为转接出口边界后的货廊延续；ENV-BRIDGEKIT-DECK／MAP-E 为 S08 桥下板与桥墩；MAP-F 为 S12 非可进入仓库屋盖；BG-SHIP 为 S12 岸外船。

## 替换与所有权

S05 原 15 组1771放置全部绑定到限定实例。S11 现版本 `medical-ground` 只有 collider，没有重叠的实体 box，因此地面仅替换 `port-ground` 一个网格。墙、屋面、工作间、集装箱、掩体等按当前源坐标精确绑定；每组还校验应有的旧实例数。不隐藏全局材料批次，其他实例仍可见。任何缺项或数量变化会保持该组原视觉并返回 error。

每组所有 LOD／材质槽及尺寸成功后才挂载并隐藏旧目标；失败没有半替换，远景档位从不恢复白盒。地面顶面保持 y=0；主要门洞与墙体布局沿用原计划。材质仅引用 LOD0，LOD1／2 几何使用相同归一化矩阵。生成批次和编译几何归架构管理器，原始几何、材质及纹理由 ModelLibrary lease 管理。

`dispose()` 先终止待获取请求，再卸下生成批次、恢复旧实例矩阵、释放自有几何及 leases；迟到结果也释放。双环境共用同一 ModelLibrary 时，一个环境释放不会销毁另一环境仍使用的材质。预遍历钩子能防止通用环境释放误删共享资源。

## 本轮验证

- 2026-10-31 16:32:12，两个 focused 文件 **14/14 通过**，5.80 秒。日志 `test-output.txt`。
- `tsc -p artifacts/model-integration/architecture/tsconfig.json --noEmit` 通过。未运行生产 build／全套测试。
- 真实66文件 SHA、22种章节挂载、原 collider JSON 完整相同、各LOD材质一致、远距仅LOD2显示、准确实例替换、失败／取消／late结果、共享lease、重复释放及通用树释放钩子均有检查。
- 所有 GLB 的节点、索引、顶点属性、材质槽经过真实解析；**测试仅替换了图片解码，未验证实际纹理显示**。
- 原生产包离线视觉审查复制在 `production-reviews.json`。那是生产窗口的离线证据，不能代替本次实际关卡灯光与画面。

复核命令（主窗口可统一安排，避免并发测试争用）：

```sh
node node_modules/typescript/bin/tsc -p artifacts/model-integration/architecture/tsconfig.json --noEmit
node node_modules/vitest/vitest.mjs run tests/architecture-transactions.test.ts tests/architecture-integration.test.ts
```

## 仍需检查

这是全部22种模型的运行接入，不是全部白盒已被美术覆盖。原 S05/S11 方案中的浅拱顶、若干机械件、医疗动态帘／床／输液架和其他家具仍由相应旧表现或其他资产负责人负责。S05 远景面层只补明确面层，不伪装成整栋建筑替换；桥下生成模块没有改变可行走桥面、碰撞或拓扑。

附加件采用源比例统一缩放。历史拱冠位于入口上方；S06 延续廊、S05 岗亭／起重机和 S12 船位于可玩边界外；S08 生成桥面件位于现桥面以下；S12 仓库生成屋盖上方轮廓高于原平顶。它们均已实际挂到章节，但 **第一人称可见性、朝向、贴合、接缝、遮挡、审美和视觉／碰撞关系待用户画面检查**，不能据节点存在声明实景通过。

手机／桌面渲染成本、实际纹理解码、连续章节表现、Windows EXE 均未验收；本轮无浏览器操作、无发布。
