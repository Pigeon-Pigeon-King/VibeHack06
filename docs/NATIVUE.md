# Nativue 项目架构画布

本项目使用本地 Nativue CLI 建立有文档证据的架构图。配置为中文、Codex、manual 模式；通过当前会话读取分析包并导入语义结果。后台模型 runner 与远程同步均未启用。

## 画布的含义

目前源材料是产品和技术文档，还没有游戏代码。因此图中的产品、世界、人物和战役节点表示已读到的要求；玩家、弹丸、任务、AI、演出、呈现与桌面模块表示拟建职责。三条验证线和扩展旅程表示实施计划，不能读作功能已完成。

- observed：在引用文档中直接存在的要求或声明。
- inferred：据要求拟定的实现关系、系统边界或验证流程。
- verified：保留给实际运行／测试证据；当前新游戏节点不使用此标记。

点击节点查看职责与证据，沿边查看要求如何约束系统。旅程从理解产品、共用基础、三条验证线到全战役与 Windows 交付展开。

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

没有建立 A／B／C 批次，也没有独立 C 评审、功能测试通过或用户验收记录。Codex 可执行文件被检测到，与已验证后台模型集成是两件事；本次实际验证范围是本机 CLI、语义导入和画布浏览。
