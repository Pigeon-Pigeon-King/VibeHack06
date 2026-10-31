# S05 图片／视频盘点：先更正三张场景标签

**release备选中的03／04／05实际是独立 `northgate` 白盒，不是正式S05 `frontgate`。** 它们的旧图本身真实，但“北闸”这个地名不能把两个运行场景合并。下面仅提出更正，不改动截图代理拥有的媒体、文件名或manifest。

| release副本精确路径 | 原来源 | 建议标题 |
| --- | --- | --- |
| `artifacts/release-20261031/screenshots/03-s05-ads-cover-line-LEGACY.jpg` | `artifacts/asset-runtime-browser/ak47-ads-desktop.png` | 旧 northgate 白盒 · AK-47 瞄准与掩体线 |
| `artifacts/release-20261031/screenshots/04-s05-evacuation-task-LEGACY.jpg` | `artifacts/asset-runtime-browser/touch-terminal-and-subtitle.png` | 旧 northgate 白盒 · 称重台撤离任务 |
| `artifacts/release-20261031/screenshots/05-s05-objective-direction-LEGACY.jpg` | `artifacts/asset-runtime-browser/touch-look-edge-marker.png` | 旧 northgate 白盒 · 目标方位反馈 |

核对依据：实际查看图片中的HUD，并只读 `git show 828d2e5:src/mission/Simulation.ts`：第625行是 `if (this.scenario === 'northgate')`，626行产生“01 · 北路接敌／02 · 称重台撤离”，627—628行产生“接通称重台撤离线／掩护港务员南撤”。同提交 `src/content/chapter-flow.ts:8` 明确S05对应 `frontgate`；`src/mission/Frontgate.ts:144` 返回“S05 · 北闸的预告”。这是场景代码和画面文字的对照，不依赖文件名推断。

## 当前交付结论

盘点时间：2026-10-31T09:33:20.772143+00:00。要求基线 `b3c88dd50b848c54b6a3016cdff24bc167ae7a0d`；读取HEAD `b3c88dd50b848c54b6a3016cdff24bc167ae7a0d`。这是现存文件盘点，未运行游戏、未生成媒体、未改main/src/public、未提交Git。

指定范围共检查46个图片文件，找到**3张不同的S05原图**：2张有历史候选依据，1张具体版本未核实；另有8张独立northgate白盒原图。release下5张都是字节相同的副本，其中只有01与02对应历史S05，03—05对应旧northgate。**当前交付版可证实的S05图片为0张；实际视频为0个。**

浏览器已由主窗口确认 `browsers=[]` 与 `Local browser use is disabled in Work settings`。本任务没有启动浏览器或使用其他自动化绕过。最新菜单／手机改动仍由主窗口完成，不能把已有画面改标为新版。

## 三张S05原图

| 文件 | 实际格式／尺寸 | 画面与基线 | 当前可用性 |
| --- | --- | --- |
| [S05-before-generated-assets.png](/Users/penguin/VibeHack06/artifacts/asset-jobs/production-20261031/qa/S05-before-generated-assets.png) | JPEG · 1280×720 | 无精确构建／capture记录；S05入口、郑铎代理、代理枪与白盒场地；有开发诊断。文件名表示接入前，但没有对应精确构建或capture清单。 | `version_unverified`；不可标成当前版 |
| [S05-generated-first-view.png](/Users/penguin/VibeHack06/artifacts/asset-jobs/production-20261031/qa/S05-generated-first-view.png) | JPEG · 1280×720 | 823273d历史静态接入候选；S05入口工业场地、生成牵引车与远景起重机；代理枪、白盒、开发诊断和锁鼠标失败提示仍在画面。 | `historical`；不可标成当前版 |
| [ak47-portrait-final.png](/Users/penguin/VibeHack06/artifacts/asset-runtime-browser/ak47-portrait-final.png) | JPEG · 390×844 | 7877cbf资产候选；828d2e5存档；S05竖屏入口与郑铎对白，AK-47、旧触控界面、人物代理；不是当前正式人物展示。 | `historical`；不可标成当前版 |

S05-generated-first-view由原静态接入交接明确指认，交接已把它归于823273d历史方案。ak47-portrait-final的字节数／SHA-256与旧 `asset-runtime-candidate.json` 完全相同，该证据集基于7877cbf，源码集合摘要为 `55ad40deafd043d5d6ff0eb6b7de617be08a7da475f90ed543cfe3880b0b0d48`；这证明历史证据归属，不证明拍摄瞬间精确代码或当前版渲染。

S05-before-generated-assets的HUD确实是S05，但未找到与该图绑定的精确commit／构建清单，故标 `version_unverified`。不以文件名“before”、目录时间或mtime补造版本。

## 其他北闸历史原图

