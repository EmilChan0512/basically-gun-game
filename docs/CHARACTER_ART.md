# 角色肢体与持物审查

本轮修正了两项素材/装配错误：旧 `arm.png` 与各职业 `*-arm.png` 实际来自 **DefineSprite 598（大腿）**；旧渲染又把 DefineSprite 568（小腿）纵向拉长成整条腿，靴子另用正弦位移。结果既缺少膝关节，手上也会出现护腿或枪套。

以 `UnitMC.setSkin`、`UnitMC` 的显示列表及 `MBFZ_fla.arm_gun_316` / `arm_front_328` 为依据，正确编号为：

| 部位 | 原作符号 |
| --- | --- |
| 上臂 / 前臂 / 手掌 | 298 / 266 / 385 |
| 大腿 / 小腿 / 靴子 | 598 / 568 / 538 |
| 躯干 / 头部 | 631 / 666 |

`public/assets/characters` 保存静态导出的矢量素材。保留原作局部坐标，按实际图形边界设置 viewBox；大腿内的备用枪附件隐藏，持物由独立武器节点绘制。素材及符号/帧/SHA256记录在同目录 manifest.json。旧 reference PNG 用于历史素材和旧目录兼容，不再充当实战手臂。

`CharacterPose.ts` 为实战和联机配装页共享的姿态入口。`character-poses.json` 保存原作站立、两种职业跑步/后退、空中、蹲伏及持枪/换弹关节。完整肢体的关节随源动画移动，不再对身体部位做独立的长宽拉伸。手枪、冲锋枪、步枪、霰弹枪、机枪、狙击枪和马格南使用各自原作握姿。武器与手指共用局部变换，枪线起点从该武器变换求得。刀盾沿用现有动作与盾牌方向算法，使用正确上臂、前臂和手掌素材。

此变更只影响展示，不改碰撞、伤害、弹药、职业解锁或服务端协议。Phaser 用原始矢量生成4倍分辨率纹理，配装页直接使用SVG。

## 可复现导出

使用项目已校验的 FFDec 对 `archaeology/swf/sfh1_reference.swf` 执行静态导出，原作脚本不执行：

```text
ffdec -onerror abort -selectid 266,298,385,538,568,598,631,666 -select all:1,51,101,151 -format sprite:svg -export sprite archaeology/local/anatomy-export archaeology/swf/sfh1_reference.swf
ffdec -onerror abort -selectid 375 -select 375:2,3,7,17,20,25,32,44,52 -format sprite:svg -export sprite archaeology/local/anatomy-export archaeology/swf/sfh1_reference.swf
npx tsx tools/archaeology/character-art.ts
```

`tools/curate-class-art.py` 和 `tools/curate-art.py` 是早期PNG归档流程；新增角色素材应走上面的符号映射与导出流程。

## 验证

`character-pose.test.ts` 防止再次错认部位，遍历职业/武器/换弹/移动状态验证姿态与枪口，并验证左右镜像。

`tests/gameplay/character-art.spec.ts` 从真实Phaser渲染器导出24种职业/姿态组合到 `artifacts/qa/character-anatomy-review.png`，与配装页截图共同检查。刀盾16方向、调试切换、联机与离线包继续执行已有回归。
