#!/bin/bash
# Glow system check — probes every deployed system and reports PASS/FAIL.
#
#   bash scripts/system-check.sh          # remote probes only (~15s)
#   bash scripts/system-check.sh --full   # + local test suites & typecheck (~2min)
#
# Exit code 0 = all pass. Anything red tells you exactly which layer to debug.

PROD_API="https://api.glow.app"
DEV_API="https://glow-dev-api-development.up.railway.app"
PWA="https://glow.vercel.app"
LANDING="https://ca.glow.app"
ADMIN="https://glow-admin.vercel.app"

PASS=0; FAIL=0
ok()   { printf "  \033[32mPASS\033[0m  %s\n" "$1"; PASS=$((PASS+1)); }
bad()  { printf "  \033[31mFAIL\033[0m  %s\n" "$1"; FAIL=$((FAIL+1)); }
code() { curl -s -o /dev/null -w '%{http_code}' -m 10 "$1"; }

echo "━━ Backend API (Railway prod) ━━"
H=$(curl -s -m 10 "$PROD_API/health")
echo "$H" | grep -q '"status":"ok"'        && ok "API /health responds"            || bad "API /health ($H)"
echo "$H" | grep -q '"postgres":"ok"'      && ok "Postgres connected"              || bad "Postgres down"
echo "$H" | grep -q '"redis":"ok"'         && ok "Redis connected"                 || bad "Redis down"
[ "$(code $PROD_API/definitely-not-a-route)" = "404" ] && ok "Unknown routes 404 fast" || bad "Routing broken (no 404)"
curl -s -m 10 -X POST "$PROD_API/auth/login" -H 'Content-Type: application/json' -d '{}' \
  | grep -q "phone is required"            && ok "Auth validation works"           || bad "Auth /login validation"

echo "━━ Realtime (socket.io) — chat + live tracking depend on this ━━"
SIO=$(curl -s -m 8 "$PROD_API/socket.io/?EIO=4&transport=polling" | head -c 10)
[ -n "$SIO" ]                              && ok "Prod socket handshake answers"   || bad "Prod socket HANGS (chat/tracking dead)"
SIOD=$(curl -s -m 8 "$DEV_API/socket.io/?EIO=4&transport=polling" | head -c 10)
[ -n "$SIOD" ]                             && ok "Dev socket handshake answers"    || bad "Dev socket hangs"

echo "━━ PWA (prod) ━━"
[ "$(code $PWA)" = "200" ]                 && ok "PWA loads"                       || bad "PWA down ($PWA)"
BUNDLE=$(curl -s -m 10 "$PWA" | grep -o '/_expo/static/js/web/[^"]*\.js' | head -1)
if [ -n "$BUNDLE" ]; then
  URLS=$(curl -s -m 20 "$PWA$BUNDLE" | grep -o 'https://[a-z.-]*glow[a-z.-]*' | sort -u)
  echo "$URLS" | grep -q "api.glow.app"     && ok "Bundle points at PROD API"  || bad "Bundle missing prod API URL"
  echo "$URLS" | grep -q "dev-api"                && bad "Bundle LEAKS dev API URL (OTP would hit dev DB!)" || ok "No dev API leak in bundle"
else
  bad "Could not find JS bundle in PWA HTML"
fi

echo "━━ Landing (ca.glow.app) ━━"
for p in "" privacy terms support; do
  [ "$(code $LANDING/$p)" = "200" ]        && ok "/$p"                             || bad "/$p not 200 (App Store metadata links break)"
done

echo "━━ Admin panel ━━"
[ "$(code $ADMIN)" = "200" ]               && ok "Admin panel loads"               || bad "Admin panel down"

if [ "$1" = "--full" ]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  echo "━━ Local: backend tests ━━"
  (cd "$ROOT" && npm test --silent >/dev/null 2>&1)          && ok "backend jest suite"  || bad "backend tests fail — run: npm test"
  echo "━━ Local: mobile typecheck + tests ━━"
  (cd "$ROOT/mobile" && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1) && ok "TypeScript compiles" || bad "tsc errors — run: cd mobile && npx tsc --noEmit"
  (cd "$ROOT/mobile" && npm test --silent >/dev/null 2>&1)   && ok "mobile jest suite"   || bad "mobile tests fail — run: cd mobile && npm test"
fi

echo
echo "Result: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
