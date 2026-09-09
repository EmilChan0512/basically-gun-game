# 战斗规格待验证

原版已提取，首轮确认 USP 定义的基础伤害 15、弹匣 12、非自动、射击延迟配置 0.25，见 `sfh1.v121.weapon.usp.*` 和 REFERENCE_FINDINGS.md。最终伤害与实测射击间隔尚未核对；延迟转成 uint 更新计数，不能直接当毫秒/RPM。不得把开发计划的目标架构误标为原版事实。

Phase 2 计划：独立瞄准、自动步枪、半自动手枪；统一 Fire → ammo/cooldown → ray → DamageEvent → health → death → score → respawn 路径。步枪、换弹、散布、射程和实际伤害解析仍需继续建立证据。当前移动实验室不实现射击。
