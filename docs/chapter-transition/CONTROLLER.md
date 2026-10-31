# 章节衔接控制器

`src/chapter-transition/TransitionController.ts` 是不依赖 DOM、Three.js、Web Audio 或存档的独立状态机。字幕旁白与下一段预加载同时启动；叙述结束或被跳过，并且预加载成功后，控制器才在未暂停的 `tick` 中调用一次 `enter`。

当前验证是独立状态机的自动测试。实际场景激活、输入隔离、桌面／手机画面与音频解锁由宿主接入后另行验证；本模块通过不能替代整场游戏验收。

## 接入 API

类型由 `src/chapter-transition/types.ts` 导出：

```ts
const transition = new TransitionController<PreparedChapter>({
  preload: (bridge, signal, onProgress) => prepareChapter(bridge.to, signal, onProgress),
  enter: (prepared, bridge) => activateChapterAtomically(prepared, bridge),
  release: prepared => prepared.dispose(),
  narration: {
    play: (cue, signal) => voicePlayer.play(cue, signal),
  },
});

transition.start(bridge);
transition.setPaused(gamePaused || document.hidden);
transition.tick(activeDtSeconds);
renderTransition(transition.snapshot);
```

| 方法 | 行为 |
| --- | --- |
| `start(bridge): boolean` | 新运行返回 `true`。同 ID 在 active／entered 中重复调用返回 `false`；不同 ID 会先取消旧运行。取消后允许用相同 ID 重开。 |
| `tick(dtSeconds): void` | 唯一推进字幕、提交切场的位置。接受有限非负秒数；0 可处理已到达的音频／加载结果，负值、NaN、Infinity 被忽略。 |
| `skip(): void` | 跳过整个过场叙述，停止并取消当前旁白。不会取消加载、清除加载错误或同步切场。暂停期间不响应。 |
| `setPaused(boolean): void` | 冻结阅读时间和切场，暂停／恢复当前声音；加载仍可在后台完成。 |
| `retryLoad(): boolean` | 仅在预加载失败时重试，返回是否启动。不会重新播放、停止或跳过现有叙述。加载中重复重试无效。 |
| `cancel(): void` | 幂等地取消运行、停止旁白、释放尚未交给宿主的已准备资源。 |
| `dispose(): void` | 取消后永久关闭控制器；以后不能 `start` 或重试。 |
| `snapshot` | 当前只读视图；宿主不应修改其桥段与提示数据。 |

`snapshot` 包含 `phase`、`bridge`、`paused`、`loadState`、`loadProgress`、`narrationState`、`cue`、`cueIndex`、`cueCount`、`cueElapsedSeconds`、`error`、`canSkip` 和 `canRetryLoad`。`loadProgress` 为单次尝试内单调的 0..1；未提供可用数值时为 `null`。`error.stage` 区分 `load` 与 `enter`，`message` 供 UI 显示，`cause` 保留原始诊断。

`phase` 为 idle／active／entered／cancelled／disposed。加载失败仍处于 active，可继续听旁白并重试。叙述结束但加载未完成时，`cue` 为 null、`narrationState` 为 complete 或 skipped，宿主显示等待加载状态。

## 新战役开场

`ChapterBridge` 保持真实章节之间的 `from: ChapterStageId`。新增 `CampaignOpening` 使用 `from: null`、`to: 'S01'`；`TransitionScript` 是两者的联合类型。控制器和浏览器外壳的 `start`、ports 的 `preload`／`enter`、`snapshot.bridge` 接受该联合类型，沿用 `bridge` 字段和原来的加载／旁白门控，不新增状态。

`planCampaignEntry(intent)` 是纯计划函数。只有 `new-game` 和 `restart-campaign` 返回 `{ bridge: CAMPAIGN_OPENING, chapter: { chapter: 'campaign', stage: 'S01', elapsedBefore: 0 }, scenario: 'childhood', facts: [] }`；`continue`、`retry-checkpoint`、`restart-stage` 和 `validation` 返回 undefined。它不读取或写入检查点。`from: null` 只是开场元数据，不创建 S00，也不产生或继承任何任务事实；原来的 `planCampaignTransition` 继续负责真实章节间的过关衔接。

宿主在玩家确认新游戏或重开战役后，先 `cancel` 旧过场，再 `start(plan.bridge)`。取消旧运行也使已进入过 S01 的同 ID 开场可以明确重播。准备 S01、播放旁白或跳过旁白期间均保留原存档；玩家取消开场或加载失败时仍能回到旧进度。仅在 S01 准备好、叙述完成且未暂停的 `enter` 中，宿主原子激活 S01 并提交新战役存档。

