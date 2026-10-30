# Three.js FPS 参考项目与官方资料

核对日期：2026-10-30。用途是研究机制、接口与工程组织，原创玩法与内容以 [项目方案](PROJECT_BLUEPRINT.md) 为准。未将任何参考项目作为整套游戏底座导入本仓库。

## 官方依据

| 资料 | 支持的技术问题 |
| --- | --- |
| [games_fps 演示](https://threejs.org/examples/games_fps.html)／[源码](https://github.com/mrdoob/three.js/blob/dev/examples/games_fps.html) | Pointer Lock、胶囊人物、Octree、重力和投射物碰撞；这是基础示例 |
| [PointerLockControls](https://threejs.org/docs/pages/PointerLockControls.html) | 相对鼠标控制、锁定事件、俯仰限制、灵敏度 |
| [Octree](https://threejs.org/docs/pages/Octree.html) | 场景三角面空间索引、人物胶囊碰撞 |
| [Raycaster](https://threejs.org/docs/pages/Raycaster.html) | 图层过滤、最近交点、准星选点与短线段扫掠 |
| [Timer](https://threejs.org/docs/pages/Timer.html) | 时间增量、可见性处理与一致更新 |
| [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) | glTF／GLB 与扩展加载 |
| [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html)／[AnimationAction](https://threejs.org/docs/pages/AnimationAction.html) | 角色动画播放、循环、混合与暂停 |
| [Camera](https://threejs.org/docs/pages/Camera.html) | 相机本地 −Z 朝向与投影 |
| [LoadingManager](https://threejs.org/docs/pages/LoadingManager.html)／[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) | 资源进度、错误、渲染统计与回收接口 |
| [glTF 2.0 规范](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc) | 米制、右手坐标、Y-up、模型正面、材质与动画格式 |
| [Electron](https://www.electronjs.org/docs/latest/)／[Windows 安装器](https://www.electronforge.io/config/makers/squirrel.windows) | 桌面容器与 Windows 分发；不是 Three.js 自带导出器 |

Three.js 代码为 [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE)。保留所复用代码的版权与许可证，示例中的第三方美术按各自来源另核对。

## 开源项目

### 官方 games_fps

[演示](https://threejs.org/examples/games_fps.html) · [源码](https://github.com/mrdoob/three.js/blob/dev/examples/games_fps.html)

研究 Capsule、Octree、静态场景与球体投射物的最小联动。它没有完整敌人、战役、存档和演出系统。其参数是示例参数，不能代替本项目 1.428 m/s² 与既定移动速度。网页请求返回 HTTP 200；本轮未进行实际输入试玩。

### Footprintarts ThreeJS FPS 2.0

[源码](https://github.com/Footprintarts/ThreeJS_FPS_2.0) · [作者演示视频](https://www.youtube.com/watch?v=DyjmXndgueg)

在官方 FPS 示例上拆分模块，增加 GLTF 武器／手臂、射击与换弹动画、声音。适合研究近景持枪与动画触发。射击部分仍有球体投射演示性质，不视为成熟战斗系统。

代码为 MIT；README 对 FPS Rig AKM 单独注明 J-Toastie／CC-BY。代码许可不能替代模型署名要求。已读 README 与代码片段，视频入口来自作者发布，本轮未播放验证或本地运行。

### Mugen87 DIVE

[源码](https://github.com/Mugen87/dive) · [演示](https://raw.githack.com/Mugen87/dive/master/app/index.html) · [作者技术文章](https://discourse.threejs.org/t/game-ai-how-to-implement-a-basic-deathmatch-shooter/7609)

研究 Yuka 的目标驱动 AI、导航网格、武器选择和拾取。演示提供观察与 FPS 控制模式；重点是 AI 机制。代码为 MIT，模型来自其他来源，复用资产另核对。

[package.json](https://github.com/Mugen87/dive/blob/master/package.json) 中 Three.js 为 `0.113.0`、Yuka 为 `0.7.0`。移植前需按项目版本检查 API。演示网页请求返回 HTTP 200；未完成实际战斗试玩。

### SimonDev Quick FPS1

[源码](https://github.com/simondevyoutube/Quick_FPS1) · [SimonDoom 演示](https://simondevyoutube.github.io/Quick_FPS1/)

研究实体／组件、加载管理、Ammo.js 物理、空间索引与射击特效。已读主入口与依赖定义；代码为 MIT。`package.json` 中 Three.js 为 `^0.130.1`，不是本项目版本建议。

演示网页请求返回 HTTP 200，但加载入口含远程 Ammo.js 脚本。因此仅验证网页入口可访问，未验证离线运行、实际玩法或 Windows 封装。

### mohsenheydari three-fps

[源码](https://github.com/mohsenheydari/three-fps) · [原演示地址](https://venolabs.com/three-fps-demo/)

研究实体／组件、Ammo.js 刚体控制、three-pathfinding、根运动动画和基础 NPC AI。代码为 MIT，README 单列 AK47、弹药箱、Mixamo 与环境素材来源。

[package.json](https://github.com/mohsenheydari/three-fps/blob/master/package.json) 中 Three.js 为 `^0.127.0`。本轮演示站 TLS／连接超时，不能标为可玩链接；源码和文档仍可参考。

## 补充线索

- [Containment / threefps](https://github.com/luckeyfaraday/threefps)：README 展示波次、弹药、重试与模块拆分，也明确写出导航／楼梯追踪尚弱。其托管演示本次 HTTP 404，不列为已验证入口。
- [SANDLINE](https://github.com/xilinnihao-afk/sandline-threejs-fps)：战斗、渲染、UI 与测试分层可参考。仓库明确说明第三方角色资产另行提供，clone 后不是完整可玩资产包。
- 交接已有 [FPS 调研](handoff/current/references/fps_research.md) 与 [原型经验](handoff/current/09_PROTOTYPE_LESSONS.md) 保留作为第二来源，其中旧版实际行为不能直接归于本仓库。

## 研究使用方式

每次取用代码记录来源 URL、提交或版本、许可、抽取的机制及本项目改动。用本项目场景验证 API 与行为，不以星数、演示截图或 MIT 标签推断完整性。

当前核查覆盖官方文档、项目 README、若干关键源码和入口连通性；没有完成逐项目本地构建、完整试玩、性能比较或 EXE 验证。本项目验收见 [技术规范](THREEJS_FPS_STANDARDS.md)。
