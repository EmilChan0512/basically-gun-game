# Phase 0 本地考古流程

## 2026-09-10 第四批定向补充
第四批回归已于2026-09-10在Windows工作区收尾：旧暂停单步用例保留“等待 Phaser 实际推进”的检查，全量16个Chromium测试通过；`npm run check`通过（62个单元测试、63条证据校验、资产隔离、TypeScript及生产构建）。本次只重跑复刻回归并核对证据分类，未重新执行下述macOS导出，也未新增原版OBSERVED证据。验收与剩余偏差见[验收状态](ACCEPTANCE.md)和[对照报告](REPLICA_COMPARISON.md)。

沿用本地固定哈希SWF、FFDec26.2.1和便携JRE，补充导出`Status`与`UT`的AS/P-code，当前共13类。复现命令如下（AS导出将`script:pcode`改为`script:as`、输出目录改为`archaeology/exported`）：

```sh
tools/vendor/java/jdk-21.0.12.1+1-jre/Contents/Home/bin/java \
  -Djava.awt.headless=true -jar tools/vendor/ffdec/ffdec.jar -onerror abort \
  -selectclass 'Status,UT' -format script:pcode \
  -export script archaeology/local/phase3-pcode archaeology/swf/sfh1_reference.swf
```

核对范围为`Bullet_Line_Basic`飞行循环、`Bullet`射程与单位命中、`UT.irand/inBox`及`Status.damage`头部条件与`Unit`基础headBonus。P-code确认站立分支使用66高、蹲姿44高，`headMult=1.5`不能直接当伤害因子，基础headBonus为1.45。

新增5条EXTRACTED及1条TUNED适配记录；总63条：39 EXTRACTED、7 INFERRED、17 TUNED、0 OBSERVED。研究哈希清单位于gitignored的`archaeology/local/phase3-pcode/batch4-review-manifest.json`。本批未运行原版采样；不沿用上批HUD初查作为本批验证。

## 2026-09-10 macOS恢复与第三批核对

本次新工作区只有Git追踪内容，`archaeology/swf`、`exported`、`local`和`tools/vendor`中的既有研究产物并未随仓库迁移。以下“本机已有”描述属于上一次执行现场。已运行`npm ci`、`npm run archaeology:acquire`，再次取得同一固定哈希SWF；这不是新的版本基线。

本次工具：FFDec 26.2.1（沿用`toolchain.json`的ZIP及SHA256）；Temurin JRE 21.0.12.1+1 macOS aarch64便携包；Ruffle web 0.6.0。JRE来源为官方[发布包](https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.12.1_1.tar.gz)，SHA256 `dec50fc6f9fcd4fe3ae8cabf5a5fa68f6afc48841f7698e468e9aa5d54beed84`，下载与校验后解包至`tools/vendor/java`，不修改全局Java。现有`setup.ps1`清单仍是Windows版本，不应在macOS直接执行。

在本次已恢复的macOS环境，可重复导出：

```sh
tools/vendor/java/jdk-21.0.12.1+1-jre/Contents/Home/bin/java \
  -Djava.awt.headless=true -jar tools/vendor/ffdec/ffdec.jar -onerror abort \
  -selectclass 'Guns,Stats_Guns,Player,UnitMC,Bullet,Bullet_Line_Basic,Stats_Classes,Unit,Game,Movement,MBFZ_fla.arm_gun_316' \
  -format script:pcode -export script archaeology/local/phase3-pcode archaeology/swf/sfh1_reference.swf
```

本轮共定向导出11类，AS导出将格式改为`script:as`、输出改为`archaeology/exported`。不是全量491脚本恢复；如对当前目录重新索引，脚本数反映这次定向导出的范围，不能抄用历史全量统计。通用CLI调用JAR时在macOS显式传`--java tools/vendor/java/jdk-21.0.12.1+1-jre/Contents/Home/bin/java`，因为当前自动发现仍优先寻找`java.exe`。

