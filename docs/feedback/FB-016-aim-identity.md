# FB-016 · 准星下方人物姓名

日期：2026-10-31。状态：独立查询与 HUD 模块已实现，16 项专项通过；主入口移除人物头顶标签与接线由整合窗口负责。没有浏览器视觉或手机／Windows 验收结论。

## 用户要求与现状

移除所有人物头顶姓名，只在准星对准可辨认的人物时，于准星下方显示当前姓名或剧情称呼。普通敌兵不显示，重要敌方人物使用精确白名单并遵守身份揭示。此项不增加血条、距离、说明文字或新的悬空 Sprite。

原 `main.ts` 为非敌方、非部分批量群众建立人物 Sprite 标签，距玩家 24 米内且未倒地便显示，不检查玩家实际瞄准或墙体遮挡。邵原在 S02 额外受 `shao-identified-by-zhou` 保护。S08 的邵原只存在于独立监控画面，不是 Simulation 的世界角色；本次不将监控人物加入世界可瞄准目标。

## 实现

`src/presentation/AimIdentity.ts` 提供 `queryAimIdentity`。宿主传入当前渲染相机的位置、世界方向、真实 Physics、人物列表、场景和事实。模块归一化方向并只执行一次最长 24 米的 `Physics.trace`，排除玩家自己的物理体。先确定最近实际命中，再判断是否可显示身份；不预先过滤无名角色后继续搜索。因此墙、前排普通敌兵、匿名居民及不可见角色均能挡住后方姓名。

结果保留 `{ hitId, target }`；`target` 是 `{ id, name, tone }` 或 `null`。完全未命中返回 `null`。命中但不能显示的对象保留 `hitId`，使 HUD 能立即清除上一个姓名，不在墙或普通敌兵上继续淡出错误人物名。

身份规则：

- `enemy` 与 `opponent` 默认无名；重要敌方白名单目前只有精确 ID `shao`，不能由角色类别、姓名字串或模型反推。
- S02 必须已存在 `shao-identified-by-zhou`。S01 儿童不会继承这个事实来辨认邵原。后续场景读取已共享的报告／离开确认，或当前主角自己获知的时间事实；周延的私有事实不能向闻川自动开放身份。
- 非敌方先检查 `actor.name` 已经提供的明确实名，再排除批量 ID。S04 虽把罗敬存为 `worker-0`，其当前实名仍显示；其它普通 `worker-N`、`walker-N`、`relief-N`、批量医护及序章群众不显示。
- 单独剧情人物保留当前的原称呼，例如“医院联络员”“年轻的驻军士兵”“带孩子撤离的女人”。不会从资产目录将它们改成尚未揭示的姓名。
- 倒地、零生命、车辆／担架和空名字不显示。角色可见性由宿主现有表现状态提供；不可见角色的物理命中不会被穿过。

`src/ui/AimIdentityHUD.ts` 是独立 DOM 控件。它仅使用 `textContent` 写姓名，不解析 HTML；文字固定在准星中心下方 29 CSS 像素处，14—16 像素字，友方淡青、重要敌方淡红，透明背景和暗色文字阴影。现有 30×30 命中叉旋转后的范围不进入姓名起始区域。CSS 不改变原准星或命中确认。

淡入为 100 毫秒，移至空处最多 80 毫秒淡出；换到另一个名字时立即替换内容，命中墙或无名对象立即清空。减少晃动模式取消淡入淡出。宿主传 `visible=false` 时立即清空，适用于菜单、暂停、固定演出、正式章节过场、死亡和完成页。模块不注册 RAF、全局事件或定时器；`dispose()` 同时删除自己创建的文字与 style 元素。

## 最小入口接线

1. 导入 `queryAimIdentity` 与 `AimIdentityHUD`。在 `GameUI` 创建后建立一个 `new AimIdentityHUD(document.querySelector('#game-ui')!)`，避免 GameUI 初次构建覆盖其节点。
2. 每帧完成相机姿态和人物可见性更新后，使用实际相机位置和世界方向查询；不要使用仍未更新的玩家 yaw、宽范围圆锥或人物距离排序代替射线。已有 `forward` 若来自当前相机 quaternion，可直接复用。

```ts
const visible = active && m.control !== 'staged' && !m.failed && !m.complete && p.health > 0;
const hit = visible ? queryAimIdentity({
  physics: sim.physics,
  actors: sim.actors,
  cameraPosition: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
  worldDirection: [forward.x, forward.y, forward.z],
  scenario: sim.scenario,
  facts: m.facts,
  isActorVisible: id => this.characters.get(id)?.model.root.visible === true,
}) : null;
this.aimIdentity.update(hit, dt, visible, this.lowMotion);
```

若正式章节过场控制器在 `mode==='playing'` 时仍遮盖画面，须再将其可见／激活状态纳入 `visible` 的否定条件。切场景、重试和导入时可先调用 `update(null, 0, false)` 清空；Game 的 `dispose()` 调用本控件的 `dispose()`。

3. 从人物 `characters` 项中移除 `label` 字段、创建与改名、世界位置／缩放更新和各处释放分支。移除人物标签后再检查该 `label()` 工具的其它用途；场所说明、目标世界标签和右上数据面板由整合窗口另行处理，本模块不会修改它们。

## 验证

命令：`npm test -- tests/aim-identity.test.ts --silent=false`。Node 22.14.0，**16 项通过**；`npm run typecheck` 与 `git diff --check` 通过。

测试读取真实 Simulation 的 S04 罗敬、S01 剧情称呼与匿名群众；使用真实 Rapier 物理体、玩家胶囊、墙／门与 Three.js 透视相机证明最近命中、遮挡、24 米范围及旋转／俯仰方向。另检查邵原精确白名单与人物私有知识、无名敌人不因姓名字串放行、移开／换目标／宿主隐藏、减少晃动、安全文字写入和两实例独立释放。

DOM 生命周期测试采用最小节点适配器，不等于真实浏览器字体、布局、CSS 遮盖或动画观感验收。浏览器工具被 Work 设置禁用，本轮未调用浏览器或 Playwright。待入口接线后，仍需检查人物头顶 Sprite 确已全部去除，正常与窄横屏下姓名和交互提示／字幕不重叠，以及桌面、手机实际可读性。

本项只新增 TypeScript 与内嵌 CSS，不新增、下载或生成美术资产。
