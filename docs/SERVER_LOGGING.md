# 服务端日志

`npm run server` 和独立 `server.cjs` 输出 JSON Lines：每行一条记录，带 UTC `time`、`level`、`event`、`service`、`pid`、`contentVersion` 和 `revision`。发布目录的 REVISION 提供 Git 提交号，源码启动标记为 development。

## 记录内容

| 事件 | 用途 |
| --- | --- |
| `server.started/stopping/stopped` | 启动地址、发布版本、停服信号 |
| `server.listen_error`、`process.fatal/unhandled_rejection` | 监听失败和致命异常；记录后以非零状态退出，由 systemd 重启 |
| `client.connected/disconnected/resumed/reconnect_expired` | 连接、关闭码、连接时长、重连及席位过期 |
| `room.created/joined/configured/closed/returned_to_lobby` | 房间、地图、模式、人数、轮次变化 |
| `match.started/ended` | 对局开始与结果；每场结束只记录一次 |
| `client.request_rejected/socket_error` | 协议、内容版本、非法请求、频率、超大 WebSocket 帧等问题 |
| `server.metrics` | 当前连接/房间/对局数、RSS 内存、运行时长、模拟耗时 P95/P99、区间连接/断开/错误/拒绝指令/跳过发送数 |
| `room.ready_changed/equipment_changed`（debug） | 准备状态与配装变化 |

`connectionId` 在每次新连接时生成，`playerId` 在成功重连后沿用，`roomId + round` 标识一场对局。关闭原因文本和原始请求、输入指令、状态快照、玩家昵称、客户端 IP、重连令牌均不记录。JSON 编码保证换行不会伪造新记录；日志字段也做敏感键脱敏和长度限制。

同一连接的请求警告最多每 10 秒一条，后续被抑制的数量在下一条警告或断开日志的 `suppressedWarnings` 中体现。每次请求错误仍计入 metrics，不逐帧写日志。`simulationP95Ms/P99Ms` 使用最近最多 2048 次模拟耗时样本，不是网络延迟；`interval` 中计数每次汇总后归零。`skippedSends` 表示连接已关闭或发送缓冲达到 512KB 时没有排入发送队列的消息数。

## 生产环境查看

初始化脚本配置独立的 `project-strike` journal namespace，不更改系统其他服务的日志策略：持久化到 journal，每日轮转，保留时间目标 14 天、磁盘预算 256MB，优先保留 512MB 空闲空间。journal 按文件回收，实际占用/保留时间也受当前活动文件和磁盘可用量影响。另设每 30 秒最多 1000 条的 journal 限流；超过会丢弃并汇总提示。

```bash
# 实时跟踪
sudo journalctl --namespace=project-strike -u project-strike.service -f -o cat
# 最近一小时
sudo journalctl --namespace=project-strike -u project-strike.service --since '1 hour ago' -o cat
# 占用空间
sudo journalctl --namespace=project-strike --disk-usage
# 导出联机测试日志
sudo journalctl --namespace=project-strike -u project-strike.service --since '1 hour ago' -o cat > strike-test.jsonl
```

装有 jq 时可筛选某个房间或警告/异常（systemd 自身的非 JSON 行自动略过）：

```bash
sudo journalctl --namespace=project-strike -u project-strike.service --since today -o cat | jq -R 'fromjson? | select(.roomId == "房间码")'
sudo journalctl --namespace=project-strike -u project-strike.service --since today -o cat | jq -R 'fromjson? | select(.level == "warn" or .level == "error")'
```

服务尚未启动或 namespace 配置出错时，另用 `sudo journalctl -u project-strike.service -n 100` 查看 systemd 管理日志。日志读取用管理员权限，部署用户不需要加入 systemd-journal 组。

## 调整级别与频率

`LOG_LEVEL=debug|info|warn|error`，默认 info；`LOG_METRICS_INTERVAL_MS` 默认 60000，最小 1000。设为 warn/error 后不会输出 info 级别启动、生命周期与指标日志。生产排查推荐保留 info。

管理员执行 `sudo systemctl edit project-strike.service`，写入：

```ini
[Service]
Environment=LOG_LEVEL=debug
Environment=LOG_METRICS_INTERVAL_MS=10000
```

再执行 `sudo systemctl restart project-strike.service`（会中断对局）。本地 PowerShell 可使用 `$env:LOG_LEVEL='debug'; npm run server`。

独立包运行时只向 stdout 写日志，不在应用目录产生无限增长的文件；生产的落盘、检索、保留和轮转由上述 journal 负责。2026-09-11 已在 Ubuntu 24.04 服务器安装独立 journal 配置；首次发布后检查 namespace 日志及磁盘占用，实际长时间保留受磁盘预算约束。