本机npm镜像返回Ruffle版本不存在，显式官方registry成功取得固定版本：

```sh
mkdir -p tools/vendor/ruffle-web
npm pack @ruffle-rs/ruffle@0.6.0 --registry=https://registry.npmjs.org --pack-destination tools/vendor/ruffle-web
tar -xzf tools/vendor/ruffle-web/ruffle-rs-ruffle-0.6.0.tgz -C tools/vendor/ruffle-web
node tools/archaeology/reference-browser.mjs
```

新建本地Player存档，实际进入Foundry / Deathmatch / FFA / Very Easy，关闭Skills与Killstreaks，Modifier None。默认Medic等级1、85HP、M4备用78，暂停画面可复查。只做了HUD初查，没有归档录像或计时采样，不新增OBSERVED记录。运行笔记见`archaeology/local/phase3-observation-macos.md`。

第二批核对内容为M4配置、射击计数与更新顺序、扳机锁、Medic等级1弹药因子。第三批直接读取`archaeology/exported/scripts/MBFZ_fla/arm_gun_316.as`、`UnitMC.as`和`Guns.as`，并以只读脚本解析固定SWF的DefineSprite 501嵌套`FrameLabel`：`pistol_reload`位于第9帧、`doneReload`位于第37帧；`rifle_reload`位于第81帧、`doneReload`位于第115帧。标签差值分别为28/34次动画推进。

第三批新增2条EXTRACTED证据，当前合计57条：34 EXTRACTED、7 INFERRED、16 TUNED、0 OBSERVED。跨`ENTER_FRAME`与时间线帧脚本的同帧执行先后未从这些方法体确定，不升级为OBSERVED；范围与哈希见[行为对照表](ORIGINAL_BEHAVIOR_MATRIX.md)。

## 2026-09-10 Phase 3 研究入口

本轮已导出6个相关类的P-code，并将6条经审核的弹药/换弹/切枪事实写入证据库。对照表见 [ORIGINAL_BEHAVIOR_MATRIX.md](ORIGINAL_BEHAVIOR_MATRIX.md)。可重复导出命令：

```powershell
& 'tools/vendor/java/jdk-21.0.12.1+1-jre/bin/java.exe' '-Djava.awt.headless=true' -jar tools/vendor/ffdec/ffdec.jar -onerror abort -selectclass 'Guns,Stats_Guns,Player,UnitMC,Bullet,Bullet_Line_Basic' -format script:pcode -export script archaeology/local/phase3-pcode archaeology/swf/sfh1_reference.swf
npm run archaeology:index -- --input archaeology/exported
```

新增浏览器原版入口，已实际进入 SFH1 v1.2.1 快速比赛。本机已安装固定版本 Ruffle web 0.6.0；新环境安装和运行：

```powershell
New-Item -ItemType Directory -Force tools/vendor/ruffle-web | Out-Null
npm pack @ruffle-rs/ruffle@0.6.0 --pack-destination tools/vendor/ruffle-web
tar -xzf tools/vendor/ruffle-web/ruffle-rs-ruffle-0.6.0.tgz -C tools/vendor/ruffle-web
node tools/archaeology/reference-browser.mjs
```

打开 http://127.0.0.1:4180 。服务器启动前校验原版SWF固定哈希，只提供入口页、该SWF和Ruffle的JS/WASM，不暴露整个研究目录。它独立于生产应用，不会将原版资源打包进dist。原版使用鼠标射击、Q切枪、R换弹、Escape暂停；实验室保留L换弹、R重置，按键映射差异应记录。

本轮运行记录见 `archaeology/local/phase3-observation.md`。已进入对局并读取HUD，尚无逐帧录像或运动/射击时长测量。Ruffle web与本机桌面nightly版本不同，后续观测不能省略运行器版本。

## 既有工具流程与历史记录

