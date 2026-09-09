# Movement Lab 参数与偏差

权威配置：`src/game/config/movement.ts`。本表每一数值对应 `archaeology/reverse_engineering_db.json` 中的 `movement.<key>.initial` 记录；类型统一为 **TUNED**，confidence 0.1 表示与原版一致性的置信度很低，不是软件运行正确率。尚无 EXTRACTED 或 OBSERVED 的原版移动值。

| key | 初始值 | 单位 | evidence id |
| --- | ---: | --- | --- |
| runAcceleration | 2200 | px/s² | movement.runAcceleration.initial |
| maxRunSpeed | 290 | px/s | movement.maxRunSpeed.initial |
| groundDeceleration | 2600 | px/s² | movement.groundDeceleration.initial |
| airAcceleration | 1000 | px/s² | movement.airAcceleration.initial |
| jumpVelocity | 520 | px/s magnitude | movement.jumpVelocity.initial |
| gravity | 1500 | px/s² | movement.gravity.initial |
| maxFallSpeed | 800 | px/s | movement.maxFallSpeed.initial |
| coyoteTimeMs | 65 | ms | movement.coyoteTimeMs.initial |
| jumpBufferMs | 75 | ms | movement.jumpBufferMs.initial |
| maxStepHeight | 18 | px | movement.maxStepHeight.initial |
| stepProbe | 5 | px | movement.stepProbe.initial |
| dropThroughMs | 200 | ms | movement.dropThroughMs.initial |
| bodyWidth | 22 | px | movement.bodyWidth.initial |
| bodyHeight | 38 | px | movement.bodyHeight.initial |

正 y 向下，起跳施加负速度。地面加速/减速显式计算，空中无输入时保留水平动量，有输入时按 airAcceleration 转向。允许短暂离地起跳和落地前输入缓存；这些辅助是可配置假设，原版是否存在尚未验证。默认重力与起跳速度的连续模型预测顶点约 347 ms、高约 90 px；这只是调试模型预测，实际离散仿真测量会略有不同。

Phaser 自动 physics update 被关闭；渲染帧累积时间后以 120 Hz 调用同一运动和碰撞路径。每步依次同步 body、读取上一碰撞状态、移动控制、清碰撞标记、Arcade step、postUpdate。每渲染帧最多累积 100 ms；严重卡顿会丢弃多余墙钟时间以避免无界追帧，不能把此时游戏时间当作实际墙钟时间。

台阶辅助只在地面、非起跳、横向运动时发生，并预检查抬升后空间是否与固体相交。严格遵守 maxStepHeight，不把高墙当小台阶。默认 8/16 px 可攀越，28 px 需跳跃。只处理轴对齐矩形，不模拟斜坡或真实胶囊。

单向平台仅下降且上一步脚底在平台上方时碰撞；S/↓ 暂停该碰撞，固体地面仍有效。低平台、高平台及实心高台组成空中转向测试路线。

R 和坠落回站清空速度、加速度、碰撞标记、起跳缓存及控制输入。暂停冻结仿真；单步推进 1/120 秒；慢速为 0.25 倍。HUD 显示全部初始调参字段和体积边界，滑块提供常用参数；其余字段修改配置即可。

测量与观测：实验室导出的 JSON 是本实现的 TUNED 样本，不应标成原版 OBSERVED。原版测量使用 `tools/measurements/worksheet.md`，记录 SHA、运行器、录像帧率和误差。用证据校准时追加记录并保留旧值，修改本表和配置链接，不静默覆盖历史。
