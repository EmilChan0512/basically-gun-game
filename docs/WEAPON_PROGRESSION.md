# 原作武器成长表

依据 SFH1 v1.2.1 的 Stats_Guns、Stats_Classes、Bullet_Proj_Basic/Bounce/Follow 和 Guns_290 时间轴。54 种枪械全部接入原作职业、等级、价格、弹匣、射速和握持/换弹动画；12 种刀盾按用户要求保留副手槽位。

| 职业 | 解锁序列（原作名称 / 等级） |
|---|---|
| 医疗兵 | M4 / 1 → Needler / 2 → Famas / 6 → Cougar / 8 → Scar / 11 → p357 / 14 → G36 / 17 → Colt 45 / 20 → Dragon / 23 → p44 / 26 → AK 47 / 29 → p500 / 32 |
| 刺客 | Scout / 1 → Barrett / 6 → Jackal / 11 → Dragunov / 17 → Crossbow / 23 → AWP / 29 |
| 突击兵 | Saw / 1 → RPG / 2 → RPD / 6 → Thumper / 8 → AUG HBAR / 11 → Stinger / 14 → First Blood / 17 → Lawnchair / 20 → OICW / 23 → Javelin / 26 → Mini Gun / 29 → Commando / 32 |
| 重装兵 | M3 / 1 → AA 12 / 6 → SPAS 12 / 11 → Striker / 17 → Judgement / 23 → Omar / 29 |
| 通用副武器 | USP / 1 → Uzi / 3 → MP5 / 7 → Beretta / 9 → Skorpion / 13 → Vector / 15 → Socom / 18 → Patriot / 21 → UMP / 24 → M1911 / 27 → Glock 18 / 30 → Phantom / 33 → P99 / 35 → Raffica / 37 → AKS / 39 → Desert Eagle / 41 → RCP 90 / 43 → Cyclone / 50 |

刀类和盾类解锁等级分别为 2、8、14、20、26、32。初始免费主武器是 M4、Scout、Saw、M3，初始副武器为 USP。Vector 属于通用副武器，15 级解锁。

枪械图片来自 DefineSprite375 的 2—55 帧；对应帧保存在 weapon-catalog.json 的 artFrameId，素材及 SHA256 记录见 public/assets/characters/manifest.json。character-art.ts 可重新生成图像和关节动画。

静态反编译 Stats_Guns 的 Colt45 栈临时变量需要展开为两个 0。Commando 的 params 在 AS 反编译结果中错误显示为 null，但对应 pcode 的 ofs22d7—ofs2300 明确为 gas_small、7、0.5，因此按 pcode 恢复。

发射器使用共享权威模拟：火箭分步飞行，榴弹受重力并弹跳，45 帧引信，追踪弹按原作范围和转向速率寻找附近敌人；碰撞、爆炸和伤害由服务端结算，并随快照同步。当前碰撞世界、爆炸视线、盾牌强化减伤、职业基础生命、经验曲线及技能效果仍使用本项目规则，并非整个原作战斗系统的逐字复刻。
