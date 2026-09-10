# 原版行为对照表

## 第四批已核对：普通USP/M4飞行与头部因子（2026-09-10）

适用：无额外射程/技能/装备修正的普通USP/M4；复刻接入范围为**枪口之后的直线采样阶段及基础头部因子**。证据ID除实验适配项外均有`sfh1.v121.`前缀。

| 行为 | 静态结论 / 证据ID | 来源与当前实现边界 |
| --- | --- | --- |
| 随机射程 | USP66/M4 60，加含端点−3..3整数，再×10；`bullet.range` | Stats_Guns.Init/addGun、Bullet构造器ofs0109–ofs0123、UT.irand；630–690/570–630px从枪口后阶段计 |
| 10px采样 | 先前进，再命中检查；上限uint(maxDist/10)；`bullet.lineStep` | Bullet_Line_Basic构造器ofs0049–ofs00c8；只接入该阶段，5px枪口预行进未接入 |
| 单位矩形 | 站立26×66/身体44高；蹲下26×44/身体28高；严格边界；`bullet.unitHitbox` | Bullet.hitTestAll ofs01f6–ofs040c；UT.inBox严格比较；身体顶边属于头部 |
| 遮挡与筛选 | 不透明墙→合格单位数组顺序→尸体；`bullet.hitOrder` | Bullet.hitTestAll；纯模块实现墙接口和单位筛选，场景墙位图/尸体尚未接入 |
| 头部伤害 | 标记1.5，实际基础乘1.45；`damage.headBonus` | Status.damage ofs0458–ofs0535、Unit.setStats ofs0132；USP21.75/M4 14.5，保留小数；全修正链未接入 |
| 实验适配 | 身体中心替代枪口、直线指针、墙关闭、靶移至x700 | `combat.ballisticsAdapter.initial`为TUNED，不算原版几何与完整瞄准还原 |

`Status`、`UT`为本批额外导出，当前本地定向导出共13类，非历史491类全量恢复。以下历史表格中的固定距离/目标中心命中描述已被本批取代；尚无新增OBSERVED样本。

更新：2026-09-10。目标 SWF：SFH1 v1.2.1，SHA256 `0b8d92dfae85917dd9bc0dc87997979bb825b3211d95d92f84040ffc9a1cc989`。

当前已完成弹药、M4射击计数与USP/M4换弹动画帧的静态核对。EXTRACTED 表示可从原版字节码或SWF结构确定的事实，不能替代运行观测；表中待验证项不计入阶段通过。所有证据 ID 以下均省略 `sfh1.v121.` 前缀。

## 第二批：M4 与射击更新顺序

2026-09-10重新导出相同P-code，既有6类的文件哈希一致。当前新核对的源文件均来自同一SWF、FFDec 26.2.1。生产端不导入研究文件。

| 行为 | 来源与类型 | 当前实现、条件及未完成项 |
| --- | --- | --- |
| M4配置 | `weapon.m4.configuration` EXTRACTED；Stats_Guns.Init lines 1750–1832，addGun参数7/8/13–18/27/30 | 等级要求1、class=1、基础伤害10、弹匣30、备用弹匣3、自动；Bullet_Line_Basic。已替代CARBINE；配置range=60/recoil=4未误当实验像素/命中容差 |
| 射击计数 | `weapon.shootDelay.counter` EXTRACTED；Guns uint字段line80，shoot ofs0478–ofs0493，EnterFrame ofs000c–ofs003c | `GunController`使用整数计数；射击存入uint(config×30)，非零时每次更新减1 |
| 玩家更新顺序 | `weapon.player.updateOrder` EXTRACTED；Player ofs0128–ofs013a / ofs0318 → UnitEnterFrame ofs00bc–ofs00ea | `GunLab.tick`每30Hz先采样扳机并尝试射击，再递减。120Hz物理步累积4次成为1个战斗步；共享计数和相位均跨切枪保留 |
| 基准射击序列 | `weapon.cadence.baseline` INFERRED，基于上述顺序与USP/M4配置 | 第一可射击步编号1：M4为1/5/9；USP松开再按住的最早序列1/8/15。射击当步结束后计数3/6。是静态推导与实现回归，不是录像实测 |
| 扳机锁 | `weapon.trigger.latch` EXTRACTED；Guns.shoot / releaseMouse / swapGuns，Player.MouseDown/MouseUp | USP成功射击才锁定；冷却中按住会在可射击步重试。松开清锁；切枪时按住，自动枪也须释放。完全发生在两逻辑步之间的短按不排队 |
| Medic等级1弹药 | `class.medic.level1.ammoMultiplier` INFERRED；Stats_Classes.getClass → Unit.setClass → Guns.setGuns | `new GunLab(0.9)`为USP12/53、M4 30/78；默认倍率1仍为12/60、30/90。仅接入弹药系数，不表示整套职业、等级成长或技能已实现 |

