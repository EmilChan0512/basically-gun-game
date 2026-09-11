# 架构与证据边界

## 多人及内容扩展评估（2026-09-11）

见 [扩展架构评估与分阶段路线](MULTIPLAYER_EXPANSION_ROADMAP.md)及[实施记录](EXPANSION_PROGRESS.md)。当前已实现按角色输入、权威WebSocket房间、可恢复模拟、地图与模式目录、雷达和刀盾配装。路线图中的验收要求仍需逐项满足；当前代码已有联机能力，但跨设备体验和最终性能尚未全部验收。

### 共享模拟与会话边界

`npm run check:simulation`已接入`npm run check`：独立tsconfig不载入DOM类型；esbuild以neutral平台遍历全部共享模块、Battle和LocalSession的运行时依赖，按已审查模块清单拒绝表现层、存储、外部包及未审查依赖。当前40个文件通过，报告位于artifacts/qa/simulation-boundary.json。Recoil仅包含姿态/后坐力计算和注入随机源，属于共享战斗规则。此检查约束依赖边界，不证明跨运行时确定性，也不替代Checkpoint回归。

Battle以30Hz推进角色移动、生命、装备、模式和AI，不依赖Phaser、DOM或浏览器存储。LocalSession服务离线场景；MatchSession将每个连接绑定到独立角色，校验和排队输入、去重动作、确认序号、超时清空输入。Room负责8席位上限、地图/模式/装备校验、开局、观战、重连及多局生命周期；server仅接受输入和大厅操作，不接受客户端坐标、伤害或得分。

Battle构造默认会生成种子和ID；需要复现的测试及权威开局显式传入seed，Checkpoint保存随机状态、输入边沿、移动/生命/枪械/副手、AI路线、波次、模式和事件。默认随机初始化不代表跨设备确定性锁步；验证的是同运行时以同状态和命令继续模拟一致。Room实例UUID属于房间身份，不是战斗伤害随机源。

网络公开StateMessage与内部Checkpoint分开。服务端RevealPolicy/VisibleState按队伍裁剪角色、朝向、效果和事件；客户端只预测自身移动并插值远端状态，生命/弹药/目标由服务器裁定。子弹使用有界历史命中盒回溯，近战和盾方向按当前权威tick处理。雷达使用同一可见快照。内部Checkpoint和近战已命中集合不广播给客户端。

### 地图、模式与装备扩展

MapDefinition提供版本、兼容模式、碰撞、导航、出生点、目标及表现资源；飞机使用静态提取的原图和碰撞掩码。ModeRules处理TDM/DOM/合作/公文包；WaveDirector处理合作波次/预算/有限复活。合作单人自动通关按用户要求降为非阻塞诊断，基础生命周期回归保留。

Catalog目前包含9种枪械、刀与盾副手。Arsenal仅构造枪械控制器；OffhandController处理特殊副手输入、互斥、前后摇/部署与恢复。DamageContext统一子弹、爆炸、近战和环境伤害。在线EquipmentLoadout仅含主枪/副手ID，独立于本地职业养成；ReferenceArt按目录载入枪械贴图和尺寸，刀盾使用专门姿态。新增规则需更新内容指纹，旧版客户端与服务器不能混用。

生产客户端由package-game生成，独立服务器由package-server打成Node单文件并附ws许可。服务器包已在工作区外、无项目node_modules路径的临时目录启动验证；它不是持久化后端，停止进程会丢失活动房间。下方Phase和账号/战役段落记录历史演进，当前完成度以上述模块和实施记录为准。

## 当前扩展：账号与养成（2026-09-11）

Accounts管理本机账号注册/登录和独立SaveStorage适配器；CareerProgress在原CampaignProgress上增量扩展职业、军资、解锁、训练和终局奖励，旧存档向后兼容。Catalog声明四职业、八技能、九枪械、刀盾副手及三道具。CareerPanels渲染账号页与军械库，出战时Battle接收配装副本。

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
