# Detached 关卡准备与真实资源预载

2026-10-31。本模块只构造／准备下一关，不负责章节确认、叙述、输入、存档或活动场景切换。没有修改 main、UI、Sound、SaveStore、人物适配器或已有场景资源模块。未提交、构建、浏览器运行或发布。

## 接口

```ts
import {
  createGameLevel, prepareGameLevel,
  type PreparedGameLevel, type GameLevelOptions,
} from './chapter-transition/PreparedGameLevel';

const options: GameLevelOptions = {
  scenario, saved, facts, baseURL: document.baseURI,
};
const level = createGameLevel(modelLibrary, options); // 同步；不额外预热人物
const prepared = await prepareGameLevel(modelLibrary, options, signal, fraction => {
  // fraction: 0..1，直接适配 TransitionPorts.preload 的进度回调。
});
```

以上两种构造方式二选一，不应为同一目标关同时调用。参数 `saved / facts` 可省略。共享库接受 `Pick<ModelLibrary, 'acquire'>`；实际宿主传已有 `ModelLibrary`，不创建第二套下载／GPU 资源池。

`PreparedGameLevel` 公开：

- `environment: EnvironmentModel`、`sim: Simulation`、`scenery: GeneratedSceneAssets`。
- `sceneAssetErrors: Set<string>`：该关自身的 placement 错误；同步构造后的异步回调继续更新此 Set。宿主应保留其引用，不能只复制一次。
- `warmAssetErrors: Set<string>`：预热未成功的 source ID；这表示可使用现有白盒降级，不冒充正式模型准备完成。
- `isDisposed: boolean` 和幂等 `dispose()`。

类也提供同签名 `PreparedGameLevel.prepare(...)`；宿主优先使用顶层 `createGameLevel / prepareGameLevel` 即可。

## 实际准备的内容

同步路径调用真实 `buildEnvironment`、`Simulation` 和 `GeneratedSceneAssets`。环境 root 保持 detached；scenery 只挂在该新环境内，不挂到游戏 Scene。不会调用 `Simulation.step`、环境 `update/setFacts`、音频或 SaveStore，也不改变旧关的错误集合。现有 Simulation/Physics **构造函数内部**仍进行原本的物理初始化 step，以及初始内存 checkpoint；本模块没有重写这些构造行为，不能将“不推进任务 tick”误报为底层完全不执行初始化。

异步路径真实等待 `scenery.ready`，并对初始 `sim.actors` 计算人物资源：

- 使用现有 `characterAssetFor / characterSource`；有正式人体时只加一次 `canonicalWalkSource`。
- 与当前 main 分流一致，序章的匿名 civilian（`late-civilian- / evac-crowd- / civilian-`）走 CrowdView，不额外预热人体；cart 也不预热人体。
- ally、enemy、opponent、father 或 `hall-invader-*` 的旧武器 socket 对应一次 `ak47Source`。
- 按 `id / revision / URL` 去重。最多两个额外人物／动作／武器预热 worker；场景模块仍使用自己的原并发策略。

进度任务总数为“一个 scenery 批次 + 去重后的模型数”。只有真实任务成功或完成可降级失败，完成数才增加；没有时间插值、定时器或假加载百分比。场景 promise 完成但含 cancelled 状态仍拒绝，pending/loading 状态则是结构性 readiness 错误。构造或意外的 scenery.ready 错误拒绝并释放已构造的所有者；普通下载／解码错误保留现有可用代理并记录错误 ID。

预热成功的租约保持在 level 内直到该关 `dispose()`，确保后续角色实际 acquire 复用已解码模板。预热不改模板、不创建人物演出对象、不播放 canonical clip。后续动态生成的角色仍由原适配器按需加载。

## 取消与所有权交接

预载取消会立刻 dispose 整个新 level；即使 scenery.ready 未结束也及时返回 `AbortError`。acquire 已 resolve 但 continuation 尚未执行，以及 loader 忽略 abort 后迟到的租约，都会及时归还。取消不会被记成成功的代理降级。

成功返回后外部 signal 监听移除，level 转由调用者拥有。若外层 TransitionController 在成功后、实际接收前发现请求过期，它已有的 late-result `release(prepared)` 路径应调用 `prepared.dispose()`；不要期待已 fulfilled 的 Promise 被撤回。进入活动关后也只 dispose 该 level 一次，不再分别重复释放 sim/scenery/environment。Game 仍拥有 ModelLibrary 本身。

释放顺序为 scenery → 预热 leases → Simulation → 环境 detach／dispose；scenery 的借用子树先退出环境通用遍历。库中旧关或第一人称仍持有的共享资源不会提前释放。单个释放回调异常会记录警告并继续处理其余所有者。

## 本次专门验证

最终仅运行 `tests/chapter-transition/prepared-game-level.test.ts`：**18/18 PASS**，测试用时约 133ms，总用时约 356ms。JSON 为 `focused-tests.json`。首次 17 项通过后，追加了“scenery.ready 正常 resolve 但状态为 cancelled 也必须拒绝”的独立边界用例，再运行同一文件取得最终 18 项结果。

覆盖真实 Environment/Simulation 的 detached 构造与不推进／不存储；真实 GeneratedSceneAssets.ready 的等待与 slot 成功替换；真实 ModelLibrary 的模板复用、活动旧租约和最后所有者释放。其它构造边界使用受控模块 mock，以验证结构异常回滚、状态隔离、实际完成进度、预热失败降级、预先取消、同步进度回调取消、已 resolve 迟到和忽略 abort 后迟到。不是只检查函数是否存在。

本模块及专门测试的 isolated TypeScript 检查通过，日志为 `typecheck.log`；代码和测试摘要与命令见 `validation.json`。没有运行全套测试或构建。

本测试不加载供应商图片，不证明真实贴图解码、GPU 上传／着色器预编译、首次绘制卡顿、浏览器交互、完整过场体验、手机或 Windows 结果。prepare 完成表示源码约定的载入／解码任务已结束，可降级项已记录；它不是整帧渲染或视觉验收。
