#!/usr/bin/env bash
set -euo pipefail
umask 022
release=${1:?Release ID required}
[[ "$release" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
root=/opt/project-strike
exec 9>"$root/deploy.lock"
echo "[deploy] Waiting for deployment lock (up to 300 seconds)"
if ! flock -w 300 9; then
  echo "[deploy] Timed out waiting for deployment lock after 300 seconds" >&2
  exit 1
fi
echo '[deploy] Deployment lock acquired'
incoming="$root/incoming/$release"
target="$root/releases/$release"
cd "$incoming"
sha256sum -c backend.tar.gz.sha256
mkdir "$target"
tar -xzf backend.tar.gz -C "$target" --no-same-owner
[[ "$(cat "$target/REVISION")" == "${release:0:40}" ]]
/usr/bin/node --input-type=module - "$target" <<'NODE'
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = process.argv[2];
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
if (createHash('sha256').update(readFileSync(`${dir}/server.cjs`)).digest('hex') !== manifest.sha256) {
  throw Error('Server checksum mismatch');
}
NODE
previous=''
if [[ -L "$root/current" ]]; then
  previous=$(readlink -e "$root/current")
elif [[ -e "$root/current" ]]; then
  echo 'current must be a release symlink' >&2
  exit 1
fi
frontend=$(/usr/bin/node -e "const { readFileSync } = require('node:fs'); console.log(JSON.parse(readFileSync(process.argv[1], 'utf8')).frontend ?? 'included')" "$target/manifest.json")
case "$frontend" in
  included) ;;
  reuse-previous)
    [[ -n "$previous" && -d "$previous/dist" ]] || { echo 'Backend-only release requires a previous release with static client assets' >&2; exit 1; }
    target_content=$(/usr/bin/node -e "const { readFileSync } = require('node:fs'); console.log(JSON.parse(readFileSync(process.argv[1], 'utf8')).contentVersion)" "$target/manifest.json")
    previous_content=$(/usr/bin/node -e "const { readFileSync } = require('node:fs'); console.log(JSON.parse(readFileSync(process.argv[1], 'utf8')).contentVersion)" "$previous/manifest.json")
    [[ "$target_content" == "$previous_content" ]] || { echo "Backend-only release content version mismatch ($target_content != $previous_content); deploy the matching frontend first" >&2; exit 1; }
    echo "[deploy] Reusing static client assets from $previous"
    ln -s "$previous/dist" "$target/dist"
    ;;
  *) echo "Unknown frontend packaging mode: $frontend" >&2; exit 1 ;;
esac
activate() {
  ln -s "$1" "$root/current.next"
  mv -Tf "$root/current.next" "$root/current"
}
rollback() {
  trap - ERR HUP INT TERM
  echo 'Deployment failed; restoring previous release.' >&2
  if [[ -n "$previous" && -d "$previous" ]]; then
    activate "$previous"
    sudo -n systemctl restart project-strike.service
    /usr/bin/node "$previous/probe.mjs" || true
  else
    sudo -n systemctl stop project-strike.service
    rm -f "$root/current"
  fi
  exit 1
}
trap rollback ERR HUP INT TERM
echo '[deploy] Activating new release'
activate "$target"
echo '[deploy] Restarting project-strike.service'
sudo -n systemctl restart project-strike.service
healthy=false
for ((attempt=1; attempt<=15; attempt++)); do
  echo "[deploy] Health check attempt $attempt/15"
  if /usr/bin/node "$target/probe.mjs"; then
    healthy=true
    echo "[deploy] Health check passed on attempt $attempt/15"
    break
  fi
  sleep 2
done
[[ "$healthy" == true ]]
echo '[deploy] Verifying service remains active'
sleep 3
systemctl is-active --quiet project-strike.service
/usr/bin/node "$target/probe.mjs"
trap - ERR HUP INT TERM
echo "Deployed $release (previous: ${previous:-none})"
