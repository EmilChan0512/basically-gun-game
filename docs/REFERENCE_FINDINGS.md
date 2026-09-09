# SFH1 v1.2.1 参考来源与首轮发现

2026-09-09 从原发行门户 [Not Doppler 的 Strike Force Heroes 页面](https://www.notdoppler.com/strikeforceheroes.php)主动获取参考文件。页面明确署名 Sky9 Games，描述 15 个战役任务与 65 种以上武器，并将 SFH2、SFH3 单列链接。实际下载地址是 [门户嵌入 SWF](https://i.notdoppler.com/files/strikeforceheroes.swf?2017july3)。

- 本地默认入口：`archaeology/swf/sfh1_reference.swf`，18,625,489 字节。
- SHA256：`0b8d92dfae85917dd9bc0dc87997979bb825b3211d95d92f84040ffc9a1cc989`。
- FWS 格式版本 10，声明长度与实际一致；内部文本 `v1.2.1`。
- XMP 修改日期为 2012-07-09，创建工具为 Adobe Flash Professional CS5。元数据是文件自述，未被当作独立签名认证。
- 这是 2012 原作的修订构建，不能证明是首发当天最初版本。未将它与 SFH2 或 2023 商业重制版混同。

来源网页快照、下载记录及逐字节头部解析保存在 gitignored 的研究目录。`npm run archaeology:acquire` 可重新取得固定哈希构建；若远端文件改变则报错，不能静默接受未知文件。

## 实际提取结果

使用官方 FFDec 26.2.1 与 Temurin JRE 21.0.12.1+1 完成一次约 29 秒的常规导出：491 个 ActionScript 文件、487 个类/接口声明、15 个包名（含 default）、37 个图像、1,014 个形状、174 个声音、324 个 sprite 首帧和一份符号映射。请求了 binaryData 导出，本构建未生成该类别文件。

103 个脚本命中游戏逻辑关键词，这只是候选分类；Box2D、Flash UI 和生成时间线代码也在清单中。236 个脚本含 `§§` 栈伪代码，索引会标记需要 P-code 核对。提取命令成功不代表每段源码已经还原为正确控制流。

首轮源码核对覆盖 `Movement`、`Unit`、`Player`、`Main`、`Game`、`Stats_Guns` 与 `Guns`。证据库保留 22 条 EXTRACTED、5 条 INFERRED，以及原实验室的 14 条 TUNED。每条来源有文件、定位和 SHA256；不把原版源码放进生产模块。

## 可用的运动事实

以下均为基础值，证据 ID 前缀为 `sfh1.v121.`。舞台像素和世界坐标的最终显示缩放仍需观测；“每步”指更新调用，不代表所有机器的实际墙钟时间。

| 事实 | 原始值 | evidence id |
| --- | --- | --- |
| 舞台 / 声明帧率 | 800×600 / 30 fps | metadata.stageWidth / stageHeight / frameRate |
| 地面 / 空中加速度 | 1.8 / 1.4 坐标每步² | movement.xAcc / xAirAcc |
| 站立 / 蹲伏最大速度 | 9.5 / 4 坐标每步 | movement.xMax / xCrouchMax |
| 站立 / 蹲伏 / 空中制动 | 1.7 / 0.5 / 0.4 坐标每步² | movement.xBrake / xCrouchBrake / xAirBrake |
| 重力 / 下降限速 | 0.8 坐标每步² / 20 坐标每步 | movement.yGrav / yMax |
| 普通跳跃 | 先上移 6，再从垂直速度减去 13×倍率 | movement.yJumpBoost / yJump |
| 角色碰撞 | MovieClip 坐标移动 + 位图像素采样 | movement.collisionModel |

原版角色移动不是 Box2D 速度积分；Box2D 虽然在项目中，但不能把其重力值当作角色重力。地形/状态倍率、跳跃资格、更新顺序会影响结果。攀爬段反编译控制流有明显残留，不能直接照抄。

按稳定 30 步/秒做量纲换算，基础最大水平速度约 285 坐标/秒，地面加速度 1620、空中 1260、重力 720 坐标/秒²，跳跃冲量幅值 390 坐标/秒。对应 `normalized.*` 记录标为 INFERRED，不能直接证明换用 120 Hz Arcade 后手感等价。当前实验参数没有被静默替换。

## 枪械和复活线索

USP 的定义里基础伤害 15、弹匣 12、autoFire=false、shootDelay 配置 0.25，证据见 `sfh1.v121.weapon.usp.*`。射击延迟在 `Guns` 中乘 30 后存入 uint，再逐步递减，存在整数截断；不要直接把 0.25 当实测间隔或报告 240 RPM。最终伤害也需要继续追踪统一伤害路径和修正。

死亡路径设置复活计时为 150 次更新，玩家更新逐步递减并按 30 显示秒数（`sfh1.v121.match.respawnTimerInitial`）。五秒是声明帧率下的名义时间，尚未做墙钟观测。

## 剩余验证

本轮已完成取得、完整性校验、静态提取和首批事实核对。Ruffle 可执行版本已验证，但未完成原版实际对局、录像测量或手感对照。下一步优先用 P-code 与可重复运行实验核对攀爬、计时和倍率，再调整移动实验室。
