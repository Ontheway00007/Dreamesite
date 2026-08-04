#!/bin/sh
#
# Production-mode checks against the real public routes.
#
# Builds nothing — run `npm run build` first. Starts `next start`, asserts the
# things that can only be seen in served HTML, and stops the server again:
#
#   - every public route responds, and /does-not-exist is a 404
#   - robots.txt disallows /admin and advertises the sitemap
#   - sitemap.xml is valid XML and lists no admin URL
#   - the property page carries three parseable JSON-LD documents
#   - structured data publishes no coordinate and invents no rating or price
#   - Twitter and Open Graph agree, and no Twitter handle is claimed
#   - no third-party player iframe is present before a visitor asks for one
#   - no private coordinate field names or secrets appear in the HTML
#   - the skip link, the main landmark and a single h1 are present
#
# Everything happens in one shell invocation because a backgrounded server does
# not reliably survive between calls in a sandbox.
#
# Usage:  sh scripts/verify-public-pages.sh
#
# `/admin` returning 500 with no Supabase project configured is expected and
# treated as a pass: the public site falls back to fixtures, and the admin
# cannot.
#
set -e

if [ -n "$NVM_DIR" ] && [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || true
fi

REPO=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$REPO"

if [ ! -d .next ]; then
  echo "No build found. Run npm run build first."
  exit 1
fi

LOG=${DREAME_SERVER_LOG:-/tmp/dreame-server.log}

npm run start > "$LOG" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT

# Wait for the server to accept connections rather than sleeping a fixed time.
i=0
while [ "$i" -lt 60 ]; do
  if node -e 'fetch("http://127.0.0.1:3000/").then(()=>process.exit(0)).catch(()=>process.exit(1))' 2>/dev/null; then
    break
  fi
  sleep 1
  i=$((i + 1))
done

if [ "$i" -ge 60 ]; then
  echo "The server did not become ready. Log:"
  tail -30 "$LOG"
  exit 1
fi

node "$REPO/scripts/check-public-pages.mjs"
