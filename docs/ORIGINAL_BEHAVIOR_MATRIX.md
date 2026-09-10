# 原版行为对照表

更新：2026-09-10。目标 SWF：SFH1 v1.2.1，SHA256 `0b8d92dfae85917dd9bc0dc87997979bb825b3211d95d92f84040ffc9a1cc989`。

本轮完成弹药状态的静态核对与第一批实现修正。EXTRACTED 表示可从原版字节码确定的事实，不能替代运行观测；表中待验证项不计入阶段通过。所有证据 ID 以下均省略 `sfh1.v121.` 前缀。

## 已核对的弹药切片

适用边界：普通人类玩家、非盾牌、未持旗、无 `clip` 技能及 `ammo` / `clips` 比赛修正；当前实验角色弹药倍率显式取 `unitInfo.amm=1`，不代表所有原版职业的默认倍率。

| 行为 | 原版结论与证据 ID | 原版定位 | 当前实现及验证 |
| --- | --- | --- | --- |
| USP 备用弹药配置 | clipSpare=5；`weapon.usp.clipSpare` | Stats_Guns.pcode Init USP arg14；addGun 参数14映射 | Combat.ts：USP.spareMagazines=5；基准弹匣12、备用60 |
| 弹药初始化 | total=ceil(clipSize×(clipSpare+1)×amm)，备用为 total−clipSize；`weapon.ammo.initialization` | Guns.pcode setGuns 普通分支 ofs0157–ofs024a | GunController 构造；只实现倍率1基准，职业倍率待后续 |
| 空弹匣自动换弹 | 弹匣0、备用>0时开始，射击后调用；`weapon.reload.automatic` | Guns.pcode checkReload ofs0080–ofs00de；shoot 尾部 | checkReload；不会瞬间补满；无备用时保持空枪 |
| 手动换弹 | 未满、有备用、未换弹、无射击冷却、可射击武器；`weapon.reload.manualGuards` | Guns.pcode manualReload ofs000a–ofs00a1 | reload；冷却阻止换弹，开始时保留剩余弹药 |
| 换弹补充 | 缺多少补多少，备用不足则部分补充；`weapon.reload.transfer` | Guns.pcode reloaded ofs002d–ofs00f6 | tick 完成路径扣除实际装填数；时长仍TUNED |
| 切枪状态 | 复用主副弹药对象，共享shootDelay，取消换弹并检查新弹匣；`weapon.swap.state` | Guns.pcode swapGuns，尤其 ofs0054、ofs008b、ofs02da–ofs02ee | GunLab 持有两枪和共享冷却；切回空枪重新开始换弹 |

原版调用链：`Stats_Guns.Init/addGun → Guns.setGuns → shoot/checkReload/manualReload → setFrame → arm_gun_316.frame37 等 → UnitMC.doneReload → Guns.reloaded`。普通切枪入口位于 Player 的按键处理；盾牌、持旗及 AI 自动切枪不在当前基准范围。

## 必须继续核对的项目

| 项目 | 研究入口与已有证据 | 当前偏差 / 下一步 |
| --- | --- | --- |
| USP 射击时序 | `weapon.usp.shootDelay`、Guns.shoot / EnterFrame / Player.EnterFrame | 实验250ms；原版0.25×30存入uint。核对更新顺序并录像，不把7个计数直接当最终实测间隔 |
| 换弹时序 | Guns.setFrame → MBFZ_fla.arm_gun_316 → UnitMC.doneReload | 实验USP900ms、CARBINE1400ms；需取SWF帧标签、完成帧并观测起止偏移 |
| 第二把原版武器 | Stats_Guns.Init / addGun → 具体 Bullet 子类 | CARBINE是实验配置，尚未替换；须先确认原版武器及职业/等级条件 |
| 散布/后坐力 | Guns.EnterFrame / makeBullet | 当前角度容差不是原版弹道；追踪dynRecoil、姿态/aim倍率及随机调用，核对P-code |
| 射程与碰撞 | Bullet、Bullet_Line_Basic、hitTestAll / hitTestWall | 当前目标中心与固定距离判断；原版可见步进与射程扰动，完整碰撞顺序尚待核对 |
| 伤害 | Bullet命中调用 → status.damage 的实际类 | 当前只有基础减血；职业、命中部位和修正尚未复刻 |
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
