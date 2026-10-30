# 当前构建说明

buildStage: whitebox

buildPath: custom

targetFinish: 当前先交可操作的风险验证候选；最终继承完整 Windows 比赛作品目标。

依据：[GAME_DESIGN](../design/GAME_DESIGN.md)、[ART_DIRECTION](../design/ART_DIRECTION.md)、[技术规范](../docs/THREEJS_FPS_STANDARDS.md)。最大风险是飞行弹丸／掩体与撤离事实能否形成可玩的循环，随后覆盖儿童视点及协作表演。

当前 0.4.0 连通 S01—S07；V2、V1、V3 保留独立缩短验证入口。Simulation 保持状态权威，Opening／Frontgate／Transfer／Flank 组织各段，共用60Hz仿真、弹丸、导航、检查点和表现。S06三辆患者车实际通过再争执，S07真实作战、撤回、人车分流、完整共享与换班需求已实现。旧 L1 存档保持兼容。方块人物和工业场景仍是占位，成年闻川已有 ImageGen 概念但尚无模型。signature_command: N/A。

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
npm run check:transport
npm run build
npm run desktop
npm run package:win
node scripts/inspect-package.mjs
```

`desktop` 加载先前 `build` 产生的本地 dist；修改代码后需要重新 build 再启动。Mac 此机 Node 未在默认 shell PATH，可临时将 `/Users/penguin/.local/node-runtime/node-v22.14.0-darwin-arm64/bin` 加入 PATH，不改变全局设置。

Electron 下载在本机通过已有系统代理对应的进程级 `HTTP_PROXY`／`HTTPS_PROXY` 与 `ELECTRON_GET_USE_PROXY=1` 完成；没有修改系统代理或把个人网络地址写入打包脚本。`inspect-package.mjs` 检查 EXE 架构、应用包目录、打包文件与当前 dist／桌面源码的一致性，并生成散列清单；它不运行 Windows 游戏。

verification.owner: 当前开发会话

verification.evidence: 当前 `artifacts/transfer-evidence.md`；0.3 历史 `artifacts/opening-evidence.md`；0.2 历史 `artifacts/chapter-evidence.md`；首轮历史 `artifacts/final-evidence.md`；测试在 `tests/`。

物理选择：Rapier 运动学胶囊＋简化静态盒，固定 1/60 秒；NPC 按带间距的网格导航。弹丸独立积分并逐段扫掠，飞行重力 1.428 m/s²；射手胶囊排除，最近遮挡优先。枪口目前为保守物理代理，低掩体阻挡有反例测试，最终骨骼枪口对齐仍待正式动画。

存档采用 schema/version 包装、阶段及字段校验、稳定角色 ID／入场编号校验，主记录加上一份有效备份。损坏记录可只读回退，后续覆盖前保留损坏原文；未来版本拒绝覆盖。检查点包含人物、路径、随机状态、弹药、任务与门事实；恢复会清空旧弹丸并重建物理世界。写入失败可见，不取消本次内存检查点。浏览器刷新与设置恢复已有操作证据，Electron 重启恢复尚待原生运行验收。

限制：十个场景 ID 的资产与演出仍属开发候选。S01—S07 有模拟输入完整路径；S06 浏览器完成含检查点恢复和跳过，S07 浏览器已实际登梯、转向、射击与受伤，完整首通未做。仍缺 S08—S12、完整一小时实测、生成模型、录制语音、精细人物接触和担架救援。患者车已有床体环境碰撞，任务角色之间不互相挤压。IAB拒绝Pointer Lock；Windows真实鼠标、声音、长时性能、启动与存档恢复仍待实机。
