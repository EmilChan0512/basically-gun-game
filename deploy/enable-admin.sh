#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/opt/project-strike/deploy.lock
flock -w 300 9
payload=$(mktemp /run/strike-admin.XXXXXX)
trap 'rm -f "$payload"' EXIT
cat > "$payload"
node --input-type=module - "$payload" <<'NODE'
import { readFileSync } from 'node:fs';
const value = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!/^[a-zA-Z0-9_-]{2,32}$/.test(value.username) || !/^[a-f0-9]{32}$/.test(value.salt) || !/^[a-f0-9]{128}$/.test(value.verifier) || !/^https?:\/\//.test(value.origin) || new URL(value.origin).origin !== value.origin || Object.keys(value).some(k => !['username', 'salt', 'verifier', 'origin'].includes(k))) throw Error('Invalid admin configuration');
NODE
file=/var/lib/project-strike/admin.json
backup=''
if [[ -f "$file" ]]; then
  backup=$(mktemp /var/lib/project-strike/admin.backup.XXXXXX)
  cp --preserve=mode,ownership "$file" "$backup"
fi
recover() {
  if [[ -n "$backup" ]]; then cp --preserve=mode,ownership "$backup" "$file"; else rm -f "$file"; fi
  systemctl restart project-strike.service
}
trap 'recover; exit 1' ERR HUP INT TERM
install -o strike -g strike -m 600 "$payload" "$file.new"
mv -f "$file.new" "$file"
systemctl restart project-strike.service
sleep 2
systemctl is-active --quiet project-strike.service
node /opt/project-strike/current/probe.mjs
curl --fail --silent http://127.0.0.1:4180/admin/ -o /dev/null
trap - ERR HUP INT TERM
echo 'Administrator login configured; no player assets modified.'
