# 职业副手与原版参考

刀类和盾牌均占用副手槽，Q在主枪与副手之间切换；特殊副手装备时不允许主枪开火。刺客专属六种近战，重装兵专属六种盾牌。单机与普通联机按各自账号的职业Lv.1—6免费解锁；公共调试房间统一开放型号，服务器仍校验职业限制。普通联机切换职业恢复该职业保存的配装并取消准备，调试切换职业将副手恢复为USP。存档中旧的跨职业刀盾改回USP，其他成长记录保留。

| 职业等级 | 刺客近战（原版名） | 基础伤害 / 判定距离 | 重装兵盾牌（原版名） | 正面减伤 / 子弹反弹 |
| --- | --- | --- | --- | --- |
| 1 | 战术刀 Knife | 50 / 60 | 防弹盾 Riot | 75% / 10% |
| 2 | 棒球棍 Bat | 85 / 80 | 警用盾 Police | 80% / 5% |
| 3 | 警棍 Baton | 65 / 60 | 防爆盾 Blast | 78% / 0% |
| 4 | 九号铁杆 Nine Iron | 110 / 80 | 轻型圆盾 Pointy | 72% / 0% |
| 5 | 砍刀 Machete | 90 / 60 | 重型肉盾 Meat | 90% / 0% |
| 6 | 武士刀 Katana | 150 / 80 | 角斗士盾 Siegius | 70% / 30% |

防爆盾将正面爆炸剩余伤害再乘0.3；环境坠落伤害不受盾影响。盾牌按住攻击6帧举起，松开、死亡或收起时停止格挡。盾牌显示位置围绕持盾手的瞄准原点旋转，判定沿同一瞄准向量，360度无角度接缝；有效防御范围为朝向左右各80度。子弹、近战和爆炸从范围外袭来均可绕防。盾牌不消耗耐久，旧状态中的durability仅保留结构兼容，不再显示或参与防御计算。

刀类每次点击发动一次攻击，按住不重复；攻击方向锁定，角色移动可带动攻击原点。短刀3帧前摇、2帧攻击、7帧恢复，长武器4/2/9帧；攻击和恢复期间不可切枪，强制收起不会清除恢复时间。攻击为短距离前向射线，先命中者承受一次伤害；不是范围群攻。当前地图墙体以逐像素采样检查，防止薄墙被近战穿透。

盾牌反弹沿盾面法线计算反射向量，并加入原版±10度散布；反射光线走真实墙体与角色判定，伤害归持盾者。已经反弹的子弹不能再次反弹，避免无限循环；仍然可以被另一面盾减伤。多人可见性过滤保留反弹来源身份，反射光线从碰撞点画出，不冒充枪口射击。

## 参考与适配边界

本轮只读取静态ActionScript、SWF时间轴标签和既有PNG导出，没有运行原游戏。

- `Stats_Classes`：原作Assassin对应sniper，Tank对应tank。按照当前项目的职业ID关联装备。
- `Stats_Guns`：提取六种近战、六种盾牌名称、近战基础伤害/距离、盾反弹率及Blast防爆系数。原作盾减伤仅10%—45%；按本轮“格挡大部分伤害”的要求提高为70%—90%，不宣称这些强化数值来自原作。
- `Bullet_Melee_Basic`：前向短射线与首个命中；当前使用更密的墙体采样和现有30Hz攻击窗口适配。
- `Bullet.doHitEffect`、`Status`：朝向差小于80度、概率反弹和乘法减伤。以点积处理角度环绕；所有盾均可减伤，反弹与减伤独立。
- `Guns.setFrame`：knife/sword不同动作。`MBFZ_fla.arm_gun_316`的knife_fire标签为538、下一标签550；sword_fire为551、下一标签566，即12/15帧。当前恢复原作双臂、手掌及刀身的时间轴变换，并将接触帧适配到现有前摇/攻击/恢复窗口；刀具采用原作局部坐标 SVG。详见 [隐匿与角色动态](STEALTH_AND_ANIMATION.md)。
- 原版刀盾属于职业主装备体系；本项目遵照当前要求放在副手槽，不照搬原版持盾同时使用副枪的安排。
- 原版独立暴击、反弹特殊爆炸物等尚未纳入当前简化伤害体系，本轮不增加随机近战暴击或新爆炸武器。

## 素材与重建

`public/assets/reference/offhand-manifest.json`包含18张未修改的PNG（6种近战、6种盾及盾背面）的时间轴标签、帧号与SHA256。盾牌绘制使用透明裁边帧；刀类局内绘制已切换为 public/assets/characters 下的矢量素材，直接保留原作坐标及持刀关节，避免原112×68画布引起手持偏移。

```powershell
npx tsx tools/archaeology/offhand-art.ts
python tools/curate-offhand-frames.py
npm run check
npx playwright test tests/gameplay/offhand.spec.ts tests/gameplay/offhand-online.spec.ts tests/gameplay/offhand-variants.spec.ts tests/gameplay/art.spec.ts
npm run package:game
npm run package:server
npm run test:offline
```

预览：`artifacts/qa/offhand-variants.png`、`artifacts/qa/offhand-shield.png`、`artifacts/qa/offhand-online-shield.png`。测试覆盖职业/等级限制、旧存档迁移、全部型号复活/恢复、16方向与±180度接缝、侧后绕防、近战首个命中、反弹去循环/墙体遮挡、八客户端150ms RTT判定和实际大厅重连。客户端与服务器内容指纹均需更新，旧线上服务器会拒绝新客户端，配套服务器包必须同步使用。

本轮验证：`npm run check`通过（58个测试文件、310项单元测试，含模拟边界/素材检查和生产构建）；美术、副手操作与联机显示7项浏览器测试通过；生产离线3项测试通过。客户端和服务器本机发行包已同步生成，公网发布以 Actions deploy job 结果为准。
