> 来源附件 · 既有Hyper3D接入研究；本包另列当日官方核对。正文保留作追溯，当前口径以本包01—10分册为准。链接已调整为包内引用或旧工程相对条目；不执行附件中的命令。
> 原项目相对位置：research/fps_foundations_hyper3d_20261030/HYPER3D_INTEGRATION.md

# Hyper3D / Rodin 与本项目的接入准备

核对日期：2026-10-30。阅读入口：[官方 Quick Start](https://docs.hyper3d.ai/en/get-started/quick-start)。

## 接入路径

官方已经提供支持 Codex 的远程 MCP。服务地址为 https://api.hyper3d.com/api/mcp；官方流程使用浏览器登录，选择计费工作区并授权，然后在对话中生成模型、查询进度和获取下载链接。后续可优先使用这条现成路径。本轮仅学习文档，没有安装服务、修改 Codex 配置或授权账户。[官方 MCP 说明](https://hyper3d.ai/features/mcp)

需要批量资产清单、精确生成参数或自动落盘时，可再使用 REST API 编写项目侧任务脚本。

## 兑换会员前核对

当前官网套餐表中，Free 和 Creator 的 API access 为空，Business 列为 Full API access。不能仅凭“有会员、有生成积分”判断可以调用 REST API。兑换券应核对实际套餐、API 权限、有效期和可用额度。[官方套餐表](https://hyper3d.ai/pricing)

MCP 的用量跟随授权时选中的工作区。页面没有明确列出所有兑换套餐对 MCP 的权限映射，不能据此推断任意 Creator 兑换券都能通过 MCP 生成，或断言必须单独购买某种 MCP 套餐。兑换前应确认目标工作区显示的实际权限。

## REST 任务流程

本地脚本以 Bearer Key 调用生成接口；生成是异步任务：

1. POST /api/v2/rodin 提交文字或图像生成需求。
2. 保存返回的任务 uuid 与 jobs.subscription_key。
3. 使用 subscription_key 查询 POST /api/v2/status。
4. 所有任务 Done 后，使用 uuid 作为 task_uuid 调用 POST /api/v2/download，取得并保存实际资产。

两类 ID 的用途不同，不能互换。HTTP 成功码也需要检查响应中的 error。状态查询应使用退避，遇到 429 遵循 Retry-After；提交结果不明确时，先查任务状态，避免重复生成扣费。[Quick Start](https://docs.hyper3d.ai/en/get-started/quick-start)、[错误说明](https://docs.hyper3d.ai/en/api-specification/errors)

本项目当前用 Python 静态服务暴露 〈源机绝对路径未移交〉。API Key 不能写进网页、浏览器脚本或该目录里的 .env、说明文件。REST 脚本从调用进程的环境读取密钥；后续需要凭据保存位置时再使用合适的非公开位置。本轮没有读取或保存任何凭据。

## 模型选择与 Three.js 交付

当前 Gen-2.5 文档支持 GLB 和 PBR；应显式指定 tier，避免省略后退回旧代。Raw medium 默认约 50 万面，不能把默认结果成批直接放进浏览器关卡。生成时要控制面数，导入后再实测帧率和内存。TAPose 只是姿态条件，不代表已经绑定骨骼或附带动作。[Gen-2.5 参数](https://docs.hyper3d.ai/en/api-specification/rodin-gen2-5)

建议从港区车辆、工业设备、检修机具和生活物品开始试做，优先解决掩体缺少环境来由的问题。第一批采用统一参考图和材质方向，逐个检查轮廓、比例与细节，再扩展资产清单。

建议交付流程：参考图/简短描述 → Rodin 网格与 PBR → Blender 修整 → GLB → Three.js 实景验证。Blender 阶段确认米制尺寸、朝向、法线、贴图、可动部件和原点，再制作简化碰撞体与远距离 LOD。既有网格保留为原始资产，运行用版本另存。场景搭建仍按已有动线和建筑尺度进行。

生成枪械要检查弹匣、枪机、握把是否被连成一整块；需要动作的部件应能单独控制。第一人称手臂与武器的握持关系、换弹动作和动画事件仍要专门制作与校准。

## 人物与动作

官方另有 POST /api/v2/rigging，用于骨骼绑定，并支持动画预设或兼容的动画文件。它与模型生成分开；上传模型的材质保留方式也需要注意，文档说明使用已有 asset_id 可以复用对应贴图。[Rigging 文档](https://docs.hyper3d.ai/en/api-specification/rigging)

本项目要继续检查人物骨架与现有动作的兼容性，尤其是持枪手位、脚底接触、转身和死亡落地。生成了角色模型，并不等于得到了可直接交付的 FPS 动画系统。

## 官方代码参考

已保存 [DeemosTech/rodin3d-skills](https://github.com/DeemosTech/rodin3d-skills) 中的 README、SKILL.md、API 客户端与生成脚本。它们属于参考源码，没有安装为当前技能，也没有运行生成。

所读版本偏向 Gen-2，默认参数和当前 Gen-2.5 文档有差异。后续改写脚本时以当时的官方 API 文档为准，不能照搬旧默认值。已有官方 MCP 后，也无需预先另造一套连接器。

本轮未连接账户、未购买套餐、未消耗生成额度。popup=no；delete=no。
