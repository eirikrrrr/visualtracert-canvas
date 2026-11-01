#!/bin/sh
# A copy of the accounts' database (consistent while it is in use: VACUUM INTO),
# kept in ./backups for BACKUP_DAYS days. Run daily by cron (setup-server.sh).
set -eu
cd "$(dirname "$0")"
DAYS="${BACKUP_DAYS:-14}"
NAME="visual-tracert-$(date +%Y%m%d-%H%M).db"
mkdir -p backups
docker compose exec -T api node -e "
  const { DatabaseSync } = require('node:sqlite');
  new DatabaseSync('/data/visual-tracert.db').exec(\"VACUUM INTO '/backups/$NAME'\");
" 2>&1 | grep -v ExperimentalWarning || true
gzip -f "backups/$NAME"
find backups -name 'visual-tracert-*.db.gz' -mtime "+$DAYS" -delete
echo "backup: backups/$NAME.gz"
