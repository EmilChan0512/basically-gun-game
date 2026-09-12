import { createGameServer } from './serve-game.mjs';
import { execFile } from 'node:child_process';

const testing = process.argv.includes('--test');
let port = testing ? 0 : 4175;
const server = createGameServer();
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < 4195) { server.listen(++port, '127.0.0.1'); return; }
  console.error('启动失败：' + error.message); process.exitCode = 1;
});
server.on('listening', () => {
  const url = `http://127.0.0.1:${server.address().port}/${process.argv.includes('--solo') ? '?offline' : '?online'}`;
  console.log(`破晓行动已启动：${url}`);
  console.log('请保持此窗口打开，结束游戏时关闭窗口即可。');
  if (!testing) execFile('cmd.exe', ['/d', '/c', 'start', '', url], { windowsHide: true }, error => {
    if (error) console.log('请复制上面的地址到浏览器打开。');
  });
});
server.listen(port, '127.0.0.1');
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
