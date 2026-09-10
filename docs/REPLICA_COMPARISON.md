# 复刻对照报告

## 第三批：换弹动画帧（2026-09-10）

本批直接使用固定哈希SWF与FFDec反编译源码。`Stats_Guns`给USP/M4指定`pistol`/`rifle`，`Guns.setFrame`播放对应reload标签；DefineSprite 501标签和`arm_gun_316`帧脚本给出第9→37帧与第81→115帧，`UnitMC.doneReload → Guns.reloaded`完成idle切换和弹药转移。

| 用例 | 原版静态证据 | 复刻结果与边界 |
| --- | --- | --- |
| USP手动换弹 | `pistol_reload`第9帧，`doneReload`第37帧 | 28次30Hz动画推进后补弹；第27次仍保持原弹匣 |
| M4自动换弹 | `rifle_reload`第81帧，`doneReload`第115帧 | 打空的启动帧不自减，之后34次推进完成补弹 |
| 暂停单步 | 时间线声明30fps，实验物理步120Hz | 前3次单步不变，第4次减少1个换弹帧 |
| 完成回调 | `doneReload`先idle，再`reloaded`转移弹药 | 数值顺序已接入；同帧相对玩家射击尝试的派发顺序仍未OBSERVED |
| 切枪 | `swapGuns`取消reloading，切回空枪重新`checkReload` | 中断不后台完成，切回后从完整28/34帧重新开始 |

回归覆盖手动换弹边界、自动换弹启动帧、M4完成帧与下一帧射击、跨15/30/60/120Hz分批一致性及浏览器暂停单步。当前证据库57条：34 EXTRACTED、7 INFERRED、16 TUNED。下一批进入`Bullet_Line_Basic → Bullet → 命中/伤害接收`；换弹仍需原版运行录像确认墙钟时间和跨事件同帧排序。

## 第二批：M4与射击更新顺序（2026-09-10）

本批基线是原版P-code和静态执行推导。范围为存活人类玩家、无技能/比赛修正、普通USP/M4，实验默认弹药倍率1。没有原版计时录像，不能把离散回归测试升级成OBSERVED证据。

| 用例 | 原版证据预期 | 复刻结果与边界 |
| --- | --- | --- |
| M4配置 | 伤害10、弹匣30、备用弹匣3、自动、shootDelay配置0.15 | 替换CARBINE；默认弹药30/90；`weapon.m4.configuration` |
| M4持续按住 | uint计数4；先射击后递减 | 第1/5/9步射击，射击步末计数3；`weapon.cadence.baseline` INFERRED |
| USP冷却中再次按住 | uint计数7；只有成功射击才锁扳机 | 第1/8步射击，此后保持按住不继续；`weapon.trigger.latch`及cadence记录 |
| 短按在两更新之间已松开 | Player更新时mDown=false，无射击 | 不缓存短按；浏览器测试输入改为持有到实际采样发生 |
| 120Hz仿真到30Hz战斗 | 每4个物理子步对应1个枪械逻辑步 | 前3子步不射击，第4步射击并递减；暂停单步保留相位 |
| 切枪 | 共用shootDelay；按住时设shotPressed | 保留整数计数和30Hz相位，自动枪也等待松开 |
| 分批时间推进 | 同一逻辑输入与时间序列应一致 | 15/30/60/120Hz分批推进8秒，跨自动换弹后弹药、备用、射击数、计数一致 |
| Medic等级1弹药因子 | 静态计算0.9，ceil总量后减弹匣 | USP12/53、M4 30/78；`class.medic.level1.ammoMultiplier` INFERRED；默认实验仍用1 |

测试定位：`tests/unit/weapon-timing.test.ts`、`tests/unit/original-ammo.test.ts`、`tests/gameplay/gunlab-weapons.spec.ts`。离散规则要求精确一致；本节当时使用的TUNED换弹计时器已在第三批替换。

本轮已运行`npm run check`：40个单元测试通过，证据库55条校验、资产隔离、TypeScript和生产构建通过。Phaser大chunk提示仍存在。浏览器完整结果在验收状态中记录。

原版现场：macOS arm64，Ruffle web0.6.0，在固定SWF上新建Player存档进入Foundry / Deathmatch / FFA / Very Easy，Skills与Killstreaks关闭、Modifier None，HUD显示Medic等级1、85HP、M4备用78。与静态弹药推导吻合，但本次只检查工具截图，没有本地归档录像或截图样本；不新增OBSERVED记录。运行笔记在`archaeology/local/phase3-observation-macos.md`。

第二批结束时计划优先核对`Guns.setFrame → arm_gun_316 → UnitMC.doneReload`；该项已在第三批完成静态接入。剩余未验收：换弹运行计时与跨事件排序、随机散布/射程、地形和多目标碰撞、伤害修正、玩家死亡/复活、移动测量。

## 第一批弹药规则（历史）

日期：2026-09-10。状态：静态规则切片通过；完整 Phase 3 未完成。

来源与条件见 [原版行为对照表](ORIGINAL_BEHAVIOR_MATRIX.md)。本轮基线来自原版 SWF 的 P-code，不把实验室结果当作原版观测。

| 用例 | 原版静态规则预期 | 修正后结果 |
| --- | --- | --- |
| USP、弹药倍率1、普通模式初始化 | 弹匣12，备用60 | 12 / 60 |
| 射击1发后立即手动换弹 | 冷却阻止换弹 | 保持11 / 60 |
| 冷却后换弹，完成前/后 | 剩余子弹不丢弃，完成仅补1发 | 11 / 60 → 12 / 59 |
| 剩1发、备用3，射击打空 | 自动换弹；备用不足时部分装填 | 0 / 3 → 3 / 0 |
| 弹匣与备用耗尽 | 不凭空补弹 | 推进计时仍0 / 0 |
| 射击后立刻切枪 | 弹药保留、共享冷却阻止绕过射速 | 两枪弹药分别保留，冷却未清零 |
| 半弹匣换弹中切走再切回 | 取消未完成换弹 | 弹匣与备用均未改变 |
| 空弹匣换弹中切走再切回 | 再次检查空弹匣，重启换弹 | 不在后台完成换弹，返回后重新计时 |

验证：`npm run check` 通过，32个单元测试，包含证据校验、资产隔离、TypeScript及生产构建；`npm run test:gameplay` 通过，11个Chromium测试。测试于本次修改后实际执行。构建仍有既有 Phaser chunk 体积提示。

浏览器测试还确认暂停冻结战斗计时与禁止开火/换弹/切枪，单步推进1000/120毫秒；鼠标自动连射已接入与键盘相同的仿真入口。原版30Hz逻辑与当前120Hz仿真的精确等价仍待对照。

仍未通过的复刻项：USP真实射击/换弹时序、第二把原版武器、散布与几何碰撞、伤害修正、玩家死亡/复活及移动校准。职业/技能/比赛修正尚未接入，CARBINE仍为TUNED实验武器。不能将本报告解释为全游戏或Phase 3完成。

## 原版运行初查

通过本地Ruffle web 0.6.0已进入Foundry快速比赛（Deathmatch/FFA，Very Easy，Skills及Killstreaks关闭，Modifier None）。HUD可见Medic等级1、85HP，切到USP后备用弹药显示53；当前实验倍率1下为60。此差异提示职业/等级条件尚未对齐，不应修改观测结果去迁就实验默认值。完整操作记录见本地 `archaeology/local/phase3-observation.md`。

初查截图已在本任务工具记录中显示，本地尚无归档录像，未新增OBSERVED证据；单发/换弹操作未取得可用的前后对照，时长、运动与弹道测量继续待完成。
