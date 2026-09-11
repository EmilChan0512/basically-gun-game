import { cpSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { packageContentVersion } from './package-content.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// Versioned output directory; do not delete unrelated files or previous releases.
const folder = join(root, 'artifacts', 'project-strike-local');
const contentVersion = packageContentVersion();
mkdirSync(join(folder, 'tools'), { recursive: true });
mkdirSync(join(folder, 'licenses'), { recursive: true });
cpSync(join(root, 'dist'), join(folder, 'dist'), { recursive: true });
cpSync(join(root, 'tools', 'serve-game.mjs'), join(folder, 'tools', 'serve-game.mjs'));
cpSync(join(root, 'node_modules', 'phaser', 'LICENSE.md'), join(folder, 'licenses', 'Phaser-MIT.txt'));
cpSync(join(root, 'node_modules', 'eventemitter3', 'LICENSE'), join(folder, 'licenses', 'EventEmitter3-MIT.txt'));
writeFileSync(join(folder, 'PLAY.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n echo Node.js 22.12+ is required.\r\n pause\r\n exit /b 1\r\n)\r\necho Open http://127.0.0.1:4175/ in your browser after the server starts.\r\nnode tools\\serve-game.mjs\r\npause\r\n');
writeFileSync(join(folder, 'README.txt'), 'Project Strike - 破晓行动\n\nWindows: 双击 PLAY.cmd，打开 http://127.0.0.1:4175/。需已安装Node.js 22.12+，无需npm install。默认联网大厅；单机免登录入口为 ?offline。\n其他系统: node tools/serve-game.mjs\n请保持服务窗口打开，Ctrl+C关闭。若端口占用: node tools/serve-game.mjs --port 4176\n\n四关原创短篇单人战役。A/D移动，W/空格跳跃，S蹲伏，鼠标射击，Q切枪，R换弹，Esc暂停。\n进度保存于浏览器本地存储。同一浏览器、地址和端口下可继续；更换端口会使用另一份进度。\n');
appendFileSync(join(folder, 'README.txt'), '\n账号与养成版本：联网账号登录后进入图形化出战配装；单机免登录也可使用独立军械库。包含医疗兵、刺客、突击兵、重装兵；8种职业技能、54种枪械、六种近战与六种盾牌副手、3种道具。E发动技能，G使用道具。\n完成任务或失败结算会获得经验和军资；可购买枪械、分配训练点，再带新配装出战。联网账号独立保存资产，四职业分别成长至50级；单机存档不影响联网资产。\n账号均为联网账号，资产由服务器保存；单机免登录，离线存档只保存在当前浏览器。\n');
console.log(`Offline game package: ${folder}`);
writeFileSync(join(folder, 'manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), contentVersion, node: '>=22.12', entry: 'PLAY.cmd' }, null, 2));
appendFileSync(join(folder, 'README.txt'), '\n扩展版本：自定义地图包含失控飞机；单机支持公文包运送计分和雷达。刺客可装备六种近战，重装兵可装备六种盾牌，按职业Lv.2/8/14/20/26/32免费解锁；Q切换，点击攻击刺击/挥砍，按住攻击举盾。盾随鼠标360度转向，正面160度内减伤70%—90%，部分型号可反弹子弹或额外防爆，无消耗耐久；侧后方可绕防。\n联机入口：http://127.0.0.1:4175/?online 。配套独立服务器位于project-strike-server；客户端包自身不启动权威服务器。在线支持最多8真人席位，PvP、合作生存和公文包，按房间地图兼容性选择。\n联机需注册/登录服务端账号，进入房间前可选职业、技能、武器和道具；金币、购买和各职业等级由服务端保存，独立于本机单人进度。普通配装检查解锁条件，公共调试房间仍可游客试玩全部装备。当前测试服务器支持WS降级登录，请使用独立测试密码；后续可改用管理员提供的WSS地址。更改配装后需重新准备；断线30秒内在原页面使用断线重连。多人服务器重启不恢复活动房间。服务器与客户端必须来自同一内容版本。\n单人PvE脚本自动通关为非阻塞诊断；此版本不声明已完成人工跨设备8人或真实设备性能验收。\n');
