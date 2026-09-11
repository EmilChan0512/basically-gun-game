#!/usr/bin/env bash
# One-time setup; run as root on a Linux systemd host after installing Node 22.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
/usr/bin/node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) process.exit(1)'
command -v flock >/dev/null
command -v sudo >/dev/null
id strike >/dev/null 2>&1 || useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin strike
id strike-deploy >/dev/null 2>&1 || useradd --create-home --user-group --shell /bin/bash strike-deploy
install -d -o strike-deploy -g strike-deploy -m 755 /opt/project-strike /opt/project-strike/releases /opt/project-strike/incoming
install -d -o strike-deploy -g strike-deploy -m 700 /home/strike-deploy/.ssh
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
install -o root -g root -m 644 "$script_dir/project-strike.service" /etc/systemd/system/project-strike.service
systemctl_path=$(command -v systemctl)
sudoers=$(mktemp)
trap 'rm -f "$sudoers"' EXIT
printf 'strike-deploy ALL=(root) NOPASSWD: %s restart project-strike.service, %s stop project-strike.service\n' "$systemctl_path" "$systemctl_path" > "$sudoers"
visudo -cf "$sudoers"
install -o root -g root -m 440 "$sudoers" /etc/sudoers.d/project-strike
systemctl daemon-reload
systemctl enable project-strike.service
echo 'Setup complete. Add the deployment public key to /home/strike-deploy/.ssh/authorized_keys (owner strike-deploy, mode 600). First deployment starts the service.'
