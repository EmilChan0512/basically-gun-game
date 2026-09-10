# 战斗规格与证据边界

## Phase 3 弹药规则更新（2026-09-10）

已按原版Guns P-code修正：有限备用弹药、空弹匣自动换弹、保留半弹匣子弹并仅扣除补充数量；手动换弹受射击冷却限制；切枪保留两枪弹药和共享冷却，取消未完成换弹，切回空枪重新触发换弹。USP备用弹匣数5为EXTRACTED，实验角色倍率1时备用60。CARBINE备用弹匣3仍为TUNED。

换弹完成时长仍采用实验计时器，尚未与原版动画帧/运行时序对齐。射程、散布和目标中心命中仍是实验逻辑，不可称为已复刻的原版弹道。有效射击可以未命中并消耗弹药，只有命中存活目标才产生DamageEvent。战斗计时现随固定120Hz仿真推进，暂停冻结。

源文件、证据ID、条件及验证结果见 [ORIGINAL_BEHAVIOR_MATRIX.md](ORIGINAL_BEHAVIOR_MATRIX.md) 和 [REPLICA_COMPARISON.md](REPLICA_COMPARISON.md)。原版按R换弹；实验室因R用于重置，仍用L换弹。此输入差异不是原版操作复刻完成。

## Phase 2 历史切片

Phase 2 Gun Lab 已实现第一切片：独立瞄准、USP 半自动手枪、CARBINE 自动步枪、弹药、冷却、换弹、射线命中、`DamageEvent`、生命值、死亡、得分和复活。可操作输入为 `F` 开火、按住 `F` 自动连射、`Q` 切换武器、`L` 换弹。

USP 的基础伤害 15、弹匣 12、`autoFire=false` 来自 `REFERENCE_FINDINGS.md` 的 EXTRACTED 记录。USP 冷却、CARBINE 参数、射程、散布、目标生命值和复活表现属于实验配置，分别标记为 INFERRED/TUNED；未完成原版运行观测前不报告为历史事实。

统一路径为：`Fire → ammo/cooldown → ray → DamageEvent → health → death → score → respawn`。规则在 `src/game/combat`，Phaser 场景只负责输入、时间和绘制。

后续研究任务：使用 P-code 与 Ruffle 观测核对冷却、射程、散布、伤害修正和换弹时序；任何校准结果须先进入证据库，再替换实验默认值。
