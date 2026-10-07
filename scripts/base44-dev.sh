#!/bin/sh
# Container start-up for the Base44 sandbox (see AGENTS.md and docker-compose.base44.yml).
#
# Runs the Cloudflare Worker from the bind-mounted source: installs dependencies
# from the lockfile when it changed, rebuilds the vendored panel assets, then
# starts `wrangler dev` in local mode on port 3000. Kept as a file rather than an
# inline compose command so compose does not interpolate the shell's $variables.
set -e

cd /app

lock=node_modules/.base44-lock
hash=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat "$lock" 2>/dev/null || true)" != "$hash" ]; then
  echo "base44: installing dependencies from package-lock.json"
  npm ci --no-audit --no-fund
  echo "$hash" > "$lock"
fi

echo "base44: building vendored assets into public/"
npm run build

echo "base44: starting wrangler dev on 0.0.0.0:3000"
exec npx wrangler dev --ip 0.0.0.0 --port 3000
