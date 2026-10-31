# 尾声局部功能检查的真实检查点

两份 `.json` 均为 `tests/finale-paths.test.ts` 在正式环境几何中从章节入口通过公开 `Intent` 自然推进后，实际经 `SaveStore` 生成的原始 envelope。生成入口：

```sh
RECORD_VISUAL_FIXTURES=1 npm test -- tests/finale-paths.test.ts
```

2026-10-31 的本次记录仅在 `!skip && !restore` 分支首次进入对应阶段时输出，随后将原件与 `.source.json` 原样复制到本目录。原散列、阶段、时间及来源测试保存在对应的 source 文件；局部检查每次读取都会校验原散列并经过正式存档解析。

- `rescue-4.json`：实际接手孟齐后的协作搬运起点。
- `epilogue-7.json`：玩家实际打开接收门后的扶门起点，人员尚未过门。

`tests/finale-interactions.test.ts` 恢复这些检查点，验证碰撞阻停/后退、占用双手、扶门离位与回位等局部功能。其中患者侧边障碍是明确标记的测试故障注入；没有修改人物位置、伤害、生命值或任务事实来伪造进度。Q 掩护测试则从 S10 实际初态运行。它们是机制回归证据，不是完整人工通关或正式动画验收。
