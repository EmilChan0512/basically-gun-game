#!/usr/bin/env bash
set -euo pipefail
umask 077
# Invoked as root through the administrator SSH identity. Shares the deploy lock.
exec 9>/opt/project-strike/deploy.lock
flock -w 300 9
payload=$(mktemp /run/strike-provision.XXXXXX)
backup=$(mktemp /var/lib/project-strike/accounts.backup.XXXXXX)
trap 'rm -f "$payload"' EXIT
cat > "$payload"
systemctl stop project-strike.service
cp --preserve=mode,ownership /var/lib/project-strike/accounts.json "$backup"
recover() {
  cp --preserve=mode,ownership "$backup" /var/lib/project-strike/accounts.json
  systemctl start project-strike.service
}
trap 'recover; exit 1' ERR HUP INT TERM
node /opt/project-strike/current/admin.cjs provision-tests /var/lib/project-strike/accounts.json --service-stopped < "$payload"
chown --reference="$backup" /var/lib/project-strike/accounts.json
systemctl start project-strike.service
sleep 2
systemctl is-active --quiet project-strike.service
node /opt/project-strike/current/probe.mjs
trap - ERR HUP INT TERM
echo 'Provisioning verified; private backup retained.'
