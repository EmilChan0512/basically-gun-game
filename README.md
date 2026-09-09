# Project Strike

按照 `Project_Strike_Codex_Development_Plan.docx` 第 15 节，交付 **Phase 0 可执行考古工具链 + Phase 1 Movement Lab**。这是本地运行、可测量的灰盒移动实验室；射击、3v3、机器人和进度系统属于后续阶段。

当前未提供原版 SWF，FFDec 和 Ruffle 也未安装。真实游戏提取/观察与历史数值核实仍待补齐。现有移动值全部标为 `TUNED`，不声称已经还原原版手感。

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
| 瞄准朝向（尚无射击） | 鼠标 |
| 穿透单向平台 | S / ↓ |
| 重置当前测试站，清空速度/输入 | R |
| 切换四个测试站 | 1 / 2 / 3 / 4 |
| 暂停 / 继续 | P |
| 暂停并前进一步，1/120 秒 | . |
| 0.25 倍慢速 | T |
| 碰撞体、速度、台阶辅助范围、瞄准线、HUD | H |

右侧滑块实时调参。完成起跳和落地后，底部显示高度、顶点时间、总滞空和水平距离；可以导出 JSON。失去窗口焦点清空输入，掉入缺口自动重置。平台只允许从上方落脚；地形中的 28 px 台阶超过默认辅助高度，需要跳跃。

## 原版研究

运行 `npm run archaeology`。有参考 SWF 和 FFDec 时导出并索引；缺少时生成带明确状态的报告和导入指引。完整说明见 [ARCHAEOLOGY.md](docs/ARCHAEOLOGY.md)。严格检查使用 `npm run archaeology -- --require-reference`。

生成物位于 gitignored 的 `archaeology/local/`。人工审核事实存于 [证据库](archaeology/reverse_engineering_db.json)；所有当前参数记录均为实验调试，不是提取的历史值。

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

详细状态见 [ACCEPTANCE.md](docs/ACCEPTANCE.md)，重要取舍见 [DECISIONS.md](docs/DECISIONS.md)。下一步先导入原版资料、验证/校准移动，再按计划进入 Phase 2 Gun Lab。没有创建远端仓库或上传研究资料。
