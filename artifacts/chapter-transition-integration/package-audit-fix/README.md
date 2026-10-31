# 章节旁白静态包审计修复

审计器 1.0.2 已识别本批独立旁白清单。最终静态审计 **0 error、227 review，状态 REVIEW_REQUIRED（exit 2）**，没有改称整包或运行时验收通过。原报告的 37 个 schema／路径解析误报已消除；旧报告保留在相邻 `package-audit/` 目录。

修改仅涉及 `scripts/submission/audit_package.py` 和 `scripts/submission/selftest.py`。未改音频、冻结清单、src、dist 或游戏测试，没有构建、浏览器、发布或提交。

## 明确检查

- 仅为显式选择的 `schemaVersion: 1`、`batch: chapter-bridge-01` 交付启用旁白规则。检查 complete、精确条数、唯一 cueId／文件、文字摘要、声音引用、生产依据和已记录授权结构；未知版本／批次不会获得豁免。
- 每项音频必须安全地相对于 manifest 所在目录解析。拒绝绝对路径、外部 URL、编码逃逸、父目录跳转、禁入目录和 symlink 逃逸；逐个读取并比较字节数、SHA 和音频头。制作依据只按本地记录检查，不增加试听审批或法律结论。
- 从通过校验且位于 public 内的显式清单生成确切的 `relativeFile → buildPath` 候选。再与实际 dist inventory 比较字节数与 SHA，才供 JS 字面量检查使用。最终 **31 条音频／4,230,356 B**、加 manifest 和 README 的 **33 个文件全部匹配**。
- 目录 base 只接受清单确认的真实目录、尾部 `/`，且调用是 `new URL(..., document.baseURI)` 或紧邻 return 的单参数 `document.baseURI` 默认 helper。没有通配忽略 `audio/`；fetch 目录、无尾斜线、其他目录、远程／未知 origin 和未列出文件仍失败。
- 保留旧音效／音乐清单的 id、CREDITS、README 和两份 provenance 要求。旧清单同时有 id 与 cueId 时仍采用旧规则；不是根据出现 cueId 就切换 schema。
- 保留签名 URL／私钥检查，并为旁白 JSON 检查敏感字符串字段。来源页中的授权对象和身份／声音摘要不被当成认证 header；测试确认敏感值不进入报告。

## 验证证据

[最终 selftest](selftest-02/package-audit-selftest.json) **54／54 通过**。包含合法旁白、未显式选择清单、缺源 MP3、缺 dist MP3、dist 被改动、重复 cueId、错误 SHA／bytes、明文及编码逃逸、外部 URL、未知 schema、secret／签名 URL、目录和 origin 限制，以及旧清单正反例。早期 52 项结果保留在 `selftest-01/`；第二轮增加远程／未知目录 origin 负例。自测合成文件已由既有 selftest 清理，只保留结果 JSON。

[最终审计 JSON](final-audit/package-audit.json)、[可读报告](final-audit/package-audit.md)、[文件 inventory](final-audit/source-inventory.json) 来自：

```sh
python3 scripts/submission/audit_package.py --root . --web dist \
  --audio-manifest public/audio/chapter-bridge-01/manifest.json \
  --out artifacts/chapter-transition-integration/package-audit-fix/final-audit \
  --label chapter-transition-integration
```

剩余 227 项为现有通用范围的 22 项 GLB 来源审查、204 项其他音频来源映射及 1 项 GPL 分发范围审查。本次只选择本批旁白清单，没有消除这些项目，也不把这些通用提醒转述为新发现的侵权或缺授权事实。

JS 检查仍不是 AST／全程序数据流分析。映射证明显式清单文件在选定构建中存在且字节相同，不证明所有调用者传入的 base、任意字符串计算、重定向或实际请求行为。其他 helper 形式可能仍需明确支持或运行请求记录。音频仅检查签名／头部及摘要，没有重新解码或试听；源码→dist 未重建，浏览器／Windows 为 NOT_RUN。最终审计未观察到输入变化，但共享工作区不是原子文件系统快照。
