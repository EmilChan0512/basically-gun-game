import { cpSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
// Versioned output directory; do not delete unrelated files or previous releases.
const folder = join(root, 'artifacts', 'project-strike-local');
mkdirSync(join(folder, 'tools'), { recursive: true });
mkdirSync(join(folder, 'licenses'), { recursive: true });
cpSync(join(root, 'dist'), join(folder, 'dist'), { recursive: true });
cpSync(join(root, 'tools', 'serve-game.mjs'), join(folder, 'tools', 'serve-game.mjs'));
cpSync(join(root, 'node_modules', 'phaser', 'LICENSE.md'), join(folder, 'licenses', 'Phaser-MIT.txt'));
cpSync(join(root, 'node_modules', 'eventemitter3', 'LICENSE'), join(folder, 'licenses', 'EventEmitter3-MIT.txt'));
writeFileSync(join(folder, 'PLAY.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n echo Node.js 20+ is required.\r\n pause\r\n exit /b 1\r\n)\r\necho Open http://127.0.0.1:4175/ in your browser after the server starts.\r\nnode tools\\serve-game.mjs\r\npause\r\n');
writeFileSync(join(folder, 'README.txt'), 'Project Strike - 破晓行动\n\nWindows: 双击 PLAY.cmd，打开 http://127.0.0.1:4175/。需已安装Node.js 20+，无需npm install或联网。\n其他系统: node tools/serve-game.mjs\n请保持服务窗口打开，Ctrl+C关闭。若端口占用: node tools/serve-game.mjs --port 4176\n\n四关原创短篇单人战役。A/D移动，W/空格跳跃，S蹲伏，鼠标射击，Q切枪，R换弹，Esc暂停。\n进度保存于浏览器本地存储。同一浏览器、地址和端口下可继续；更换端口会使用另一份进度。\n');
appendFileSync(join(folder, 'README.txt'), '\n账号与养成版本：创建本机账号后进入职业与军械库。包含医疗兵、刺客、突击兵、重装兵；8种职业技能、7种枪械、3种道具。E发动技能，G使用道具。\n完成任务或失败结算会获得经验和军资；可购买枪械、分配训练点，再带新配装出战。不同账号独立存档，每个职业独立升级。\n账号仅在当前浏览器本机使用，无联网或云同步。首次注册继承旧匿名战役的关卡进度；清除浏览器网站数据会删除本机账号。临时试玩不保存。\n');
console.log(`Offline game package: ${folder}`);
