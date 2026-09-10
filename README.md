# Project Strike

2026-09-10：已开始按原版SWF执行Phase 3，完成首批弹药/换弹/切枪规则修正；本次32个单元测试、11个Chromium测试通过。详见 [原版行为对照表](docs/ORIGINAL_BEHAVIOR_MATRIX.md) 和 [复刻对照报告](docs/REPLICA_COMPARISON.md)。本机运行 `node tools/archaeology/reference-browser.mjs` 后可打开 http://127.0.0.1:4180 对照原版，安装步骤见 [考古流程](docs/ARCHAEOLOGY.md)。

实验室已加入有限备用弹药和空弹匣自动换弹；Q切枪保留弹药与共享冷却并取消换弹；L手动换弹需等射击冷却结束。USP备用弹匣数来自原版，但当前实验角色使用弹药倍率1，时长/瞄准仍待校准，CARBINE仍为实验武器。

按照 `Project_Strike_Codex_Development_Plan.docx` 第 15 节，交付 **Phase 0 可执行考古工具链 + Phase 1 Movement Lab**。这是本地运行、可测量的灰盒移动实验室；Phase 2 Gun Lab 已加入 USP、CARBINE、射线、弹药、换弹、伤害和复活闭环；3v3、机器人和进度系统属于后续阶段。

已从原发行门户 Not Doppler 获取并校验 2012 原作 SFH1 v1.2.1，完成 FFDec 脚本/资源提取及首批代码事实核对。官方便携 FFDec、Temurin Java 和 Ruffle 位于 gitignored 的 `tools/vendor/`。现有实验室移动值仍标为 `TUNED`；原版运行观测和手感校准尚未完成。来源与已知事实见 [REFERENCE_FINDINGS.md](docs/REFERENCE_FINDINGS.md)。

## 在本机运行

要求 Node.js 20.19+ 或 22.12+（当前已使用 22.19 验证）、npm、Git。

```powershell
cd C:\Users\10722\Documents\Codex\2026-09-09\git\project-strike
npm ci
npm run dev
```

打开终端给出的地址，默认为 http://127.0.0.1:5173 。依赖已在本机安装，当前可直接执行 `npm run dev`。只监听本机地址。

| 操作 | 输入 |
| --- | --- |
| 左右移动 | A / D 或 ← / → |
| 跳跃 | W / ↑ / Space |
| 瞄准朝向与射击 | 鼠标 |
| 穿透单向平台 | S / ↓ |
| 重置当前测试站，清空速度/输入 | R |
| 切换四个测试站 | 1 / 2 / 3 / 4 |
| 暂停 / 继续 | P |
| 暂停并前进一步，1/120 秒 | . |
| 0.25 倍慢速 | T |
| 碰撞体、速度、台阶辅助范围、瞄准线、HUD | H |

F 开火，Q 切换 USP/CARBINE，按住 F 自动连射，L 换弹。右侧滑块实时调参。完成起跳和落地后，底部显示高度、顶点时间、总滞空和水平距离；可以导出 JSON。失去窗口焦点清空输入，掉入缺口自动重置。平台只允许从上方落脚；地形中的 28 px 台阶超过默认辅助高度，需要跳跃。

## 原版研究

本机可直接运行 `npm run archaeology -- --require-reference`。新环境依次运行 `npm run archaeology:acquire`、`npm run archaeology:setup`、`npm run archaeology`，分别获取固定哈希的参考文件、校验安装官方便携工具、提取并索引。日常导出保留每个 sprite 首帧，`--full-sprites` 可请求全动画帧。完整说明见 [ARCHAEOLOGY.md](docs/ARCHAEOLOGY.md)。

生成物位于 gitignored 的 `archaeology/exported/` 和 `archaeology/local/`。人工审核事实存于 [证据库](archaeology/reverse_engineering_db.json)，区分原版 `EXTRACTED`、单位换算 `INFERRED` 与实验配置 `TUNED`。不将反编译输出作为生产源代码。

## 验证与构建

```powershell
npm run check
npx playwright install chromium
npm run test:gameplay
npm run preview
```

`check` 执行证据校验、研究资产隔离检查、规则单测、TypeScript 检查和生产构建。浏览器测试覆盖真实 Phaser Arcade 跳跃、台阶、单向平台、缺口复位、键盘操作及固定步长行为。生产包在 `dist/`，`preview` 默认 http://127.0.0.1:4173 。通过 HTTP 提供运行，不直接双击 HTML。

## 结构与后续

- `src/game/config`：类型化运动参数和测试场几何。
- `src/game/scenes`：BootScene 和 MovementLabScene，仅两场景。
- `src/game/characters`、`movement`、`debug`：组合式士兵、移动/台阶规则与测量。
- `tools/archaeology`、`archaeology`：研究工具、证据和私有输入接口。
- `tools/measurements`：原版人工测量模板。
- `docs`：架构、证据边界、调参和验收状态。

详细状态见 [ACCEPTANCE.md](docs/ACCEPTANCE.md)，重要取舍见 [DECISIONS.md](docs/DECISIONS.md)。Phase 2 第一切片及增量已有验收记录；下一阶段见 [Phase 3 原版 SWF 驱动的移动与战斗复刻](docs/PHASE_3_COMBAT_SANDBOX.md)：以本地 SFH1 v1.2.1 反编译脚本、P-code 核对及原版运行观测建立行为基线，再修正实验实现。原版对照是阶段验收门槛，不能只凭实验室测试通过宣称复刻完成。阶段名称尚待与原始开发计划核对。没有创建远端仓库或上传研究资料。