适用条件：存活的人类玩家、普通USP/M4、可用弹药、无技能/比赛修正、非盾牌/持旗。射击序列不包含换弹、死亡和状态效果打断。30Hz对应SWF声明帧率，严重卡顿时当前实验室仍丢弃超出100ms的墙钟时间，不能据此宣称墙钟一致。

新增源哈希：`Unit.pcode` = `8998b398cd4cf30adfffd9e1fdf02824cccacb090310023576b1d941c232df33`；`Stats_Classes.pcode` = `b33cbd4089a0030c47a8e1e933a6637636e319830a19c209560c6c1528d70af8`。具体方法定位及调用方哈希也保存在证据记录中。

## 已核对的弹药切片

适用边界：普通人类玩家、非盾牌、未持旗、无 `clip` 技能及 `ammo` / `clips` 比赛修正；当前实验角色弹药倍率显式取 `unitInfo.amm=1`，不代表所有原版职业的默认倍率。

| 行为 | 原版结论与证据 ID | 原版定位 | 当前实现及验证 |
| --- | --- | --- | --- |
| USP 备用弹药配置 | clipSpare=5；`weapon.usp.clipSpare` | Stats_Guns.pcode Init USP arg14；addGun 参数14映射 | Combat.ts：USP.spareMagazines=5；基准弹匣12、备用60 |
| 弹药初始化 | total=ceil(clipSize×(clipSpare+1)×amm)，备用为 total−clipSize；`weapon.ammo.initialization` | Guns.pcode setGuns 普通分支 ofs0157–ofs024a | GunController 构造；只实现倍率1基准，职业倍率待后续 |
| 空弹匣自动换弹 | 弹匣0、备用>0时开始，射击后调用；`weapon.reload.automatic` | Guns.pcode checkReload ofs0080–ofs00de；shoot 尾部 | checkReload；不会瞬间补满；无备用时保持空枪 |
| 手动换弹 | 未满、有备用、未换弹、无射击冷却、可射击武器；`weapon.reload.manualGuards` | Guns.pcode manualReload ofs000a–ofs00a1 | reload；冷却阻止换弹，开始时保留剩余弹药 |
| 换弹补充 | 缺多少补多少，备用不足则部分补充；`weapon.reload.transfer` | Guns.pcode reloaded ofs002d–ofs00f6 | 完成帧路径扣除实际装填数；USP/M4跨度为28/34帧 |
| 切枪状态 | 复用主副弹药对象，共享shootDelay，取消换弹并检查新弹匣；`weapon.swap.state` | Guns.pcode swapGuns，尤其 ofs0054、ofs008b、ofs02da–ofs02ee | GunLab 持有两枪和共享冷却；切回空枪重新开始换弹 |

原版调用链：`Stats_Guns.Init/addGun → Guns.setGuns → shoot/checkReload/manualReload → setFrame → arm_gun_316.frame37 等 → UnitMC.doneReload → Guns.reloaded`。普通切枪入口位于 Player 的按键处理；盾牌、持旗及 AI 自动切枪不在当前基准范围。

## 必须继续核对的项目

