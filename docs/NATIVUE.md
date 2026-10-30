# Nativue 项目架构画布

本项目使用本地 Nativue CLI 建立有文档、代码和测试证据的架构图。配置为中文、Codex、manual 模式；通过当前会话读取分析包并导入语义结果。后台模型 runner 与远程同步均未启用。

## 画布的含义

当前材料同时包括交接与设计文档、共享运行模块、三个缩短白盒、回归测试和实际输入证据。完整一小时战役、正式资产和 Windows 实机交付仍是计划节点，不能因为已有便携包而标成完成。

- observed：引用的文档要求、代码职责或实际存在的资源。
- inferred：拟定的系统关系、未完成的内容扩展与生产流程。
- verified：仅用于有实际测试／运行记录支持的窄范围能力；节点描述必须同时说明验证边界。

玩家输入、弹丸、导航、任务、控制权、场景／UI 与桌面容器引用实际源码；三条验证线引用测试和 [首轮证据](../artifacts/final-evidence.md)。图中的“已验证”不代表生产质量、真人可玩性或 Windows 全部通过。原始设计图保留不变。

点击节点查看职责与证据，沿边查看需求约束和当前代码关系。旅程区分已有白盒回放、资产制作路线和下一阶段完整战役扩展。

## 本地启动

在项目根目录运行已安装的 CLI：

```sh
nativue serve . --port 4317
```

终端会输出实际访问地址。若端口占用，可换端口或使用 `--port 0` 让系统分配；以终端返回的本机 URL 为准。服务只监听本机回环地址。

当前工作区已初始化；不要重复 init 覆盖现有配置。新电脑首次建立可使用：

```sh
nativue init . --tool codex --language zh --mode manual
nativue doctor .
nativue scan .
nativue analyze .
```

## 文档或代码变更后的刷新

1. 运行 `nativue scan .` 和 `nativue analyze .`。
2. 读取 `.nativue/analysis-request.json`，按其中真实 inputId、文件索引和项目变更重新分析。
3. 将 schemaVersion 为 1 的 modules、edges、journeys 保存到 `.nativue/analysis-response.json`。所有证据引用现存且被索引的路径与行号。
4. 运行 `nativue import-analysis .nativue/analysis-response.json .`。
5. 运行 `nativue doctor .` 与 `nativue check .`，再查看图中证据和关系。

源文件改变会使旧分析过期；应重新读新的分析包，不通过替换旧结果的 inputId 强行导入。服务的文件扫描可以自动刷新，语义更新仍由交互分析完成，不能称为已启用无人值守模型分析。

## 来源与本机状态

`.nativue/` 已由 Git 忽略，里面保存配置、真实请求、分析结果和运行状态。源版本与文件散列由扫描记录；以当前快照中的 branch、commit、dirty 和 analysis.status 判断版本。

原交接图 [product-graph.json](handoff/current/architecture/product-graph.json) 是另一种产品资料格式，保留原样，不作为当前运行状态直接导入。当前来源归并见 [交接记录](HANDOFF_RECONCILIATION.md)。

没有建立 A／B／C 批次，也没有独立 C 评审或用户验收记录。当前会话完成了代码测试与浏览器操作，详见验证记录；Codex 可执行文件被检测到，与已验证后台模型集成是两件事。
