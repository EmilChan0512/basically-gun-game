# 公网后端 CI/CD

目标服务器：`43.142.165.82`（Ubuntu 24.04，SSH 22）。2026-09-11 已完成 Node.js 22、运行/部署用户、systemd 和独立 journal 初始化；GitHub 已配置 production 环境、专用部署密钥、固定主机公钥和部署开关。实际发布结果以 Actions 的 deploy job 为准。

## 流程

`.github/workflows/backend.yml` 在 PR 和 main 推送时运行 `npm ci`、`npm run check`，打包客户端和服务端，并用独立目录里的真实 WebSocket 会话验证服务端。Actions 保存以提交 SHA 命名的 backend/client 两份产物，保留 14 天。

发布门槛还包括 Chromium 中的公共调试配装、技能/道具、刀盾和重连测试，以及生产离线包验证。失败时上传浏览器测试记录与QA截图，保留7天。独立服务端包探测覆盖实时职业/装备/技能切换，客户端与服务端必须具有一致的内容指纹。

只有 main 且仓库变量 `DEPLOY_ENABLED=true` 时才进入 production 部署；也可以在 Actions 手动运行 main。部署通过专用 SSH 用户上传打包结果，服务器无需 Git、npm install 或 GitHub 凭据。部署串行执行，不中断进行中的部署；排队后已不是最新 main 的提交跳过部署。

每次发布写入 `/opt/project-strike/releases/<SHA>-<run>-<attempt>`，校验归档及服务端 SHA256，原子切换 `current` 链接，重启 systemd，检查 WebSocket welcome 的协议和内容版本。启动失败恢复旧链接并重启旧版本，首次部署失败则停止服务。所有发布目录保留，需定期查看磁盘用量。进程崩溃由 systemd 自动重启；开机自启。

**每次部署会中断现有对局，房间和重连身份不会持久化。** 客户端与服务器必须使用相同内容版本，建议从同一次 Actions 下载客户端。

联机账号版本新增 `/var/lib/project-strike/accounts.json` 持久化金币、各职业经验和配装。旧服务由CI使用已有管理员 `SSH_PRIVATE_KEY` 做一次固定配置迁移（StateDirectory），后续发布跳过此步骤，日常部署用户权限不变。当前无域名，按测试要求显式启用WS账号兼容模式；后续切WSS时关闭 `ALLOW_INSECURE_ACCOUNTS`。账号数据不在发布目录，发布和回滚不得覆盖它；详见 [联机账号与进度](ONLINE_ACCOUNTS.md)。

## SSH 可用后的一次性初始化

以下假设服务器运行 Ubuntu/Debian 类 Linux + systemd 245 以上（如 Ubuntu 22.04/24.04）；日志隔离使用 LogNamespace，拿到 SSH 后先确认系统。当前不要直接在 Windows 执行这些 Linux 命令。

1. 在服务器安装 Node.js 22 LTS（至少 22.12），确保系统级 `/usr/bin/node` 可用，不使用仅登录用户可见的 nvm 路径。还需要 bash、sudo、tar、coreutils 和 util-linux（flock）。
2. 把仓库 `deploy/` 目录传到服务器，管理员执行 `sudo bash deploy/install.sh`。该脚本创建隔离的运行用户 `strike` 和部署用户 `strike-deploy`，安装服务及有限的 sudo 权限，仅允许部署用户 restart/stop 此服务。首次部署前服务尚未启动。
3. 创建专用于 GitHub Actions 的 SSH 密钥对，把公钥加入 `/home/strike-deploy/.ssh/authorized_keys`，设置所有者 `strike-deploy:strike-deploy`、权限 600。建议公钥行加 `restrict` 前缀，禁止转发和 PTY，保留部署命令所需的非交互执行。个人管理员私钥无需放进仓库或聊天记录。
4. 通过可信的管理员连接核对服务器 SSH host key 指纹，保存对应的完整 known_hosts 行。不要在 CI 临时扫描后无条件信任，也不要关闭 host key 检查。非 22 端口的条目使用 `[43.142.165.82]:端口`。
5. 在云安全组和系统防火墙放行实际 SSH 端口及 TCP 4180。当前服务监听 `0.0.0.0:4180`；可按测试人员 IP 限制游戏端口访问。脚本不会修改防火墙。