## 音频与时间

`narration` 可省略。`play(cue, signal)` 返回 `{ finished, pause, resume, stop }`，其中 `finished` 为 `Promise<'ended' | 'unavailable'>`。正常音频由真实 ended 事件推进下一条字幕；静音仍应正常播放时间线并结束。缺失、加载失败、解码失败或禁止播放应结算 unavailable，Promise 拒绝或 `play`／`pause`／`resume` 抛错也会进入阅读降级。

阅读降级按当前字幕已经显示的活跃时间计算 `readingSeconds`，取值规范为 2..45 秒，非有限值取 6 秒。没有音频时，慢帧可把剩余秒数继续分配给后续字幕；有声音 ended 事件时不把事件之前的帧时间算到下一句。模块不限制正常 dt，避免十秒字幕被低帧率的步长上限拖长。

如果音频适配器始终不结算，控制器在该句 `max(30, readingSeconds * 3)` 秒活跃时间后停止声音并按阅读降级收束。这仅是声音异常保护；下一关加载没有固定超时。暂停不累计该保护时间。宿主必须把菜单暂停、失焦与后台状态传入 `setPaused`，恢复后传新的活跃帧时间，不能补传隐藏期间的累计时间。

加载与声音 Promise 的回调只记录结果，不直接推进字幕或调用 `enter`。后台收到 ended／加载成功时保留当前字幕与场景；解除暂停也不直接提交，须等待下一次 `tick`。

## 资源、存档和错误契约

1. `preload` 应尽快返回 Promise，在内部异步准备下一场所需资源；不能提前替换当前场景、改任务事实或写入下一章存档。`AbortSignal` 只管本次准备生命周期，不能作为未来已激活场景的销毁信号。
2. 控制器在加载成功后拥有 `prepared`。取消、替换运行或销毁时调用 `release`；旧请求忽略 abort 后才返回的结果也会被释放。失败的预加载没有可交回结果，内部局部资源须由预加载器自行清理。
3. 仅 `enter(prepared, bridge)` 成功返回后，所有权归宿主。它必须是同步、原子的激活提交；场景、当前章节、存档、输入清理应一致完成。控制器不会再释放成功转交的数据，宿主后续负责销毁场景。
4. `enter` 抛错表示没有完成任何激活或存档变更；控制器释放该准备值，保留 `error.stage='enter'`，不再次调用 `enter`，也不允许 `retryLoad`。宿主应提供返回菜单等恢复动作；如果宿主会在抛错前写盘或部分切场，需先在宿主实现回滚，控制器不能替它回滚。
5. `release` 与音频 `stop` 应幂等且不抛错。控制器会吞掉清理异常以完成取消；宿主负责记录清理失败和实际资源回收。

## 宿主必须负责的条件

- 章节衔接仅在连续战役段落真正完成且存在下一段时调用 `start`；普通失败、未完成段落和最终 S12 都不能发起过关过场。新战役开场由 `planCampaignEntry` 的明确意图单独选择。状态机不读取任务系统，不会假完成战斗。
- 遮罩出现后隔离游戏输入。触发跳过的点击须被消费，直到新关开始前清空按键、鼠标和触屏状态。不能让同一次点击成为下一关的开火。
- 切回菜单、重开、读取检查点或替换流程时调用 `cancel`；销毁应用时调用 `dispose`。
- 加载失败时显示 `error` 和重试动作。`canRetryLoad` 为 false 的进入错误应走宿主恢复流程。

## 独立验证

`tests/chapter-transition/controller.test.ts` 用 deferred Promise 与 fake voice 覆盖并行启动、两种完成顺序、跳过后等待加载、一次性提交、真实 ended 推进、无音频／异常声音降级、异常适配器保护、暂停和后台结果、加载失败重试、进度输入、取消／替换／销毁的迟到资源释放、进入错误以及异常时间参数。

`tests/chapter-transition/entry-plan.test.ts` 验证新游戏／重开战役有开场、续档与关内恢复不重播、入口状态不污染下一次计划，以及开场复用双门控、跳过等待加载、取消保留旧档、明确重播和 null 来源的类型边界。这些测试使用宿主替身记录提交，不证明主战役的真实存档已经接线。

定向运行：

```sh
node node_modules/vitest/vitest.mjs run tests/chapter-transition/controller.test.ts tests/chapter-transition/entry-plan.test.ts
```
