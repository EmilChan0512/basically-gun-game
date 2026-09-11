# 公文包目标模式：静态规则核对

2026-09-11。只读取已有反编译文件，未运行老游戏。已目视确认Guns_290符号375的flag1/flag2（第74/75帧）分别为蓝色/橙色公文包；名称虽为CTF，目标外观确实是公文包。现有静态PNG原样复制到public/assets/reference/briefcase-{1,2}.png，来源与SHA256记录在briefcase-manifest.json，可用`npx tsx tools/archaeology/delivery-art.ts`重复提取。

| 项目 | 静态证据 | 本游戏首版规则 |
| --- | --- | --- |
| 双方目标、运送计分 | Stats_Misc.as:155：ctf，bring it to your base，默认3分 | 双方各一个目标，交付+1，默认3分胜利 |
| 拾取 | NodeCtfFlag.as:100附近：敌方目标未被携带时设置unitCaptured/hasFlag | 存活角色触碰未被携带的敌方目标即拾取；同tick按稳定角色ID排序 |
| 交付 | NodeCtfFlag.capture同队分支，仅判断hasFlag，pscore+1并reset | 携带敌方目标触碰己方基地即可交付；不要求己方目标在家 |
| 死亡 | Unit.as:890调用hasFlag.reset | 立即回敌方目标原基地，不落地等待 |
| 复位 | NodeCtfFlag.reset清携带者引用、显示原目标、恢复动画 | 目标与载体引用原子清除；重连不重复生成目标 |
| 触碰区域 | Unit.as:1023：目标x-40、y-70、宽80、高95 | 以角色脚点检测相同区域；边界包含采用本游戏显式规则 |
| 隐身 | NodeCtfFlag.capture敌方分支将sInvis=0 | 拾取解除隐身；携带期间不允许重新隐身，后者为本游戏一致性设计 |
| 武器 | capture调用swapGuns；Guns.as:286令携带者切至secondary | 携带时限制副手；结束后恢复原选择，后者不声称完全复刻toggle行为 |
| 团队分 | MatchSettings.as:543起汇总两队pscore | 服务器保存团队交付分，不因玩家断线丢分 |
| AI | AI.as:221起，携带者寻路至己方flag节点 | 先实现取包、交付，再补护送和拦截 |

本游戏额外边界：断线离场、载体消失、越界统一立即复位；比赛超时同分为平局。原本路线图提出的dropped/returning与回收倒计时是可选未来变体，不进入此首版。公文包资源已确认，游戏中绘制和携带表现仍待接入。

目标状态机先独立于Battle实现，输入为稳定ID、队伍、存活和位置，输出拾取/交付/复位事件；ModeRules负责将交付事件写入团队分。Checkpoint保存两目标的载体ID。服务端负责生命、位置、越界与离场事实；客户端不能提交拾取或积分。雷达、世界绘制和AI读取同一目标状态。

剩余接入：地图双方基地插槽、ModeRules及Checkpoint联合类型、Battle事件/副手/隐身策略、网络快照与可见性、客户端表现、房间选择、八人同时接触/重连验收。独立状态机测试通过不等于模式已可玩。