## GitHub 配置

仓库 Settings → Secrets and variables → Actions：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Repository variable | `DEPLOY_ENABLED` | 初始化完成后设为 `true`；缺省或 `false` 只运行 CI |
| Variable | `DEPLOY_HOST` | `43.142.165.82`（默认值，可省略） |
| Variable | `DEPLOY_PORT` | `22`（默认值，可省略） |
| Secret | `DEPLOY_SSH_KEY` | 专用部署用户的完整无口令私钥 |
| Secret | `DEPLOY_KNOWN_HOSTS` | 经核对的服务器 known_hosts 完整行 |

创建名为 `production` 的 Environment，可将部署 secrets/主机端口变量放在该环境中；`DEPLOY_ENABLED` 必须是仓库变量，因为 job 启动前要读取它。可限制该环境仅 main 部署。若希望每次全自动更新，不配置 required reviewers。

当前部署使用 `DEPLOY_SSH_KEY` 对应的 `strike-deploy` 专用账号。已有的管理员 `SSH_PRIVATE_KEY` 仅用于尚未设置StateDirectory的服务器的一次性账号存储升级；配置完成后只使用专用部署密钥。

初始化完成并配置好以上内容后启用开关，Actions → Backend CI and deploy → Run workflow → main。后续 main 推送自动更新；PR 只验证。若 CI 未通过，不会替换服务器。工作流必须先提交并推送到 GitHub 才会生效。

## 联机测试和运维

从成功发布的 Actions 下载 `client-<SHA>` 并解压，运行 `PLAY.cmd`（其他系统运行 `node tools/serve-game.mjs`），打开 `http://127.0.0.1:4175/?online`。服务器输入 `ws://43.142.165.82:4180`，两台设备分别建房/加入。

现在同端口提供公网网页和 WebSocket，浏览器打开 http://43.142.165.82:4180/ 即可。以后配置 HTTPS 时需反向代理同时转发网页与 WebSocket，并把后端改为仅本机监听。当前流程不依赖域名。

服务器上排查：

```bash
sudo systemctl status project-strike.service
sudo journalctl --namespace=project-strike -u project-strike.service -n 100 -o cat --no-pager
cat /opt/project-strike/current/REVISION
node /opt/project-strike/current/probe.mjs
```

部署后的本机探测不代表公网防火墙已连通；第一次发布后还需从玩家设备完成建房、加入和开局验收。

日志格式、筛选命令、级别与保留策略见 [服务端日志](SERVER_LOGGING.md)。初始化会安装独立 journal 配置；以后修改 service 或日志保留配置，需要管理员重新运行初始化脚本并重启游戏服务，普通 CI 发布仅替换应用包。

手动回退优先在 Git 中 revert 问题改动后推送 main，让 CI 发布修复后的最新提交。需要立即恢复时，先关闭 `DEPLOY_ENABLED`，待正在执行的部署结束，管理员把 `current` 切到已验证的旧 release，重启并探测；同时切换对应客户端。保留当前和准备回退的发布目录。

## 浏览器直接访问（2026-09-12）

服务端包现在包含生产前端 `dist/`。网页、WebSocket 和 `/admin/` 共用 4180 端口，玩家打开 http://43.142.165.82:4180/ 即可进入大厅，点击“公共调试房间”试玩，或登录后创建/加入普通房间。`/?offline` 为免登录单机入口（首次加载仍需要网络）。公网网页自动使用同源 WS/WSS，无需填写服务器地址。

本地 `npm run release` 仍生成包含网页和后端的完整服务端包。GitHub Actions 的生产部署当前使用后端优先包：复用当前 release 的 `dist` 静态客户端，只传输服务端 bundle；部署脚本会在激活前强制确认新旧 `contentVersion` 相同，防止前后端协议不一致。内容版本变更时必须改回完整前端发布。`WEB_ROOT` 可覆盖静态资源路径，默认工作目录下的 dist；仅此目录公开，账号数据仍在 /var/lib/project-strike。

当前入口沿用无域名 HTTP/WS 部署；配置 HTTPS 反向代理时需同时转发网页和 WebSocket。Windows 便携发行包仍按仓库要求保留，作为可选下载。