执行 `npm install`、`npm run archaeology`。没有 SWF 时生成空清单及明确的 `AWAITING_REFERENCE` 状态，提供手动导入指引。这不代表发现了原版数据。

本机已经准备好参考 SWF、FFDec 26.2.1、Temurin JRE 21 和 Ruffle nightly-2026-09-09。新环境可以执行 `npm run archaeology:acquire` 从已核实的发行门户取得同一 SHA256 构建，再执行 `npm run archaeology:setup` 下载并校验官方便携工具。工具均保存在 `tools/vendor/`，不改全局 PATH、不需要管理员安装；CLI 自动发现本地工具，显式参数及环境变量可覆盖。

1. 将你有权研究的 SFH1 原版 SWF 放在 `archaeology/swf/sfh1_reference.swf`。
2. 安装 [JPEXS FFDec](https://github.com/jindrapetrik/jpexs-decompiler/releases)。PowerShell 设置 `$env:FFDEC_PATH = 'C:\Tools\ffdec\ffdec-cli.exe'`。也支持 `ffdec.jar`（需要 Java）。不用 GUI 程序或批处理包装器。
3. 运行 `npm run archaeology`。也可 `npm run archaeology -- --swf 'D:\research\sfh1.swf' --ffdec 'C:\Tools\ffdec\ffdec-cli.exe'`。
4. 工具以官方 CLI 的 `script,image,sprite,shape,sound,binaryData,symbolClass` 导出。默认读取 SWF 中的 sprite character ID 并显式选择每个 ID 的第 1 帧，生成首帧预览；完整动画通过 `npm run archaeology -- --full-sprites` 请求。本构建包含 324 个 sprite、18,618 个声明帧，完整渲染会很慢。FFDec 26.2.1 的 `all:1` 有空指针缺陷，所以使用显式 ID 避开。脚本、图像、声音、形状和符号映射不因此删减。FFDec 自己组织输出子目录，索引器递归扫描，不假定其目录命名。
5. 查看 `archaeology/local/inventory.json`、`first-pass-report.md`、`workflow-status.json`。索引包含包、类、常量表达式、概念候选、武器/职业候选及 import 引用边。AS2 时间线脚本也纳入清单。
6. 对照源码行号和 SHA256 人工验证候选，再向 `reverse_engineering_db.json` 添加记录，并运行 `npm run archaeology:validate`。关键词、声明右值和 import 关系只是启发式匹配，不是完整 AS 解析器；混淆代码、字符串、复杂表达式可能误报/漏报。

已有导出可单独运行 `npm run archaeology:index -- --input 'D:\research\exports'`。默认 SWF 缺失是成功的引导流程；FFDec 实际执行失败返回非零退出码。严格参考资料验收使用 `npm run archaeology -- --require-reference`，缺少参考资料会失败。

只读检查使用 `npm run archaeology:inspect`，解析 FWS/CWS 头、RECT、帧率和顶层 tag，不执行 ActionScript。`--output <directory>` 将报告写入指定位置，测试采用隔离临时目录，避免污染真实清单。含 `§§` 反编译栈伪代码的脚本会标记 `requiresBytecodeReview`，不能直接当可编译源代码或完整控制流。

安装 [Ruffle 桌面版](https://ruffle.rs/downloads)，设置 `$env:RUFFLE_PATH = 'C:\Tools\ruffle\ruffle.exe'`，执行 `npm run reference` 或 `npm run reference -- --swf 'D:\research\sfh1.swf'`。Ruffle 兼容性不等同于原 Flash 行为，应记录运行器版本。

参考文件现已主动取得并实际反编译，来源及校验结果见 REFERENCE_FINDINGS.md。Ruffle 可执行程序版本已检查，但尚未完成原版游戏运行/手感观测。合成测试源码只验证工具行为，不进入历史证据库。

CLI 选项依据：https://github.com/jindrapetrik/jpexs-decompiler/wiki/Commandline-arguments （2026-09-09 核对）。
