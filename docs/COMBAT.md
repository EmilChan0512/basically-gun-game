# 战斗规格与证据边界

## 2026-09-11 当前战斗入口

默认入口为 OriginalSandboxScene：USP/M4、0.9弹药倍率、30Hz战斗与移动、枪口预行进、散布、实心地形遮挡和85HP生命周期已整合。新增常驻生命/弹药/换弹/复活HUD、3帧短暂弹道、24帧伤害/击杀反馈与跨玩家复活累计击杀。H仅隐藏调试信息；R重置整个练习状态。旧Gun Lab参数只适用于 `?rules=lab`。本次没有新增原版观测。

## Phase 3 第四批：射程、采样命中与头部伤害（2026-09-10）

本批从固定SWF额外导出`Status`、`UT`的AS/P-code，串联审核`Stats_Guns → Bullet_Line_Basic → Bullet.hitTestAll → Status.damage`及`Unit.setStats`。以下为**静态源码规则切片**，不等于完整弹道或原版运行对照验收。

- **射程**：USP基础66、M4基础60；`(range + UT.irand(-3,3)) × 10`，七个等概率整数扰动。飞行阶段分别为630–690px、570–630px，不再使用900/1000px占位距离。
- **步进**：从传入的枪口替代点开始，先前进10px，再做点采样碰撞，最多`uint(maxDist/10)`次。不检测起始点，不改成连续线段相交；窄障碍可能落在采样间隙。
- **单位命中框**：以脚底中心为基准，站立全框26×66、身体26×44；蹲下全框26×44、身体26×28。X偏移−13。`UT.inBox`使用严格边界，外边缘不命中，身体上沿分界线归头部。命中框独立于Phaser移动碰撞体。
- **采样顺序**：普通子弹先检查不透明墙像素，再按单位数组顺序检查非自身、存活、无sBlur、非同非零队伍的单位；同点重叠不按中心距离排序。纯规则模块提供墙采样接口；当前场景未接入墙位图或尸体碰撞，不能据此断言平台挡弹/不挡弹。
- **头部倍率**：`Bullet`写`headMult=1.5`，但`Status.damage`将其当标记，对非自身、非爆炸/近战武器走`unitInfo.headBonus`分支。无技能基值为**1.45**，USP/M4基础头部伤害21.75/14.5；不取整。头部标记不跨子弹遗留。不包含完整职业、难度、暴击、护盾、技能与状态修正。

实现：`Ballistics.ts`承载纯采样与几何规则，随机源可注入；`GunLab`只在成功发射时采样随机数，未命中仍扣弹，冷却/换弹/空枪拒绝发射不改写最后一发遥测。快照和HUD暴露采样射程、步数、命中部位、终点及当前命中框；绘制靶子的身体和头部区域与判定使用同一矩形。

**仍为TUNED / 未接入**：原版`Bullet`构造器还先做枪口侧向偏移与5px预行进（`0..xOff`含末次），再设置ox/oy并进入10px循环。本批只接入后半飞行阶段；场景用士兵身体中心代替该起点，指针方向代替后坐力后的旋转。原版枪口动画坐标、预行进命中交接、动态散布/后坐力、效果回退、地形位图、尸体、盾牌、全伤害链均待后续。世界像素暂按1:1接入，尚无运行坐标校准。零长度瞄准是实验室“不产生路径但耗弹”的显式边界。

为在真实基础射程内验证，实验靶中心从(980,540)移到(700,540)，脚底为中心Y+33；这是测试设施移动，不是放宽武器射程。100HP、5000ms复活、默认站立仍是实验条件；蹲姿仅作为规则/调试状态，未新增玩家下蹲控制。

证据：`sfh1.v121.bullet.range`、`bullet.lineStep`、`bullet.unitHitbox`、`bullet.hitOrder`、`damage.headBonus`（后四项同前缀）；适配边界为`combat.ballisticsAdapter.initial`。以下批次段落保留当时状态，第四批规则优先。

## Phase 3 第三批：换弹动画帧（2026-09-10）

原版`Stats_Guns`把USP的`frameReload`设为`pistol`，M4设为`rifle`；`Guns.setFrame("reload")`会播放`${frameReload}_reload`。固定SWF的DefineSprite 501标签表显示`pistol_reload`从第9帧开始、`rifle_reload`从第81帧开始；`arm_gun_316`在第37/115帧调用`doneReload`，因此到完成回调分别需要28/34次时间线推进。两把武器的换弹现改为同一30Hz整数帧时钟，不再使用900/1400ms实验计时器；HUD显示剩余换弹帧。

