#!/usr/bin/env bash
# Builds the Hostinger deployment ZIP (manual install through hPanel File Manager, nothing to build on the server):
#   public_html/     built PWA + .htaccess + laravel-api.php   → contents go INTO the domain's public_html
#   racerush-app/    Laravel API, production dependencies only → NEXT TO public_html (never inside)
#   database/        race_rush.sql (schema + catalogue + migration history) → import with phpMyAdmin
#   realtime-server/ optional Node bundle for a VPS (multiplayer, rewards, voice signalling)
#   DEPLOY_HOSTINGER.md, VERSION.txt
# Never packages: .env, secrets, node_modules, tests, .git, logs, caches.
#
# Usage: scripts/build-hostinger.sh            (needs local MariaDB/MySQL root access through the unix socket)
#        VERSION=0.9.0-preprod OUT=/tmp/out scripts/build-hostinger.sh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=${VERSION:-0.9.0-preprod}
OUT=${OUT:-$ROOT/dist-hostinger}
NAME="racerush-hostinger-$VERSION"
STAGE="$OUT/$NAME"
COMMIT=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)
EXPORT_DB=${EXPORT_DB:-racerush_export_tmp}

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

rm -rf "${STAGE:?}" "$OUT/$NAME.zip"
mkdir -p "$STAGE"

step "1/6 Frontend production build → public_html/"
(cd "$ROOT/client" && npx vite build --outDir "$STAGE/public_html" --emptyOutDir >/dev/null)
cp "$ROOT/deploy/hostinger/public_html.htaccess" "$STAGE/public_html/.htaccess"
cp "$ROOT/deploy/hostinger/laravel-api.php" "$STAGE/public_html/laravel-api.php"
# PHP must be the sole index file: Hostinger HWS then sends unknown URLs to PHP.
mv "$STAGE/public_html/index.html" "$STAGE/public_html/app-shell.html"
cp "$ROOT/deploy/hostinger/index.php" "$STAGE/public_html/index.php"
# No realtime server on shared hosting: solo races run offline, multiplayer/voice are hidden until configured.
sed -i "s#realtimeUrl: 'auto'#realtimeUrl: ''#" "$STAGE/public_html/config.js"
grep -q "realtimeUrl: ''" "$STAGE/public_html/config.js"
find "$STAGE/public_html" -name '*.map' -delete

step "2/6 Laravel API → racerush-app/ (composer --no-dev)"
rsync -a "$ROOT/backend/" "$STAGE/racerush-app/" \
  --exclude '.env' --exclude '.env.*' --exclude 'node_modules' --exclude 'tests' --exclude 'public' \
  --exclude 'storage/logs/*.log' --exclude 'storage/framework/cache/data/*' --exclude 'storage/framework/sessions/*' \
  --exclude 'storage/framework/views/*.php' --exclude 'storage/framework/testing' --exclude 'bootstrap/cache/*.php' \
  --exclude 'database/*.sqlite' --exclude '.phpunit.result.cache' --exclude 'phpunit.xml' --exclude 'AGENTS.md' \
  --exclude 'CLAUDE.md' --exclude 'CHANGELOG.md' --exclude 'package.json' --exclude 'package-lock.json' \
  --exclude 'vite.config.js' --exclude 'resources/js' --exclude 'resources/css' --exclude '.editorconfig' \
  --exclude '.gitattributes' --exclude '.git'
cp "$ROOT/deploy/hostinger/env.production.example" "$STAGE/racerush-app/.env.example"
printf 'Require all denied\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n' > "$STAGE/racerush-app/.htaccess"
(cd "$STAGE/racerush-app" && COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction --no-progress --quiet)
# Vendor test suites / fixtures are never loaded in production (some ship sample keys): prune, then rebuild the classmap.
find "$STAGE/racerush-app/vendor" -depth -type d \( -name tests -o -name Tests -o -name test -o -name test_files -o -name .github -o -name fixtures -o -name Fixtures \) -prune -exec rm -rf {} +
(cd "$STAGE/racerush-app" && COMPOSER_ALLOW_SUPERUSER=1 composer dump-autoload --no-dev --optimize --no-interaction --quiet)
rm -f "$STAGE/racerush-app/bootstrap/cache/config.php" "$STAGE/racerush-app/bootstrap/cache/routes-"*.php
for d in storage/app/public storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache; do
  mkdir -p "$STAGE/racerush-app/$d"
