#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/opt/project-strike/deploy.lock
flock -w 300 9
payload=$(mktemp /run/strike-passwords.XXXXXX)
backup=$(mktemp /var/lib/project-strike/accounts.password-backup.XXXXXX)
trap 'rm -f "$payload"' EXIT
cat > "$payload"
systemctl stop project-strike.service
cp --preserve=mode,ownership /var/lib/project-strike/accounts.json "$backup"
recover() {
  cp --preserve=mode,ownership "$backup" /var/lib/project-strike/accounts.json
  systemctl start project-strike.service
}
trap 'recover; exit 1' ERR HUP INT TERM
node --input-type=module - "$payload" <<'NODE'
import { readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
const { password } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw Error('Invalid password length');
const file = '/var/lib/project-strike/accounts.json';
const db = JSON.parse(readFileSync(file, 'utf8'));
const names = ['test_medic', 'test_assassin', 'test_commando', 'test_tank'];
const ids = new Set();
for (const name of names) {
  const matches = db.accounts.filter(a => a.profile.name === name);
  if (matches.length !== 1 || !db.ledger.some(e => e.accountId === matches[0].profile.id && e.reason === 'test-grant')) throw Error('Expected provisioned test account: ' + name);
  const account = matches[0];
  account.salt = randomBytes(16).toString('hex');
  account.verifier = scryptSync(password, account.salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  ids.add(account.profile.id);
}
db.sessions = db.sessions.filter(s => !ids.has(s.accountId));
const temporary = file + '.password-reset.tmp';
writeFileSync(temporary, JSON.stringify(db), { mode: 0o600, flag: 'wx' });
const fd = openSync(temporary, 'r+');
try { fsyncSync(fd); } finally { closeSync(fd); }
renameSync(temporary, file);
console.log('Reset four test account passwords; assets preserved; previous sessions revoked.');
NODE
chown --reference="$backup" /var/lib/project-strike/accounts.json
systemctl start project-strike.service
sleep 2
systemctl is-active --quiet project-strike.service
node /opt/project-strike/current/probe.mjs
trap - ERR HUP INT TERM