| 项目 | 研究入口与已有证据 | 当前偏差 / 下一步 |
| --- | --- | --- |
| USP/M4 射击时序 | `weapon.usp.shootDelayConfig`、`weapon.shootDelay.counter`、`weapon.player.updateOrder` | 已实现静态顺序与7/4计数；原版录像和墙钟测量待完成，不把逻辑间隔当实测间隔 |
| 换弹时序 | Guns.setFrame → MBFZ_fla.arm_gun_316 → UnitMC.doneReload；`weapon.reload.timeline` | 已接入USP 28帧、M4 34帧动画推进；同帧跨事件排序仍待运行观测 |
| 第二把原版武器 | Stats_Guns.Init / addGun → Bullet_Line_Basic | 已核实并接入M4配置、射击计数与换弹帧；完整弹道和伤害倍率仍待对照 |
| 散布/后坐力 | Guns.EnterFrame / makeBullet | 角度容差已移除；当前直线指针仍为TUNED。下一批追踪dynRecoil、姿态/aim倍率及随机调用，核对P-code |
| 射程与碰撞 | Bullet、Bullet_Line_Basic、hitTestAll / hitTestWall | 已接入射程扰动、10px采样、严格单位框；5px枪口预行进与姿态起点、墙位图、尸体和特殊碰撞待接入 |
| 伤害 | Bullet命中调用 → status.damage 的实际类 | 已接入基础头部因子1.45；职业、难度、暴击、技能与状态修正尚未完整复刻 |
| 死亡/复活 | Unit死亡路径、Player.respawnTimer；`match.respawnTimerInitial` | 训练靶5000ms仅为实验；原版150次更新的实际时序、出生点、弹药重置待核对 |
| 地面/空中移动 | Movement、Unit、Player；`movement.*` 与 `normalized.*` | 现有移动仍TUNED；需核对调用顺序、坐标缩放和实际运行样本 |
| 攀爬/平台 | Movement的碰撞与攀爬分支 | 反编译残留未核清，当前台阶辅助和单向平台不能当原版事实 |

## 源文件与复现

P-code 来自未修改 SWF，经 FFDec 26.2.1 `-format script:pcode -selectclass Guns,Stats_Guns,Player,UnitMC,Bullet,Bullet_Line_Basic -export script` 导出至 `archaeology/local/phase3-pcode`。完整命令见 ARCHAEOLOGY.md。原版源码、P-code 和本地清单仍被 Git 排除。

| P-code 文件（均在该目录的 scripts/ 下） | SHA256 |
| --- | --- |
| Guns.pcode | 89e58997953dff343750beae80d6dc8cc5dd09a621a283a8e998d873b67b8d38 |
| Stats_Guns.pcode | cd640b81e6b071587a19350385c1183d3b1f43462a9e735e7df4935915c06164 |
| Player.pcode | 794604b4ebcdf16ca933e5e24cc3f2b0137f1e8dc330b8ac41e7e2c6a37c6d54 |
| UnitMC.pcode | 6fa0640cf100d123051ffe38a69260381188b6cea31f9a02fe43b45c6801cac7 |
| Bullet.pcode | c6a28fe406319fcbc31a4756f41b9d0f607b14f7a2fb4df840640ad290eb9f75 |
| Bullet_Line_Basic.pcode | f5045fac0acb50df681c8dfc3df0b58e8a216498336a9d2b42e3a85c11266a00 |

方法定位和各条来源哈希也已写入证据库；研究清单为 `archaeology/local/phase3-pcode/review-manifest.json`。导出6个类不表示已完成6个类的全部控制流审核。

## 验收方法

弹药状态测试预期来自上述P-code结论，见 `tests/unit/original-ammo.test.ts`；浏览器验证键盘换弹、备用弹药、切枪时按住扳机、暂停和单步。时间常量仍只验证实验计时器，不能据此宣称原版时长一致。

移动、弹道和原版计时的连续误差容差尚未设定：应先取得运行基线、坐标缩放与采样误差，再在修改默认值前锁定容差。当前这些项目保持未验收。

第四批补充源哈希：`Status.pcode` SHA256 `ea4ecf6c64b138d5f54ad304e73347a8be829bf2f60a66f4b5cc77c3752625d1`。

第四批补充源哈希：`UT.pcode` SHA256 `c1cc93a0d8a5b89f55d42ec643bc261af7a8b9c1cc1bcfb4c573c5d8b7d13b9d`。
