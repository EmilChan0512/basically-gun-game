# 公网后端 CI/CD

目标服务器：`43.142.165.82`（Ubuntu 24.04，SSH 22）。2026-09-11 已完成 Node.js 22、运行/部署用户、systemd 和独立 journal 初始化；GitHub 已配置 production 环境、专用部署密钥、固定主机公钥和部署开关。实际发布结果以 Actions 的 deploy job 为准。

## 流程

`.github/workflows/backend.yml` 在 PR 和 main 推送时运行 `npm ci`、`npm run check`，打包客户端和服务端，并用独立目录里的真实 WebSocket 会话验证服务端。Actions 保存以提交 SHA 命名的 backend/client 两份产物，保留 14 天。

发布门槛还包括 Chromium 中的公共调试配装、技能/道具、刀盾和重连测试，以及生产离线包验证。失败时上传浏览器测试记录与QA截图，保留7天。独立服务端包探测覆盖实时职业/装备/技能切换，客户端与服务端必须具有一致的内容指纹。

只有 main 且仓库变量 `DEPLOY_ENABLED=true` 时才进入 production 部署；也可以在 Actions 手动运行 main。部署通过专用 SSH 用户上传打包结果，服务器无需 Git、npm install 或 GitHub 凭据。部署串行执行，不中断进行中的部署；排队后已不是最新 main 的提交跳过部署。

每次发布写入 `/opt/project-strike/releases/<SHA>-<run>-<attempt>`，校验归档及服务端 SHA256，原子切换 `current` 链接，重启 systemd，检查 WebSocket welcome 的协议和内容版本。启动失败恢复旧链接并重启旧版本，首次部署失败则停止服务。所有发布目录保留，需定期查看磁盘用量。进程崩溃由 systemd 自动重启；开机自启。

**每次部署会中断现有对局，房间和重连身份不会持久化。** 客户端与服务器必须使用相同内容版本，建议从同一次 Actions 下载客户端。

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

当前部署使用 `DEPLOY_SSH_KEY` 对应的 `strike-deploy` 专用账号。已有的 `SSH_PRIVATE_KEY` 保留，但此工作流不读取它；管理员 `ubuntu` 的私钥也不用于自动部署。

初始化完成并配置好以上内容后启用开关，Actions → Backend CI and deploy → Run workflow → main。后续 main 推送自动更新；PR 只验证。若 CI 未通过，不会替换服务器。工作流必须先提交并推送到 GitHub 才会生效。

## 联机测试和运维

从成功发布的 Actions 下载 `client-<SHA>` 并解压，运行 `PLAY.cmd`（其他系统运行 `node tools/serve-game.mjs`），打开 `http://127.0.0.1:4175/?online`。服务器输入 `ws://43.142.165.82:4180`，两台设备分别建房/加入。

现在部署的是 WebSocket 后端，不提供公网网页。上述本机 HTTP 客户端可连接 ws；如果以后把客户端发布到 HTTPS 网站，需配置域名、TLS 反向代理和 `wss://`，并把后端改为仅本机监听。当前流程不依赖域名。

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
