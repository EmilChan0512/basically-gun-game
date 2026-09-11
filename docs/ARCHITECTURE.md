# 架构与证据边界

## 当前扩展：账号与养成（2026-09-11）

Accounts管理本机账号注册/登录和独立SaveStorage适配器；CareerProgress在原CampaignProgress上增量扩展职业、军资、解锁、训练和终局奖励，旧存档向后兼容。Catalog声明四职业、八技能、七枪械及三道具。CareerPanels渲染账号页与军械库，出战时Battle接收配装副本。

Arsenal继续复用GunController/弹道，新增主副武器组合及霰弹多弹丸；Battle处理技能时长、道具次数、手雷和属性修正；CampaignScene负责E/G输入及反馈。原训练场仍只接受USP/M4，新增武器ID不会改变既有实验配置。

## 当前扩展：单人战役（2026-09-11）

`main.ts`根据URL分流：默认 `campaign.ts`启动战役；`?rules=original`/`?rules=lab`启动原训练场。`campaign.ts`管理菜单、简报、暂停、结算和结局DOM；`CampaignScene`只负责输入、相机、矢量表现与音效。

`campaign/Missions.ts`声明四套原创关卡；`Battle.ts`是可离线测试的30Hz多角色规则核心；`Navigation.ts`处理小图路线和视线；`Arsenal.ts`复用既有武器计时、后坐力与弹道，适配多个队伍目标；`Progress.ts`处理版本化本地进度和存储失败；`Audio.ts`合成本地提示音。完整通关测试以普通输入驱动核心，浏览器另测实际控制。

`tools/serve-game.mjs`仅提供dist文件，监听127.0.0.1；`package-game.mjs`生成可复制离线目录。生产包不暴露 `window.__strikeCampaign`，不包含测试策略或研究材料。

2026-09-10 当前增量：GunLab持有两个持续存在的武器状态和一个共享射击冷却，GunController持有弹匣/备用弹药与可取消换弹；场景在固定仿真步中推进战斗，输入转为开火意图。原版SWF浏览器观测服务器位于tools/archaeology/reference-browser.mjs，独立于Vite生产入口。下文Phase 0/1范围为初始架构历史。

依据开发计划第 3、10、11、15 节，当前交付限定 Phase 0 和 Phase 1。Phaser 3 + Arcade Physics 承担运行时；Vite/TypeScript 承担开发和构建。Node 考古工具不被运行时导入。OpenGame 是可选开发参考，不是运行时依赖；本切片直接实现可控的最小结构。

`BootScene → MovementLabScene → Soldier + MovementController + StepAssist`。输入转换为控制意图，移动规则和调参定义独立于渲染。Arcade body 是运动状态权威，独立图形层表现身体及瞄准。固定 120 Hz 仿真隔离显示器帧率，暂停、慢动作和单步使用同一循环。

`tools/archaeology` 管提取/索引；`archaeology/local` 存私有生成清单；`reverse_engineering_db.json` 存经过人工审核的证据。原始 SWF、导出文件、参考图永不成为 runtime imports。

已知事实：当前技术选型来自开发计划；原版现已提取，角色运动为 MovieClip 坐标加速度与位图碰撞，参见 `sfh1.v121.movement.collisionModel`。原版亦含 Box2D，但不能将其物理常量直接当角色运动值。Phaser Arcade 仍是计划指定的重建架构。源码索引、已确认常量和待验证部分见 REFERENCE_FINDINGS.md；后续枪械、机器人、比赛按验收顺序实现。
# Architecture update

Phase 2 extends the runtime with `GunLab` as a pure combat coordinator. It owns weapon cooldown, ammo, target health, score, and respawn state; Phaser scenes may call it but do not embed combat rules. The first playable target is a training dummy, and all values without an extracted source remain explicitly experimental.
