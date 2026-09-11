#!/usr/bin/env bash
# One-time upgrade for installations predating persistent online accounts.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
if [[ "$(systemctl show project-strike.service -p StateDirectory --value)" == 'project-strike' ]]; then
  echo 'Persistent account directory already configured.'
  exit 0
fi
install -d -o root -g root -m 755 /etc/systemd/system/project-strike.service.d
cat > /etc/systemd/system/project-strike.service.d/accounts.conf <<'CONFIG'
[Service]
StateDirectory=project-strike
StateDirectoryMode=0700
Environment=ALLOW_INSECURE_ACCOUNTS=true
CONFIG
chmod 644 /etc/systemd/system/project-strike.service.d/accounts.conf
systemctl daemon-reload
echo 'Persistent accounts configured. Application deployment will restart the service.'
