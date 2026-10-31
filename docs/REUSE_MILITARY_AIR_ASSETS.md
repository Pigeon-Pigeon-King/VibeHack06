# VTOL / BREAKWATER 飞行资产复用记录

2026-10-31。本轮把 VTOL 的完整 F-35B 工厂接入《重返木卫三》S12 备用候选，状态为 **integrated / 实景待验**。这是一架保留原轮廓和可动机构的护航机；尚未把单资产验证计作 S12 实机场景、手机性能或 Windows 验收。

用户本轮已确认两套历史项目均为自己的制作成果，并明确授权本项目复用。此次操作仅只读核对旧项目、复制所需文件与记录已有署名，不重新询问用户许可、不执行历史发布或账号命令，不变更本项目总许可证。源文件已有第三方记录继续随文件保留；本记录不是完整发布许可审查。

## 实际来源与选型

| 来源 | 已核对目录 | 对话 |
| --- | --- | --- |
| VTOL / Headwind Corridor | `/Users/penguin/test_game_01/vtol-pigeonking` | [规划 VTOL 空战故事线](codex://threads/01a16c0f-a4de-73d3-b463-0737d18e9e57) |
| BREAKWATER | `/Users/penguin/test_game_01/deck-zero/battle` | [BREAKWATER 大战场开发](codex://threads/01a13404-e062-7741-97f6-755c3e8e94ef) |

以下入口均核对了实际源码；F-35B、EC135、MQ-28、Kestrel-7 和 BREAKWATER F/A-18F 还用本项目 Three.js r186 在 Node 中构建了实例。表内渲染数字来自这些实例的可见几何统计，不是旧截图或浏览器性能结论。未下载外部资源。

| 候选与实际入口（相对其来源目录） | 格式与真实几何 | 材质 / 贴图 | 可用动作与限制 | 原运行状态与本作适配 |
| --- | --- | --- | --- | --- |
| **VTOL F-35B**：`src/f35b.js`、`src/aircraft/f35b-source.js` | AC3D 原网格与 XML 机构转换为 JS；80 网格、36,613 三角面完整保留；本作飞行显示 79 网格 / 35,753 面 | 源运行版代码色板；本作 11 个可见材质；0 纹理；玻璃保留透明度 | 三组连续起落架、升力舱盖、滚转口、喷口、风扇；源操纵面与座舱机构仍在底层数据中。本工厂公开喷口转换、起落架和发动机显示 | **当前 VTOL 主机体，本轮选中。** S12 接收区外围护航；S01—S02 / S08 仅在剧情需要时作为远方空中压力或掩护。不能载人、运货或充当登陆艇 |
| VTOL EC135 P2：`src/aircraft/helicopter-source.js`、`fleet-runtime.js` | 源 48,644 面；当前救援显示 32,291 面 / 3 网格；没有用代理盒重画机身 | 3 材质，代码着色，0 纹理；原源贴图未进入运行 | 源主旋翼、尾旋翼等 3 个 GPU 动作矩阵；救援滑橇和绞盘几何存在。不是已完成吊救、开门、登机动画；`gear` 不会将固定滑橇改成轮式起落架 | 当前 VTOL 第三、四行动救援机；可作为 S01—S02 撤离或 S12 救护候选，需剧情、接触、尺度和平台实测。本轮未复制 |
| VTOL MQ-28 / Loyal Wingman：`src/aircraft/cca-retained.js`、`cca-source.js` | 保留原 STL 59,954 三角面，1 网格；约 11.7 m 长 | 1 材质，0 纹理 | 无可动关节或有效起落架动作；不能据通用接口名称声称具备悬停或机构动画 | 当前 VTOL 协同无人机；适合远方护航剪影。本轮未复制 |
| VTOL Kestrel-7：`src/aircraft/cca-procedural.js` | 原创参数化机体；飞行 1,818 面 / 2 可见网格。它不是 MQ-28 原网格 | 2 材质，0 纹理 | 起落架整批显隐两态；无喷口转换、连续收轮或可动机翼 | 保留的独立旧构型，已不作为当前 `cca` 默认入口；不能将它标成 MQ-28 的同等网格复用。本轮未复制 |
| **BREAKWATER F/A-18F**：`assets/aircraft/f18-functional.js`、`generated-f18-code.js`、`assets/retained/{data,numeric-codec,lzma-decoder}.js` | GLB 网格转换为项目数值包；源记录 49,910 面。实构建飞行态连 4 枚导弹及尾焰：48 可见网格、31,893 面 | 当前飞行态 19 材质、48 几何，0 纹理；座舱玻璃和代码尾焰保留 | 六块操纵面来自原机身的三角形分件；起落架是原收/放两套几何的显隐切换，**没有连续收轮轨迹**；导弹与尾焰为原项目功能层 | 当前 `js/combined-actors.js:createFighter` 实际调用；本作 S01—S02 远方轰炸 / S12 护航候选。本轮未复制 |

BREAKWATER 的 `assets/procedural/hornet.js` 是曾被替换回原网格的近似程序化版本；当前 `SOURCE-REBUILD.md` 明确记录原网格恢复，实际战斗入口也使用 `f18-functional.js`。本轮没有把这个历史近似构型冒充当前 F/A-18F 资产。上述候选没有提供已验收的运兵登陆艇或空降舱；宣传片运输编队仍需相符资产。

F/A-18F 工厂使用旧项目展示单位；`combined-actors.js` 再统一乘 2.5。独立工厂测得宽 5.2753、高 2.1959、含尾焰长 8.1641 单位，不能直接把这个尺寸当米。F-35B 的本作工厂则保持米制源比例。

## 本项目的文件与原件

运行入口是 [reused-aircraft.ts](../src/presentation/reused-aircraft.ts)，本地依赖只为以下三份文件和本项目 `three` 包：

- [f35b-source.js](../src/presentation/reused-aircraft/f35b-source.js)：3,025,331 字节，源网格、面、UV、节点和动画参数原样复制；SHA-256 `ec554326e57f5ef3f36748af7030b2d7503da828dddf6a10ad7da5415e3de8f2`。
- [f35b-palette.js](../src/presentation/reused-aircraft/f35b-palette.js)：源运行色板原样复制，SHA-256 `ef795d52e8dc70e47b84224557384eb30cbbaeb079d2b023808bfc199d8035ae`。
- [f35b.js](../src/presentation/reused-aircraft/f35b.js)：保留原构造和 XML 机构求值；改为项目内导入、共享几何和材质引用计数、显式发动机输入、重复释放保护及清理。

归档位于 [assets/source/reused-aircraft/vtol-f35b](../assets/source/reused-aircraft/vtol-f35b)：

- `f35b-runtime.original.js`、`f35b-palette.original.js`、`f35b-airframe.original.md`：未经修改的旧实现与说明。
- `f35b-source-manifest.json`：固定源版本和 10 个源文件摘要。
- `F35B-GPL-3.0.txt`：原许可全文，35,147 字节，SHA-256 `8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903`。
- `f35b-source.zip`：原对应源码包，含四份 AC 模型、对应 XML、源设置、许可、离线转换器与重建说明；SHA-256 `d2f47f7ebf313b8337f655580d4076258878405a757c49e9e28efab046c6c12b`。本轮逐项校验 ZIP 中全部 10 个清单文件，字节数和摘要全部吻合。

这些归档不参与游戏加载；运行不引用旧项目绝对路径、父级素材目录、CDN、GLB 加载器或在线模型服务。需要重建时，将归档解压到单独目录并使用其中的离线转换器；不要覆盖保存的原件。

主窗口已补入 `public/licenses/reused-aircraft/f35b/` 的原许可与署名，以及 `public/sources/reused-aircraft/f35b-ganymede-source.zip` 的组件对应源码包。包内保留上述原始归档、本轮工厂、S12控制器、测试与本说明，并附逐文件摘要。它是飞行组件源码，不是完整游戏工程；不包含账户、旧部署脚本或其它窗口的生产文件。Vite 从 public 复制到网页构建后仍核对文件摘要；最终网站链接和完整项目源代码尚未发布。

## 原署名与许可标识实际范围

F-35B 固定上游为 `FGMEMBERS/F-35B`，提交 `2726b3bdf3c7c54ea09a5d4a248e86a739604ca7`。原署名为 Petar Jedvaj、Detlef Faber、F-GTUX、Stuart Cassie、Gary Brown 及上游贡献者；Headwind Corridor 记录为 2026 年转换和修改者。

| 已读取的来源标识 | 本项目保留位置与处理 |
| --- | --- |
| 原 `src/aircraft/f35b-source.js` 文件头直接标 `FGMEMBERS F-35B, GPL-3.0` | 数值文件原样复制，原文件头保留 |
| 原 `src/f35b.js` 文件头直接标 `source-preserving JavaScript reconstruction — GPL-3.0` 并列作者 | 原版保存在归档；本项目运行改版保留该文件头并追加本轮修改说明 |
| 上游清单将选定 AC / XML 源与版本记录为 `GPL-3.0` | 原 `License.txt` 同时保留于对应源码 ZIP 和独立许可全文；逐文件摘要保留 |
| 原 `f35b-palette.js` 仅写 Headwind Corridor 代码色板，无单独许可头 | 不凭空改写为另一许可证；依本轮用户对其历史成果的复用授权复制并保留原注释 |
| BREAKWATER F/A-18F 源记录为 bohmerang / CyberSea、`CC BY-NC-SA 4.0` | 仅候选记录，未复制到本轮运行依赖；不以用户授权删除已有第三方来源说明 |
| EC135 记录 GPL-2.0-or-later；MQ-28 记录 Waseem- / CC-BY-4.0；Kestrel-7 文件头 MIT | 只读候选记录，均未复制进本轮运行链路 |

保留这些标识说明复制了什么及其来源，不把整套旧项目统称为同一种许可证，也不据此更改《重返木卫三》的整体许可证或宣布发布审查完成。

## 工厂接口与动作含义

```ts
import { createReusedAircraft } from './reused-aircraft';

const aircraft = createReusedAircraft();
scene.add(aircraft.root);
aircraft.root.position.set(0, 50, -120); // 宿主负责路径
aircraft.setFlightState({
  thrust: 0.7,   // 0 停机显示；1 完整视觉发动机功率
  gear: 0,      // 0 收起；1 放下
  tilt: 0,      // 0 巡航；1 悬停转换
  timeSeconds: simulationTime, // 可省略；原升力风扇的宿主仿真时钟
});
aircraft.dispose();
```

返回值严格包含 `root: Group`、`setFlightState(state)` 和 `dispose()`。三项必填数值钳制到 0..1，非有限值归 0。可选 `timeSeconds` 采用宿主秒制仿真时间，负数钳制到 0；省略或传非有限值时保持上次时间。相同状态和时间重复调用得到相同姿态，暂停不靠调用次数转动风扇。

- 坐标为 **1 单位 = 1 米、+Y 向上、−Z 向前**。根原点是源机体原点，未改到轮胎接地点；原机鼻探针保留。
- `tilt` 映射源 `conversion = 1 - tilt`，保留原分段时序：`tilt=0.5` 已打开 80° 升力舱盖，喷口仍为巡航；`tilt=1` 的喷口为 95°。它不是线性喷口角度或整架飞机俯仰。
- `gear` 真实变换三组轮、支杆和舱门，并带动原座舱起落架柄；不是在收起时简单隐藏全部轮架。
- `thrust` 使原座舱油门运动，控制原 `ReheatL` 几何的每实例发光/透明度，以及源升力风扇的视觉转速。没有新造尾焰锥体或赋予机体推力。升力风扇需要 `tilt>0` 和持续的宿主时间；巡航关闭。
- 原机翼、舵面和舱盖等数据完整保留，但本公共接口不暴露所有源飞行控制。没有新增玩家驾驶、武器开火、登机、碰撞、导航、运输舱或货物卸载功能。

底层几何和 13 个源分角色材质按引用计数共享，其中 10 种实际用于模型；每架机独立持有机构节点、姿态和尾焰材质。原始顶点色、UV、玻璃参数与机身各材质角色保留；尾焰在原材质克隆上加入本作独立强度，不污染其他深色部件或另一架飞机。默认关闭 `castShadow`，实际场景若需要须另测阴影成本。

`dispose()` 可重复调用，会移除根节点、释放实例尾焰、清空机构引用；最后一个实例才释放共享几何和基础材质。场景整合必须先从通用网格清理路径中移出这些飞机，再调用工厂释放，避免对同一共享资源重复执行通用销毁。

## 本轮测量与验证

机器可读记录和全部复制摘要见 [reuse-military-air-assets.json](../artifacts/reuse-military-air-assets.json)。测试位于 [reused-aircraft.test.ts](../tests/reused-aircraft.test.ts)。

| 范围 / 状态 | 网格 / 三角面 | 材质 / 几何 / 纹理 | 精确可见外包围 XYZ（米） |
| --- | --- | --- | --- |
| 完整保留数据 | 80 / 36,613 | 源分配 13 材质；80 几何；0 纹理 | 包含默认隐藏挂架；不作为飞行显示成本 |
| 巡航，`thrust=.7, gear=0, tilt=0` | 79 / 35,753 | 11 可见材质；79 可见几何；0 纹理 | 11.05188 × 3.75336 × 17.15326 |
| 悬停放轮，`thrust=.7, gear=1, tilt=1` | 79 / 35,753 | 11 / 79 / 0 | 11.05188 × 5.15442 × 17.15326 |
| 停机收轮 | 78 / 35,561 | 10 / 78 / 0 | 11.05188 × 3.75336 × 17.15326 |

全几何属性缓冲合计 **4,832,916 字节**，两个实例共享同一套 80 几何；这是数组字节数，不含 JS 源数据、对象、驱动开销或着色器。飞行态两种双面透明材质可能各需双绘制，因此常规主渲染约 81 次提交/架是结构估计，尚无本轮浏览器 renderer 统计。原几何未合批、未减面、未生成 LOD，不适合据此直接承诺大量同屏编队。

已通过的本轮证据：

- 逐一比较全部 **109,839 个 GPU 顶点角点**与保留源坐标，最大单轴误差 `3.002929691575673e-7 m`；完整保留 80 部件、36,613 面和 UV/法线属性。
- 原数值几何、色板、对应源码 ZIP 和许可全文 SHA-256 均吻合；ZIP 内清单 10 项逐一吻合。
- 401 个往返转换采样检查实际喷口、舱盖和前轮顶点；最大相邻顶点位移 0.05521 m，往返终态回到起点。
- 原风扇随显式宿主时间改变；同一时间重复调用姿态不变；停机风扇停止；真实油门运动和尾焰强度可独立变化。
- 两实例姿态和发动机材质隔离；释放第一架后共享几何释放事件为 0，释放最后一架后恰为 80，重复释放不增加次数；后续新建会重建已释放模板。
- 最终 `npm test -- tests/reused-aircraft.test.ts --maxWorkers=1 --testTimeout=60000`：7 项通过，26.59 s；`npm run typecheck`：通过。此前同时存在其他窗口测试进程时，一次复跑的完整模型重建/释放用例触发默认 5 s 超时；随后只为该用例设 60 s，未放宽几何、姿态或释放断言。测试耗时不是渲染帧率测量。

## S12 整合与未验项

由主窗口在 `src/presentation/epilogue-environment.ts` 与 `src/presentation/EpilogueAirCover.ts` 接入，在 `first-wave-approaching` 后通过 `DeferredAirCover` 按需加载；工厂本身不监听任务、不推进剧情。初次接入最多 **2架**，明确表现外围护航，援军／物资仍由相应地面或运输实体承担。

首次在东南侧的进场有屋顶遮挡，现改为接收门北侧：巡逻中心(-4,-310)、半径160米、高度60／72米、速度22米/秒，6秒平滑进入，双机错开4秒；只给S12采用.004雾密度，其它章节保留.008。真实顶点与PortKit遮挡数值检查中，门内首15秒长机可读窗口5.2—15秒、僚机9.4—15秒；最小机间中心距87.72米，整机离走区至少82.56米。11项护航检查通过，报告见 `artifacts/asset-aircover-visibility-tests.json`。实际浏览器诊断已显示ready及模型绘制数量，但天空截图的机体尚不够清楚，不能把数值窗口当视觉通过。

以下仍需主窗口/后续真实验收：S12 第一人称视距、与木星及港区的比例、玻璃/尾焰排序、镜头路径、真实手机 GPU 与帧时间、切场/重试渲染资源、Windows EXE，以及大编队所需 LOD/合批。Node 中几何、动作和销毁通过，不能替代这些证据。
