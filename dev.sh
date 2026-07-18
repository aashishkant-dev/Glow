#!/usr/bin/env bash
# ─── Glow local dev launcher ────────────────────────────────────────────
# WSL-compatible. Starts backend (3000) + Expo web (8081) in parallel.
# Kill both with Ctrl+C.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT"
MOBILE="$ROOT/mobile"
MOBILE_ENV="$MOBILE/.env"
LOG_DIR="$ROOT/.logs"
BACKEND_LOG="$LOG_DIR/backend.log"
MOBILE_LOG="$LOG_DIR/expo.log"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

mkdir -p "$LOG_DIR"

echo -e "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Glow  ·  Local Dev         ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── Load backend env ───────────────────────────────────────────────────────────
if [ -f "$ROOT/glow.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT/glow.env"
  set +a
  echo -e "${GREEN}✓${NC} Loaded glow.env"
else
  echo -e "${YELLOW}⚠${NC}  glow.env not found — using existing env vars"
fi

# ── Point mobile at localhost ──────────────────────────────────────────────────
PROD_API="https://api.glow.app"
LOCAL_API="http://localhost:3000"

if grep -q "EXPO_PUBLIC_API_URL" "$MOBILE_ENV" 2>/dev/null; then
  sed -i "s|EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=$LOCAL_API|" "$MOBILE_ENV"
else
  echo "EXPO_PUBLIC_API_URL=$LOCAL_API" >> "$MOBILE_ENV"
fi
echo -e "${GREEN}✓${NC} Mobile API → $LOCAL_API"

# ── Install deps if needed ─────────────────────────────────────────────────────
if [ ! -d "$BACKEND/node_modules" ]; then
  echo -e "${YELLOW}→${NC} Installing backend deps..."
  (cd "$BACKEND" && npm install --silent)
fi
if [ ! -d "$MOBILE/node_modules" ]; then
  echo -e "${YELLOW}→${NC} Installing mobile deps..."
  (cd "$MOBILE" && npm install --silent)
fi

# ── Restore env on exit ────────────────────────────────────────────────────────
cleanup() {
  echo -e "\n${RED}→${NC} Shutting down..."
  kill "$BACKEND_PID" 2>/dev/null || true
  kill "$MOBILE_PID"  2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  wait "$MOBILE_PID"  2>/dev/null || true
  sed -i "s|EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=$PROD_API|" "$MOBILE_ENV"
  echo -e "${GREEN}✓${NC} Restored mobile API → production"
  echo -e "${CYAN}→${NC} Logs saved: $LOG_DIR/"
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ── Start backend ──────────────────────────────────────────────────────────────
echo -e "\n${CYAN}→${NC} Starting backend on :3000..."
(cd "$BACKEND" && npm run dev 2>&1 | tee "$BACKEND_LOG" | sed "s/^/$(printf '\033[0;32m')[backend]$(printf '\033[0m') /") &
BACKEND_PID=$!

# Wait for backend ready
echo -e "${YELLOW}→${NC} Waiting for backend..."
READY=0
for i in $(seq 1 40); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    READY=1
    echo -e "${GREEN}✓${NC} Backend ready (${i}s)"
    break
  fi
  sleep 1
done

if [ $READY -eq 0 ]; then
  echo -e "${RED}✗${NC} Backend failed to start in 40s"
  echo -e "${YELLOW}  Check: $BACKEND_LOG${NC}"
  # Show last 20 lines of log for quick diagnosis
  echo -e "${YELLOW}--- Last 20 lines of backend log ---${NC}"
  tail -20 "$BACKEND_LOG" 2>/dev/null || true
  cleanup
  exit 1
fi

# Quick health summary
HEALTH=$(curl -sf http://localhost:3000/health 2>/dev/null || echo '{}')
DB_STATUS=$(echo "$HEALTH" | grep -o '"postgres":"[^"]*"' | cut -d'"' -f4 || echo "?")
REDIS_STATUS=$(echo "$HEALTH" | grep -o '"redis":"[^"]*"' | cut -d'"' -f4 || echo "?")
echo -e "  DB: ${BOLD}${DB_STATUS}${NC}  Redis: ${BOLD}${REDIS_STATUS}${NC}"

# ── Start Expo web ─────────────────────────────────────────────────────────────
echo -e "${CYAN}→${NC} Starting Expo web on :8081..."
# BROWSER=none prevents Expo from opening a browser automatically (WSL-friendly)
(cd "$MOBILE" && BROWSER=none npx expo start --web --port 8081 2>&1 | tee "$MOBILE_LOG" | sed "s/^/$(printf '\033[0;36m')[expo]$(printf '\033[0m') /") &
MOBILE_PID=$!

# Wait for Expo bundler to be ready
echo -e "${YELLOW}→${NC} Waiting for Expo bundler..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:8081 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Expo ready (${i}s)"
    break
  fi
  sleep 1
  if [ $i -eq 60 ]; then
    echo -e "${YELLOW}⚠${NC}  Expo still bundling — open http://localhost:8081 in a moment"
  fi
done

# ── Print URLs ─────────────────────────────────────────────────────────────────
echo -e ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  App:      http://localhost:8081${NC}"
echo -e "${GREEN}${BOLD}  Backend:  http://localhost:3000${NC}"
echo -e "${GREEN}${BOLD}  Admin:    http://localhost:3000/admin-ui${NC}"
echo -e "${GREEN}${BOLD}  Health:   http://localhost:3000/health${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════${NC}"
echo -e "${YELLOW}  Logs: $LOG_DIR/${NC}"
echo -e "${YELLOW}  Ctrl+C to stop both${NC}"
echo -e ""

# ── Wait ───────────────────────────────────────────────────────────────────────
wait
