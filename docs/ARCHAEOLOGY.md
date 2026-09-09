# Phase 0 本地考古流程

执行 `npm install`、`npm run archaeology`。没有 SWF 时生成空清单及明确的 `AWAITING_REFERENCE` 状态，提供手动导入指引。这不代表发现了原版数据。

1. 将你有权研究的 SFH1 原版 SWF 放在 `archaeology/swf/sfh1_reference.swf`。
2. 安装 [JPEXS FFDec](https://github.com/jindrapetrik/jpexs-decompiler/releases)。PowerShell 设置 `$env:FFDEC_PATH = 'C:\Tools\ffdec\ffdec-cli.exe'`。也支持 `ffdec.jar`（需要 Java）。不用 GUI 程序或批处理包装器。
3. 运行 `npm run archaeology`。也可 `npm run archaeology -- --swf 'D:\research\sfh1.swf' --ffdec 'C:\Tools\ffdec\ffdec-cli.exe'`。
4. 工具以官方 CLI 的 `script,image,sprite,shape,sound,binaryData,symbolClass` 导出。FFDec 自己组织输出子目录，索引器递归扫描，不假定其目录命名。
5. 查看 `archaeology/local/inventory.json`、`first-pass-report.md`、`workflow-status.json`。索引包含包、类、常量表达式、概念候选、武器/职业候选及 import 引用边。AS2 时间线脚本也纳入清单。
6. 对照源码行号和 SHA256 人工验证候选，再向 `reverse_engineering_db.json` 添加记录，并运行 `npm run archaeology:validate`。关键词、声明右值和 import 关系只是启发式匹配，不是完整 AS 解析器；混淆代码、字符串、复杂表达式可能误报/漏报。

已有导出可单独运行 `npm run archaeology:index -- --input 'D:\research\exports'`。默认 SWF 缺失是成功的引导流程；FFDec 实际执行失败返回非零退出码。严格参考资料验收使用 `npm run archaeology -- --require-reference`，缺少参考资料会失败。

安装 [Ruffle 桌面版](https://ruffle.rs/downloads)，设置 `$env:RUFFLE_PATH = 'C:\Tools\ruffle\ruffle.exe'`，执行 `npm run reference` 或 `npm run reference -- --swf 'D:\research\sfh1.swf'`。Ruffle 兼容性不等同于原 Flash 行为，应记录运行器版本。

本次没有提供 SWF，也没有 FFDec/Java/Ruffle，因此不能声称完成真实 SWF 的提取和运行验证。不从不明镜像自动获取专有游戏。工具已提供实际执行路径和可测试的手动回退。合成测试源码只验证工具行为，不进入历史证据库。

CLI 选项依据：https://github.com/jindrapetrik/jpexs-decompiler/wiki/Commandline-arguments （2026-09-09 核对）。
