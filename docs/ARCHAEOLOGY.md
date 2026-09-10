# Phase 0 本地考古流程

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
