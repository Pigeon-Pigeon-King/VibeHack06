# F-35B：源模型 1:1 代码化重建

本次用户明确纠正为「根据开源模型进行 1:1 的代码化重建」。之前参照图片手工拟形的尝试已废弃，不进入交付与资产库。这里采用源网格保留式 JavaScript 构造，不把它称为原创参数化模型。

## 固定源与许可

- 仓库：[FGMEMBERS/F-35B](https://github.com/FGMEMBERS/F-35B)。
- 固定提交：2726b3bdf3c7c54ea09a5d4a248e86a739604ca7。
- 作者：Petar Jedvaj、Detlef Faber、F-GTUX、Stuart Cassie、Gary Brown 及上游贡献者。
- 仓库标注 GPL-3.0，完整条款保留于 docs/licenses/F35B-GPL-3.0.txt。模型不会因转为 JS 而改变来源或许可。
- 使用源文件：Models/F-35B.ac、Engine.ac、Gear.ac、Cockpit.ac，及对应 XML 动画；每个原文件的 SHA-256 记录在 f35b-source-manifest.json。
- 原模型包含机鼻测试探针，完整边界约 17.1533 × 11.0519 m。保持源比例，不为了套用实机标称尺寸而拉伸模型。这是对该开源模型的还原，不宣称是实机工程数据。

## 1:1 的核验范围

原文件中的 80 个有几何部件、19,479 个顶点、19,374 个多边形面、各面的顶点引用顺序、UV 数值、部件名称、局部位移/旋转和 57 项动画定义均保留。没有重新画轮廓、拟合、减面或坐标量化。渲染将原面扇形三角化为 36,613 个三角面；原多边形定义仍保存在 JS 中。

坐标只做刚性轴转换：源 AC 的 (x,y,z) 变为游戏 (-z,y,x)，保持 +Y 向上、−Z 向前。源数值到 JS 的往返误差为 0；送入 GPU Float32 后最大坐标误差为 3.002929691575673e-7 m，低于 1 微米。验证逐一检查所有三角角点对应的原顶点编号和坐标，并未只比较包围盒。

舱盖、升力风扇、翼下滚转口、发动机喷口、起落架及操纵面的运动轴/中心/插值表来自原 XML。源参数决定悬停时顶盖 80°、喷口 95°；转换采用源分段时序。连续 601 帧转换往返验证喷口运动无跳变。游戏的街机飞行物理保持独立，不声称完整复刻 FlightGear 系统。

**材质不是原贴图的 1:1 复制。** 原图像没有进入运行链路；表面使用集中色板、金属度、粗糙度和玻璃透明度重新着色。当前游戏座舱仪表/UI 保持原有可读性设计；源模型包含的座椅与内部部件保留在整机资产中。

## 运行与重建

- src/aircraft/f35b-source.js：显式数值/部件/动画定义，不是 Base64、data URI 或压缩模型容器。
- src/aircraft/f35b-palette.js：代码色板。
- src/f35b.js：宿主注入 Three.js，构造 BufferGeometry、材质与动画矩阵，统一销毁资源。
- src/models.js：默认机体路由到 F-35B；虚构敌方截击机保留独立构型。
- src/main.js：所有状态保持座舱视角。支援舰甲板上的同型机使用这份模型，带相应碰撞包围盒；玩家自身外部模型不挡住座舱视野。
- tools/airframe-study.html：开发用模型检查页，提供三视图/转换/起落架检查，独立于游戏 demo。
- tools/aircraft/convert-f35b.py：离线转换器。执行 python3 tools/aircraft/convert-f35b.py --source /path/to/unpacked/headwind-f35b-source 可重新生成 JS；原来源副本只在离线研究目录/附带源码 ZIP 中。
- tests/f35b.test.mjs：几何对应、连续转换及销毁测试。tests/demo-first-person.mjs：完整演示循环保持座舱视角，实时飞行/目标 HUD 可见且持续更新，操作按钮隐藏，首次点击进入。

运行无模型加载器、原贴图、外部媒体、远端请求或共享库路径。来源遵守本次用户明确指定的源网格重建路线；本例不改变其他美术的纯程序化要求。

Elemental Serenity 与 ThreeJSVFX 的既有世界/天气/池化效果仍在 world.js、effects.js 中使用；不为了重建模型而加入来源模型的外部特效媒体。
