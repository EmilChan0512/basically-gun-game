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
大厅选择地图/模式/配装，所有人准备后由房主开局。换配装取消准备。
开局后加入先观战；断线30秒内可用原页面“断线重连”恢复席位。
超过保留期限需重新加入；服务器重启不支持恢复旧房间。
进程内临时身份与本机战役账号独立；不保存在线养成或房间数据。

公网部署另需可达主机和TLS反向代理。HTTPS客户端必须连接wss地址。
此包不会自动设置防火墙、TLS或公开服务器；暂不含公开匹配/排位。
客户端与服务器必须来自相同内容版本，否则连接会被拒绝。
配套客户端见 project-strike-local；打开其页面后进入 ?online 联机入口。
`);
writeFileSync(join(folder, 'manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), contentVersion: packageContentVersion(), node: '>=22.12',
  entry: 'server.cjs', sha256: createHash('sha256').update(readFileSync(join(folder, 'server.cjs'))).digest('hex'),
  dependencies: 'ws bundled; optional native accelerators omitted', persistentRooms: false }, null, 2));
console.log(`Server package: ${folder}`);
