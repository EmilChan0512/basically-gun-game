# Project Strike 界面素材工作台

这套界面由本地 **ComfyUI / FLUX.2 Klein 4B** 生成，统一使用漫画军事风、蓝灰钢板、克制的青色指示灯和暖金主按钮。31 项素材覆盖场景背景、按钮状态、导航标签、输入框、卡片、弹窗、HUD、职业及分类插画。

## 最简单的使用方式

在项目根目录双击 **ART-STUDIO.cmd**，或者运行：

```powershell
npm run art:ui:studio
```

打开 <http://127.0.0.1:8190>。ComfyUI 地址为 <http://127.0.0.1:8188>；若未启动，运行 `powershell -ExecutionPolicy Bypass -File tools/start-comfy-ui.ps1`。

1. 左侧选择要调整的素材。用途、尺寸和完整提示词会显示在右侧。
2. 修改提示词；种子留空会随机抽卡，也可填入旧种子做对照。本轮可生成 1–4 张。
3. 点击图片看原图；按钮候选另有小尺寸、不同宽度的实际九宫格预览。
4. 点击 **选用这张**。只替换该素材，旧候选和工作流都保留，可以随时选回。
5. 运行 `npm run dev`，打开命令输出的游戏地址查看组合效果。图片替换后刷新页面。
6. 满意后运行 `npm run art:ui:verify`、`npm run release`，再提交推送。工作台本身不会提交、推送或部署。

## 每个素材都有独立流水线

- [`assets.json`](assets.json)：尺寸、类别、使用位置、美术规范、初始提示词。首次准备时生成各素材工作流。
- `workflows/<id>.api.json`：该素材的**可编辑生成主文件**。后续 CLI 抽卡读取此文件；各素材可以独立修改模型、提示词、采样器和种子。
- `workflows/<id>.workflow.json`：对应的 ComfyUI 可视化工作流，可直接拖入 ComfyUI。改 API 后运行 `npm run art:ui:prepare` 更新这个可视化版本；已有 API 文件不会被覆盖。
- `selected/<id>.api.json`、`selected/<id>.workflow.json`：当前选用图片的**实际生成工作流快照**，含实际种子。工作台的候选工作流下载同样对应该张候选，不是空模板。
- [`selected.json`](selected.json)：当前选用版本、种子、工作流哈希、图片哈希及选用时间。
- `../../artifacts/ui-kit/<id>/<candidate>/`：每一轮的原始 PNG、生产 PNG、API 工作流、可视化工作流、ComfyUI 执行回执及记录。不进 Git、不进朋友发行包。
- `../../public/assets/ui-kit/v1/`：当前选用的生产 PNG 与运行时 manifest，不含提示词和生成元数据。

**ComfyUI 里调整节点后：**下载/导出 API 格式，保存到该素材的 `workflows/<id>.api.json`，再执行 `npm run art:ui:prepare`。保留输出节点 ID `12`，并保持 manifest 约定的尺寸与 `batch_size=1`；工作台把每张图片作为独立候选。当前图的完整工作流可以从工作台下载并拖回 ComfyUI 复现。模型随机性/硬件变化可能影响复现像素，实际原图另有永久留存。

**修改 assets.json 不会覆盖已有工作流。**日常调图直接在工作台改提示词，或编辑对应的 API 文件；assets.json 中提示词是初始规范。

## 命令行抽卡与回退

```powershell
# 一张按钮，随机种子；不会自动换掉当前图
npm run art:ui:generate -- --id button

# 固定种子和候选名。断线后用同一命令恢复，不会重复提交已有任务
npm run art:ui:generate -- --id button --seed 915007 --candidate button-review-03

# 选用或回退到任意历史候选
npm run art:ui:select -- --id button --candidate button-review-03

# 全套出图（仅在确实需要时使用）；首次接入可加 --select
npm run art:ui:generate -- --all --candidate review-04
```

同一个候选名不会覆盖已完成的候选。换提示词后使用新的候选名；某次提交未拿到 prompt ID 时，先检查该候选 `record.json` 和 ComfyUI 历史，不自动重复投递。

## 图片如何进入界面

### 状态语言

所有职业、装备、技能卡和导航标签统一：**青色边框 = 已选中；暗蓝边框 = 未选中**。不以亮白框表示任何选择状态。悬停只提亮当前素材，不切换到选中图；键盘焦点使用独立金色外框。`card`/`tab` 是未选中素材，`card-selected`/`tab-selected` 是选中素材，抽卡时也必须遵守这套约定。

[`TacticalArt.css`](../../src/client/presentation/TacticalArt.css) 统一接入控件，[`UIArt.ts`](../../src/client/presentation/UIArt.ts) 接入职业/技能插画。按钮和框体使用 `border-image` 九宫格拉伸：四角不变形，中间适配文字和布局。背景以图片铺设；CSS 保留布局、焦点、响应式和少量遮罩，**不把文字烘焙进图片**。

按钮 slice=40、普通面板 slice=64、卡片 slice=48。生成时保持装饰位于切片边缘，中央空白，避免框体伸缩后出现铆钉拉长。新候选必须保持原尺寸。HUD 保持原来的可点击范围与信息位置，皮肤不会改变战斗规则。

发行前会验证全套图片的尺寸、SHA256、元数据清理和独立选用工作流，并在 Windows 便携包里再次核对 31 张图。朋友包只含选中美术、运行时与许可；开发工作台、模型、提示词、历史抽卡和账户数据不会进入朋友包。

## 素材清单

完整清单和用途见工作台左侧及 [assets.json](assets.json)。背景：`command-room`、`campaign-table`、`armory-bay`；框体：`panel`、`dialog`、`card`、`card-selected`；按钮：`button`、`button-hover`、`button-pressed`、`button-primary`、`button-disabled`；导航：`tab`、`tab-selected`；输入：`input`；HUD：`hud-vitals`、`hud-score`、`notice`；插画：四个 `operator-*`、五个 `category-*`、三个 `mode-*` 和 `strike-emblem`。
