# 架构与证据边界

依据开发计划第 3、10、11、15 节，当前交付限定 Phase 0 和 Phase 1。Phaser 3 + Arcade Physics 承担运行时；Vite/TypeScript 承担开发和构建。Node 考古工具不被运行时导入。OpenGame 是可选开发参考，不是运行时依赖；本切片直接实现可控的最小结构。

`BootScene → MovementLabScene → Soldier + MovementController + StepAssist`。输入转换为控制意图，移动规则和调参定义独立于渲染。Arcade body 是运动状态权威，独立图形层表现身体及瞄准。固定 120 Hz 仿真隔离显示器帧率，暂停、慢动作和单步使用同一循环。

`tools/archaeology` 管提取/索引；`archaeology/local` 存私有生成清单；`reverse_engineering_db.json` 存经过人工审核的证据。原始 SWF、导出文件、参考图永不成为 runtime imports。

已知事实：当前技术选型来自开发计划；原版现已提取，角色运动为 MovieClip 坐标加速度与位图碰撞，参见 `sfh1.v121.movement.collisionModel`。原版亦含 Box2D，但不能将其物理常量直接当角色运动值。Phaser Arcade 仍是计划指定的重建架构。源码索引、已确认常量和待验证部分见 REFERENCE_FINDINGS.md；后续枪械、机器人、比赛按验收顺序实现。
