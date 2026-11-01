#!/bin/sh
# Once, as root, on a fresh Ubuntu 24.04 server: Docker, a firewall with only
# SSH, HTTP and HTTPS open, the app's folder (/opt/visual-tracert) and the
# daily backup. Then put .env there and the deploy (GitHub Actions) does the rest.
#   curl -fsSL https://raw.githubusercontent.com/<owner>/visual-tracert/main/deploy/setup-server.sh | sh
# (or copy it to the server and run: sh setup-server.sh)
set -eu
APP=/opt/visual-tracert

apt-get update
apt-get install -y ca-certificates curl ufw
if ! command -v docker >/dev/null; then
  # Docker's own packages; on an Ubuntu too new for them, Ubuntu's
  curl -fsSL https://get.docker.com | sh || apt-get install -y docker.io docker-compose-v2
fi
docker compose version >/dev/null 2>&1 || apt-get install -y docker-compose-v2
systemctl enable --now docker

# the firewall: Docker publishes only Caddy's 80 and 443; nothing else answers
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

mkdir -p "$APP/backups"
# the accounts service writes its backups there as the node user (uid 1000)
chown 1000:1000 "$APP/backups"
[ -f "$APP/.env" ] || echo "Create $APP/.env (see deploy/.env.example)."

# daily backup at 03:30
cat > /etc/cron.d/visual-tracert-backup <<CRON
30 3 * * * root sh $APP/backup.sh >> /var/log/visual-tracert-backup.log 2>&1
CRON

echo "Ready. Docker $(docker --version | cut -d' ' -f3 | tr -d ,) and the firewall are set up."
