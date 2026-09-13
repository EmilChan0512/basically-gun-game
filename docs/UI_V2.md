# UI v2 与本机 ComfyUI 管线

## 页面与配装

基调沿用军事装备界面的深色、橄榄色和枪械素材，加入青色界线、指挥室背景、2D 职业概念像与技能分类图。
联机大厅保留行动入口；成长构筑与经典装备、技能统一从主导航「出战配装」进入。
成长页包含职业、武器与配件、职业技能、3 个基础 Perk、8 张成长池、进化、成就称号、配装槽及服务端保存反馈。
顶部切换「经典配装」可使用原有武器、技能、购买与职业装备功能。两套规则各自保存。
进入房间后，配装页固定为该房间规则；成长配装支持「应用到本房间」，由服务器确认并取消准备状态。长期配装在房间外保存。
大厅、配装、单机任务菜单采用同一套边框、色彩与排版。战斗角色继续使用原有动画资源。

## 本地生成

本轮 16 项素材每项生成一次，batch_size=1，固定 seed；未作挑选、重抽或美术可用性评判。
技术验证仅检查文件格式、尺寸、哈希、加载和页面布局。素材效果由用户决定。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/start-comfy-ui.ps1
npm run art:doctor
npm run art:status
npm run art:verify
npm run art:generate
```

默认使用本机 `http://127.0.0.1:8188`，不调用云端服务。启动脚本支持 `-Core`、`-ModelPaths`、`-Port`。
已有服务会复用；不会下载模型、安装节点或重启已有 ComfyUI。
本机环境：`C:\AI\comfyui-core`，Python 位于其 `.venv\Scripts\python.exe`；模型目录由 `C:\AI\ai-game-art\comfy-extra-model-paths.yaml` 提供。
工作流只用内置节点：FLUX.2 Klein 4B、Qwen 3 4B 文本编码器、Flux2 VAE，4 步，模型文件名见资产规格。

- `art/ui-v2/assets.json`：16 项资产、尺寸、提示词、模型和统一风格。
- `art/ui-v2/workflow-api.json`：可复用 API 图；脚本填入单项参数。
- `tools/comfy-ui.mjs`：检查、生成、断点恢复。提交前记录日志，得到 prompt ID 后按 ID 恢复；提交结果不明时停止，避免重复生成。
- `artifacts/comfy-ui/v1/`：本机任务日志、完整工作流和执行历史，不进入发行包。
- `public/assets/ui-v2/v1/`：首版 PNG 及运行时清单，由 UI 引用。

发布 PNG 只移除文字、EXIF 和工作流元数据，保留原始像素；原文件另存为 `artifacts/comfy-ui/v1/*.original.png`。首次旧输出可执行 `node tools/comfy-ui.mjs publish`，后续生成自动处理。不将完整提示词、历史或模型放入游戏 ZIP。

重复执行 `art:generate` 会检查已有完成输出并跳过，不会重新生成 v1。
如果用户决定替换某项，可以创建新版本：

```powershell
node tools/comfy-ui.mjs generate --id operator-assault --revision v2
```

新版本输出独立保存。确认要采用后再改 `UIArt.ts` 或 CSS 的资源路径；不自动覆盖当前使用版本。
如某次提交状态不明，先检查 ComfyUI 的 `/history` 与任务日志，补回真实 prompt ID；不要删除日志盲目重试。

生成工具和模型不随游戏分发。游戏包只需已生成资源，接收者不需要安装 ComfyUI、Python 或模型。

## 验证入口

- `npm run check`：内容、文件卫生、模拟边界、单元测试与生产构建。
- `npx playwright test tests/gameplay/ui-v2.spec.ts tests/gameplay/growth.spec.ts tests/gameplay/online-accounts.spec.ts`：统一导航、草稿保留、成长保存/重登、房间应用、旧装备技能与窄屏布局。
- `npm run release`：Windows x64 便携运行、逐文件 ZIP 校验、16 项 UI 素材尺寸与哈希、无源工作流元数据、生产离线测试。
- `npm run test:performance`：生产战斗性能回归。

布局截图保存在 `artifacts/qa/ui-v2-*.png`；仅检查交互布局与可读性，不作为自动选图依据。