| 原图 | 尺寸 | 场景／基线 | 限制 |
| --- | --- | --- |
| `artifacts/asset-runtime-browser/ak47-ads-desktop.png` | 1366×768 | `northgate`；7877cbf资产候选；828d2e5存档 | 历史白盒，不是正式S05或当前版 |
| `artifacts/asset-runtime-browser/ak47-touch-landscape.png` | 844×390 | `northgate`；7877cbf资产候选；828d2e5存档 | 历史白盒，不是正式S05或当前版 |
| `artifacts/asset-runtime-browser/touch-look-edge-marker.png` | 844×390 | `northgate`；7877cbf资产候选；828d2e5存档 | 历史白盒，不是正式S05或当前版 |
| `artifacts/asset-runtime-browser/touch-move-forward.png` | 844×390 | `northgate`；7877cbf资产候选；828d2e5存档 | 历史白盒，不是正式S05或当前版 |
| `artifacts/asset-runtime-browser/touch-portrait-retry.png` | 390×844 | `northgate`；7877cbf资产候选；828d2e5存档 | 历史白盒，不是正式S05或当前版 |
| `artifacts/asset-runtime-browser/touch-terminal-and-subtitle.png` | 844×390 | `northgate`；7877cbf资产候选；828d2e5存档 | 历史白盒，不是正式S05或当前版 |
| `artifacts/northgate-active.png` | 1366×768 | `northgate`；ed4395e / 0.1.0白盒 | 历史白盒，不是正式S05或当前版 |
| `artifacts/northgate-result.png` | 1366×768 | `northgate`；ed4395e / 0.1.0白盒 | 历史白盒，不是正式S05或当前版 |

7张asset-runtime-browser北闸相关原图（其中1张S05、6张northgate）均与旧候选证据摘要一致。northgate-active/result与ed4395e中保存的文件字节一致；原 `final-evidence.md` 明确它们属于缩短的V2验证场，并说明部分UI在截图后仍有修改，因此连存档commit也不等于精确拍摄构建。完成页02:53是旧游戏计时，不是视频时长或当前全战役首通。

原文件多为 `.png` 后缀但实际编码JPEG；本次按真实文件头读取格式和尺寸，没有重编码或更名。release副本与原件逐字节匹配，不能因新复制日期成为新拍摄。全部摘要、尺寸、类型、来源和可用性逐项保存在同名JSON。

## 视频与排除项

在 `artifacts/release-20261031/`、`artifacts/asset-jobs/production-20261031/qa/`、`artifacts/asset-runtime-browser/`、顶层 `artifacts/*northgate*` 内未发现MP4／WebM／MOV等实际视频，邻近 `artifacts/trailer-45s/` 也未发现视频。时长与视频SHA-256为null，不用方案中的45秒／1350帧填写实际媒体属性。旧validation仍标 `source_video_capture=NOT_RUN`、`final_video_export=NOT_RUN`，v2剪辑方案也说明实机素材待拍。此结论限于上述搜索范围，不声称遍历了全机。

独立资产查看器的角色行走／起重机图、Blender Cycles的tactical-offline姿态图不是关卡实机。S11护理点和S12天空检查帧也不属于S05；这些文件均记录排除原因，未改作宣传图或假视频。

## 当前版五张S05画面职责与缺口

| 镜位 | 必须呈现 | 现有缺口 |
| --- | --- | --- |
| S05-01 当前S05全景 | 正式S05/frontgate入口、工业空间和有辨识度的实际资产；一眼可读的目标。 | 只有823273d历史入口图；当前60生产ID组合没有对应实拍。 |
| S05-02 正式同伴与对白 | S05中的郑铎或实际同伴中近景、正式模型、实际姿态和短对白；保持游戏内视点。 | 现存S05竖屏图仍为人物代理；独立人物查看器不能替代正式角色在关卡的画面。 |
| S05-03 掩体交火 | 正式S05掩体与敌我位置、第一人称ADS或开火反馈；原连续录像保留真实输入与命中因果。 | 现有ADS备选属于northgate验证场，需当前frontgate新拍；静态图不能单独证明命中。 |
| S05-04 工人撤离 | S05首批/末批工人在实际安全后路移动，任务进度与画面对象对应。 | 现有称重台0/7图属于northgate手动终端路线，不能替代正式S05自动撤离。 |
| S05-05 任务反馈与结果 | S05当前目标切换、到位/交接或后撤提示；字幕、方向与操作区可读。手机展示需最终触控版实拍。 | 现有方向图及完成页属于northgate；尚无当前S05后段或最终手机布局证据。 |

补拍应统一使用最终发布构建、正式S05/frontgate入口，登记构建摘要、场景、检查点来源和真实操作／镜头方式。实际视频保留正常速度连续原片，至少能看到移动、掩体、瞄准开火与真实状态反馈；静态截图无法证明命中、撤离完成或连续操作。这里没有为五镜位创建占位图片，也没有把概念图或图片轮播当成实机视频。

## 证据与复核方式

- `artifacts/release-20261031/screenshots/manifest.json`／`captions.md`：只读的他人备选包；本次发现其03—05场景标签需修正。
- `artifacts/asset-runtime-evidence.md`／`asset-runtime-candidate.json`：旧运行资产候选与截图摘要。
- `artifacts/asset-jobs/production-20261031/runtime/integration-handoff.md`：823273d历史S05截图和替代裁决。
- `artifacts/final-evidence.md`：0.1.0 V2白盒及截图后UI修改边界。
- `artifacts/trailer-45s/validation.json`／`v2/EDIT_PLAN.md`：规划与未拍摄状态；不当作媒体。

使用已安装Pillow只读识别编码／尺寸，SHA-256直接对文件字节计算；没有修改图片。JSON另存被读证据文件与固定Git源文件的摘要，未读取供应商原始响应、凭据或大型模型。精确快门时间未记录时保留null。
