# 最终统一候选验证

2026-10-31 傍晚。候选以 main 的 d3731d7（含交付窗口本地路演材料）为基础，整合60生产ID、人物与界面修正、S10自主战斗及S02拥堵／连续倒地。此轮只合并本机版本，不发布、推送或提交比赛。

- 最终 Vitest：75个文件、866项通过，0失败、0跳过。完整JSON和日志为 full-tests.json / full-tests.log；命令为 `NARRATION_DELIVERY_RUNTIME=/Users/penguin/VibeHack06/design/audio/chapter-bridge-01/runtime npx vitest run --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=artifacts/model-integration/final/full-tests.json`。该环境变量只启用原音频的逐字节验收，游戏运行不依赖原件路径。
- TypeScript与生产构建通过。build.log 保留约6.07MB JS块警告；静态产物381文件、218,416,061字节，见 dist-manifest.json。未把包体数字作为性能通过证据。
- input-manifest.json 冻结626个运行／测试／构建输入，构建后逐项复核无变化。主线重建与本机HTTP结果在合回后单列 main-parity.json。
- 首轮858项中857通过，群众共享资源断言发现回退角色仍请求不用的战术包。修改加载选择，儿童、SHEN、SHAO、DOCTOR不请求当前不使用的包；原断言保留。first-tests.*保留该轮失败。随后为接入已完成的S02最后一批源码，主动中断一次测试并留存 interrupted-before-s02.log；此中断不计通过，最终全套重新运行。
- S10额外证据：无Q时孟齐1.22秒、郑铎4.13秒首发，郑铎自主移动5.11米；Q回归由郑铎真实弹丸命中而通过。保存baseline与after，没有注入任务事实、生命或演员位置，阶段仍停0，未绕过到位条件。
- 地面修复删除了S10与其它大场地同高渲染层，保留碰撞。S02固定音轨时点与旧档／skip结果保持；连续倒地与真实角色蒙皮、重复帧、加载失败和释放有专项覆盖。17动作片段中当前只启用受限5类，其他状态保留稳定程序姿态。

本轮浏览器工具被Work设置禁用，未取得新版连续画面、实际声音、手机或Windows运行证据。HTTP成功、真实GLB解码和模拟输入回归均不等于上述实机验收；Node图像解码替身与每项专项边界见子目录。约一小时正常首通仍待真人验证。