done

step "3/6 Database export → database/race_rush.sql"
mkdir -p "$STAGE/database"
mysql -uroot -e "DROP DATABASE IF EXISTS \`$EXPORT_DB\`; CREATE DATABASE \`$EXPORT_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON \`$EXPORT_DB\`.* TO 'race_rush'@'localhost'; FLUSH PRIVILEGES;"
(cd "$ROOT/backend" && DB_DATABASE="$EXPORT_DB" php artisan migrate:fresh --seed --force --no-interaction >/dev/null)
{
  echo "-- Race Rush database $VERSION (commit $COMMIT) — schema, vehicle/paint catalogue, migration history."
  echo "-- Import into an EMPTY MySQL 8 / MariaDB 10.6+ database (utf8mb4). No player data, no secrets."
  echo "SET NAMES utf8mb4;"
  echo "SET FOREIGN_KEY_CHECKS=0;"
  mysqldump -uroot --skip-comments --no-tablespaces --single-transaction --skip-add-locks --skip-dump-date \
    --default-character-set=utf8mb4 --routines=false --triggers=false "$EXPORT_DB" \
    | grep -v '^/\*M!999999' \
    | sed -E 's/utf8mb4_uca1400_ai_ci/utf8mb4_unicode_ci/g; s/ DEFINER=`[^`]+`@`[^`]+`//g'
  echo "SET FOREIGN_KEY_CHECKS=1;"
} > "$STAGE/database/race_rush.sql"
mysql -uroot -e "DROP DATABASE IF EXISTS \`$EXPORT_DB\`;"

step "4/6 Optional realtime server bundle (VPS) → realtime-server/"
mkdir -p "$STAGE/realtime-server"
(cd "$ROOT" && npx esbuild realtime/src/main.ts --bundle --platform=node --target=node20 --format=esm \
  --outfile="$STAGE/realtime-server/server.mjs" --external:bufferutil --external:utf-8-validate --log-level=warning \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);")
cp "$ROOT/deploy/realtime/README.md" "$ROOT/deploy/realtime/env.example" "$STAGE/realtime-server/"

step "5/6 Docs"
cp "$ROOT/deploy/hostinger/DEPLOY_HOSTINGER.md" "$STAGE/DEPLOY_HOSTINGER.md"
printf 'Race Rush %s\ncommit %s\nbuilt %s\n' "$VERSION" "$COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGE/VERSION.txt"
cp "$STAGE/VERSION.txt" "$STAGE/public_html/version.txt"

step "6/6 Safety checks + ZIP"
bad=$(find "$STAGE" \( -name '.env' -o -name '*.pem' -o -name '*.key' -o -name 'id_rsa*' -o -name 'node_modules' -o -name '.git' -o -name '*.log' -o -name '*.map' \) -print)
if [ -n "$bad" ]; then echo "Forbidden files in package:"; echo "$bad"; exit 1; fi
if grep -rIlE "APP_KEY=base64:[A-Za-z0-9+/=]{20,}|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY" "$STAGE" --exclude-dir=vendor; then
  echo "Secret-looking content found"; exit 1
fi
(cd "$OUT" && rm -f "$NAME.zip" && zip -qr -X "$NAME.zip" "$NAME")
(cd "$OUT" && sha256sum "$NAME.zip" > "$NAME.zip.sha256")
du -sh "$STAGE/public_html" "$STAGE/racerush-app" "$STAGE/database" "$STAGE/realtime-server" | sed 's#'"$STAGE"'/##'
ls -la "$OUT/$NAME.zip"
cat "$OUT/$NAME.zip.sha256"
