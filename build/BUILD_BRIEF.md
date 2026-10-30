# 首轮构建说明

buildStage: whitebox

buildPath: custom

targetFinish: 当前先交可操作的风险验证候选；最终继承完整 Windows 比赛作品目标。

依据：[GAME_DESIGN](../design/GAME_DESIGN.md)、[ART_DIRECTION](../design/ART_DIRECTION.md)、[技术规范](../docs/THREEJS_FPS_STANDARDS.md)。最大风险是飞行弹丸／掩体与撤离事实能否形成可玩的循环，随后覆盖儿童视点及协作表演。

先实现 V2，共用系统按运行、输入／角色、弹丸、任务、表现分工；固定步长、固定随机 seed；方块代理与工业场景模块可替换。必须具备开始、键鼠真实操作、交火、工人到达、岗位交接、撤离、失败和重试。V1/V3 在这些接口上迭代。signature_command: N/A。

targetPlatform: Windows desktop

targetRuntime: Three.js + Electron 候选；最终 Windows EXE

testedRuntime: NOT_AVAILABLE: 尚未创建并启动运行候选

toolchain: NOT_AVAILABLE: 创建工程时锁定实际版本

commands: NOT_AVAILABLE: 创建运行工程后记录可执行命令

verification.owner: 当前开发会话

verification.evidence: `artifacts/final-evidence.md`（待实际运行后生成）

未验证：本轮尚无游戏运行，未生产正式模型、语音、完整战役或 Windows 安装包。Mac 浏览器检查与 Windows 实机验收分别记录。
