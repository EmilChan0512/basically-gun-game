import { build } from 'esbuild';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { packageContentVersion } from './package-content.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = join(root, 'artifacts/project-strike-server');
mkdirSync(join(folder, 'licenses'), { recursive: true });
await build({ absWorkingDir: root, entryPoints: ['server/main.ts'], outfile: join(folder, 'server.cjs'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  external: ['bufferutil', 'utf-8-validate'], legalComments: 'eof' });
copyFileSync(join(root, 'node_modules/ws/LICENSE'), join(folder, 'licenses/ws-MIT.txt'));
writeFileSync(join(folder, 'START.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nnode server.cjs\r\npause\r\n');
writeFileSync(join(folder, 'README.txt'), `Project Strike 权威服务器

需要 Node.js 22.12+。无需 npm install，无需原游戏或开发源码。
Windows 双击 START.cmd，其他系统运行 node server.cjs。
默认 ws://127.0.0.1:4180，仅本机可连接。Ctrl+C 停止，活动房间不会保存。

局域网：PowerShell 设置 $env:HOST='0.0.0.0' 后运行 node server.cjs。
如需换端口：$env:PORT='4181'。按操作系统提示允许所需的网络访问。
客户端使用服务器所在电脑的局域网IP，例如 ws://192.168.1.10:4180。
客户端自身的127.0.0.1指向客户端电脑，不能用来连接另一台电脑。

每房间最多8个真人席位（含观战）；支持PvP、合作生存、公文包。
大厅选择地图/模式/职业/配装，所有人准备后由房主开局。换配装取消准备。
刀类仅限刺客，盾牌仅限重装兵；服务器验证职业与配装，不能在战斗中更改。
开局后加入先观战；断线30秒内可用原页面“断线重连”恢复席位。
超过保留期限需重新加入；服务器重启不支持恢复旧房间。
联机账号与本机战役账号独立。先注册/登录并选择职业、技能和配装，再进入普通房间。
金币、已购枪械/道具、各职业经验及配装保存在服务端 data/accounts.json。可用 ACCOUNT_DATA_DIR 指定固定目录；
生产 systemd 使用 /var/lib/project-strike。升级程序时保留该目录，勿提交或发送数据库。
单进程独占此目录；修改文件不是支持的管理接口。损坏存档会拒绝启动，不会覆盖为新档。
公共调试房间仍允许游客并开放全部装备，不产生养成奖励。普通联机检查账号解锁进度。
生产模式默认要求本机TLS反向代理/WSS。当前无域名测试部署显式设置 ALLOW_INSECURE_ACCOUNTS=true，
允许公网WS账号登录；WS未加密，请使用独立测试密码。后续接入WSS后关闭此开关。

公网部署另需可达主机和TLS反向代理。HTTPS客户端必须连接wss地址。
此包不会自动设置防火墙、TLS或公开服务器；暂不含公开匹配/排位。
客户端与服务器必须来自相同内容版本，否则连接会被拒绝。
配套客户端见 project-strike-local；打开其页面后进入 ?online 联机入口。
`);
writeFileSync(join(folder, 'manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), contentVersion: packageContentVersion(), node: '>=22.12',
  entry: 'server.cjs', sha256: createHash('sha256').update(readFileSync(join(folder, 'server.cjs'))).digest('hex'),
  dependencies: 'ws bundled; optional native accelerators omitted', persistentRooms: false, persistentAccounts: true, accountSchema: 1 }, null, 2));
console.log(`Server package: ${folder}`);
