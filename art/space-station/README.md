# 太空站素材流水线

本地 ComfyUI：`http://127.0.0.1:8188`，FLUX.2 Klein 4B / Qwen 3 4B / Flux2 VAE，4步 Euler。

1. `npm run art:station:prepare`：从 assets.json 为五种素材建立独立 API 图和可拖入 ComfyUI 的 `.workflow.json`。
2. `npm run art:station:generate`：本地队列生成并发布 v1；已完成任务校验后跳过，断点继续使用原 prompt ID。随后使用本地 Python/Pillow 去除悬浮模块与图片边界连通的白底并裁到透明边界，保留原图与处理记录。
3. `npm run art:station:verify`：检查完整素材清单、尺寸、SHA-256 和 PNG 元数据清理。

提示词在 assets.json 与 workflows/*.api.json；生成读取各素材独立 API 图的提示词。修改提示词后，可用 `node tools/comfy-ui.mjs generate --collection space-station --revision v2` 生成新候选，保留上一版结果；当前游戏选择 v1，换版需同步验收、透明处理和引用路径。运行 prepare 会从素材清单重新生成可编辑图。

生产像素、尺寸与校验摘要位于 public/assets/space-station/v1。原始图片、种子、API 图、ComfyUI 执行记录在 artifacts/comfy-ui/space-station/v1，发行 ZIP 不携带工作流和原始记录。

地图碰撞与导航由代码定义。素材只填充对应平台、货箱和远景，平台顶部与实际可站立边缘对齐。