`UnitMC.doneReload`先调用`setFrame("idle")`，再调用`Guns.reloaded`；后者清除`reloading`并按缺口转移备用弹药。实验室保留这一数值完成路径。Flash同一显示帧中玩家更新与MovieClip帧脚本的全局派发先后尚未通过运行样本确认，当前采用“本帧射击尝试仍受reloading阻止，随后完成补弹，下帧才可射击”的保守排序，并单独标记为实验边界。

## Phase 3 第二批：M4 与30Hz射击（2026-09-10）

当前两枪为USP和M4，Q往返切换。M4基础伤害10、弹匣30、备用弹匣3、自动射击来自已核对的Stats_Guns P-code。CARBINE已从生产配置中移除，以下提及它的段落为历史记录。

射击使用30Hz整数计数：USP `uint(0.25×30)=7`，M4 `uint(0.15×30)=4`。每个战斗步先尝试射击，然后递减，包含刚射击的当步。M4按住的静态预期序列为第1/5/9步；USP松开再按住的最早序列为第1/8/15步。实现的120Hz物理步每累计4步推进一次战斗帧，切枪保留计数和相位。单步仍推进1/120秒，并非每次单步都更新射击计数。快照暴露combatFrame、cooldownFrames、shotsFired和lastShotFrame便于检查。

输入改为采样持续按住状态：USP只有成功发射后才锁定扳机，松开解除；冷却或换弹期间按下并持续按住会重试。两帧之间已松开的短按不缓存。切枪时已按住也会锁定M4，须释放后再次按下。这些规则来自Guns/Player，模拟时间间隔来自静态顺序推导，尚无原版计时录像验证。

弹药构造接受显式系数，先`ceil(弹匣×(备用弹匣+1)×系数)`再减弹匣。默认系数1；Medic等级1、无技能/修正时系数0.9，单元对照得到USP备用53、M4备用78。当前仅实现弹药系数，未实现整套Medic职业。

第二批结束时换弹仍为900/1400ms的TUNED占位；第三批已由动画帧替换。当前残留TUNED项为USP距离900px/角度容差0度、M4距离1000px/角度容差2度、靶子100HP/5000ms复活和固定目标中心命中。M4原配置range=60/recoil=4未直接用于实验坐标或容差。视觉仍为灰盒，原版枪械图像、姿态、火光、弹壳和音效尚未还原。

证据：`sfh1.v121.weapon.m4.configuration`、`weapon.shootDelay.counter`、`weapon.player.updateOrder`、`weapon.cadence.baseline`、`weapon.trigger.latch`、`class.medic.level1.ammoMultiplier`（后五项同样带`sfh1.v121.`前缀）。

## Phase 3 弹药规则更新（2026-09-10）

已按原版Guns P-code修正：有限备用弹药、空弹匣自动换弹、保留半弹匣子弹并仅扣除补充数量；手动换弹受射击冷却限制；切枪保留两枪弹药和共享冷却，取消未完成换弹，切回空枪重新触发换弹。USP备用弹匣数5为EXTRACTED，实验角色倍率1时备用60。CARBINE备用弹匣3仍为TUNED。

换弹完成时长仍采用实验计时器，尚未与原版动画帧/运行时序对齐。射程、散布和目标中心命中仍是实验逻辑，不可称为已复刻的原版弹道。有效射击可以未命中并消耗弹药，只有命中存活目标才产生DamageEvent。战斗计时现随固定120Hz仿真推进，暂停冻结。

源文件、证据ID、条件及验证结果见 [ORIGINAL_BEHAVIOR_MATRIX.md](ORIGINAL_BEHAVIOR_MATRIX.md) 和 [REPLICA_COMPARISON.md](REPLICA_COMPARISON.md)。原版按R换弹；实验室因R用于重置，仍用L换弹。此输入差异不是原版操作复刻完成。

## Phase 2 历史切片

Phase 2 Gun Lab 已实现第一切片：独立瞄准、USP 半自动手枪、CARBINE 自动步枪、弹药、冷却、换弹、射线命中、`DamageEvent`、生命值、死亡、得分和复活。可操作输入为 `F` 开火、按住 `F` 自动连射、`Q` 切换武器、`L` 换弹。

USP 的基础伤害 15、弹匣 12、`autoFire=false` 来自 `REFERENCE_FINDINGS.md` 的 EXTRACTED 记录。USP 冷却、CARBINE 参数、射程、散布、目标生命值和复活表现属于实验配置，分别标记为 INFERRED/TUNED；未完成原版运行观测前不报告为历史事实。

统一路径为：`Fire → ammo/cooldown → ray → DamageEvent → health → death → score → respawn`。规则在 `src/game/combat`，Phaser 场景只负责输入、时间和绘制。

后续研究任务：使用 P-code 与 Ruffle 观测核对冷却、射程、散布、伤害修正和换弹时序；任何校准结果须先进入证据库，再替换实验默认值。
