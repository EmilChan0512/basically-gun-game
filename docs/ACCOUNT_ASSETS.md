# 联网账号与资产

主入口使用联网账号；`?offline` 是免登录单机。离线存档、调试房间和浏览器本机合作记录不发放联网资产。历史本机账号文件保留，已不提供本机注册或登录入口。

服务端独占 `/var/lib/project-strike/accounts.json`，维护金币、各职业经验、购买的武器/道具许可证和出战配装。职业等级上限为 50（当前每级 160 XP），刀盾和技能随对应职业等级开放。客户端不能提交金币、经验、结算结果或绕过职业限制；正常房间由服务端验证配装权限。公共调试房间只绕过购买和等级限制。

数据库 v2 增加资产流水：注册初始发放、购买扣款、服务端对局结算、迁移及管理员测试发放均包含账号、时间、操作 ID 和资产变化。奖励与去重记录、购买与扣款在同一个原子写入中保存。`OnlineAccounts.assets(id)` 是受信任管理代码的只读查询，包含资产和流水，不暴露密码或会话散列。

从 v1 启动迁移时保留金币、经验、已购许可证和会话；补充四职业免费初始主武器，并逐槽修复不符合新职业/等级要求的配装。迁移前保留 `accounts.json.schema1-*.backup`。数据库损坏会拒绝启动；回滚到旧程序时，管理员必须在停止服务后恢复匹配旧版本的数据库备份。

## 测试账号发放

管理工具随服务器打包为 `admin.cjs`，不提供公网发币接口。运行方式：

```sh
node admin.cjs provision-tests /var/lib/project-strike/accounts.json --service-stopped < batch.json
```

输入包含固定 `batch` 操作标识以及恰好四条 `{name, selected, salt, verifier}`。密码在本机生成并使用 scrypt 散列，明文不进入部署配置、Git 或 CI 日志。四个账号分别默认选择四职业，每个账号四职业 50 级、9999 金币、54 种枪械和全部道具。刀盾/技能的完整权限由满级职业获得。

`deploy/provision-test-accounts.sh` 使用与发布相同的排他锁，停服务、备份数据库、执行发放、恢复文件属主并启动验证；失败时恢复备份。相同 batch 可重试且不会重置已使用账号的资产、密码或配装；同名新 batch 会拒绝覆盖。

手动工作流 `Provision authorized test accounts` 使用管理员 SSH 密钥和临时 `PROVISION_TEST_ACCOUNTS` secret。发放并验证完成后删除该临时 secret。不要在运行中的进程旁启动第二个数据库写入者。

当前无域名测试部署继续使用用户已确认的 WS 降级配置；接入域名后改用 WSS 并关闭 `ALLOW_INSECURE_ACCOUNTS`。
