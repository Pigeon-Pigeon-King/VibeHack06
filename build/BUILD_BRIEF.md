# 当前构建说明

buildStage: whitebox

buildPath: custom

targetFinish: 当前先交可操作的风险验证候选；最终继承完整 Windows 比赛作品目标。

依据：[GAME_DESIGN](../design/GAME_DESIGN.md)、[ART_DIRECTION](../design/ART_DIRECTION.md)、[技术规范](../docs/THREEJS_FPS_STANDARDS.md)。最大风险是飞行弹丸／掩体与撤离事实能否形成可玩的循环，随后覆盖儿童视点及协作表演。

当前 0.2.0 接入 S03 夜班工作、S04 三处相连遭遇与九名技工接应，通过完成页连续转场；V2、V1、V3 保留为独立缩短验证场景。它们共用固定 60 Hz 仿真、输入、身体、弹丸、事实、表现模块；新增本机存档、设置恢复、事实驱动门碰撞与导航更新。方块代理与工业场景模块可替换，具体覆盖见证据。signature_command: N/A。

targetPlatform: Windows desktop

targetRuntime: Three.js + Electron 候选；最终 Windows EXE

testedRuntime: Mac 内嵌浏览器，已用真实键盘输入观察移动／交互／射击命中／暂停；桌面容器与 Windows 实机状态见持续证据。

toolchain: Node 22.14.0、npm 10.9.2、TypeScript 7.0.2、Vite 8.3.5、Three.js 0.186.0、Rapier compat 0.21.0、Vitest 5.0.5、Electron 45.1.0。依赖精确固定，版本锁在 package-lock.json。

commands:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run desktop
npm run package:win
node scripts/inspect-package.mjs
```

`desktop` 加载先前 `build` 产生的本地 dist；修改代码后需要重新 build 再启动。Mac 此机 Node 未在默认 shell PATH，可临时将 `/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin` 加入 PATH，不改变全局设置。

Electron 下载在本机通过已有系统代理对应的进程级 `HTTP_PROXY`／`HTTPS_PROXY` 与 `ELECTRON_GET_USE_PROXY=1` 完成；没有修改系统代理或把个人网络地址写入打包脚本。`inspect-package.mjs` 检查 EXE 架构、应用包目录、打包文件与当前 dist／桌面源码的一致性，并生成散列清单；它不运行 Windows 游戏。

verification.owner: 当前开发会话

verification.evidence: 当前 `artifacts/chapter-evidence.md`；首轮历史 `artifacts/final-evidence.md`；测试在 `tests/`。

物理选择：Rapier 运动学胶囊＋简化静态盒，固定 1/60 秒；NPC 按带间距的网格导航。弹丸独立积分并逐段扫掠，飞行重力 1.428 m/s²；射手胶囊排除，最近遮挡优先。枪口目前为保守物理代理，低掩体阻挡有反例测试，最终骨骼枪口对齐仍待正式动画。

存档采用 schema/version 包装、阶段及字段校验、稳定角色 ID／入场编号校验，主记录加上一份有效备份。损坏记录可只读回退，后续覆盖前保留损坏原文；未来版本拒绝覆盖。检查点包含人物、路径、随机状态、弹药、任务与门事实；恢复会清空旧弹丸并重建物理世界。写入失败可见，不取消本次内存检查点。浏览器刷新与设置恢复已有操作证据，Electron 重启恢复尚待原生运行验收。

限制：五个入口的资产和演出仍为开发白盒，不能计作完整战役或正式表演。S03／S04 是可连续游玩的第一关前段，尚缺完整 S01／S02、S05—S12 与其全部遭遇和动作。没有正式模型、录制语音、细致人物接触或正式存档迁移／跨设备导入。多人搬运仍采用位置锚点，尚未完成可碰撞担架。Mac 浏览器与 Windows 实机证据分开记录；内嵌浏览器拒绝 Pointer Lock，不能据替代按键声称鼠标已验证。
