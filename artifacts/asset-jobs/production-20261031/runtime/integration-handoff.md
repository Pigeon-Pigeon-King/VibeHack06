# 首批八件静态资产接入候选

2026-10-31。本记录保存美术制作窗口的已检查候选，供主窗口统一合并。不是全地图完成状态。

已接入 TANK、LIGHTKIT-POLE、VEH-TUG、TERMINAL-CONSOLE、BG-CRANE、BENCH、LIFE-MUG、MEDICAL-BAG。PortKit.asset 只分离可见模型，现有碰撞编号、顺序、尺寸及任务交互保留。当前六个实现/测试文件归主窗口接手，避免与备用分支的 ModelLibrary / GeneratedSceneAssets / visualSlot 同时运行。

2026-10-31 再次通过 `tsc --noEmit` 和 generated-static-assets + opening-presentation 两文件 16 项测试。测试覆盖单场景复用、场景间资源隔离、异步销毁、局部回退、坐标、LOD 和碰撞数据一致性。

实际浏览器证据保存在相邻 qa 目录：S05-generated-first-view.png 显示牵引车和远景起重机；S11-generated-entry.png 显示接收桌终端背部；S11-generated-table-props.png 显示护理包和杯子。S05 观察点约60 FPS、232–262 draw、84–86k triangles；这是单视点观察，不是全关卡性能验收。当前图仍有大量白盒，用户明确要求继续全面替换。

本候选运行GLB为原件的逐字节副本，共73,533,616 bytes；原始source不修改。主窗口已有同批1024纹理副本约13.7MB，合并优先采用该运行副本并同步清单；本加载器仅在解析后缩贴图，不节约下载体积。

长凳旧目标4.5m使用非等比fit；主窗口已准备两张等比1.8m长凳及碰撞对齐，合并用该方案。控制台面朝工作人员，入口看到其背部；屏幕凹折高光还需近处检修。动态护理帘、推车、角色接触尚未在此候选替换。

用户追加范围：地图玩家可见实体全部采用Tripo/Hyper生成资产，白盒只作为不可见碰撞/导航。新增ARCH地面/墙/屋顶/梁/海柜/低掩体正在两个API并行生产；共享战术动作和世界AK47挂接也在专属目录制作。此提交只冻结已就绪的首批，剩余工作不计完成。主窗口统一共享入口，制作窗口继续产出独立待接包。
