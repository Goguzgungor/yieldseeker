#!/usr/bin/env bash
# Bounded, SELF-TERMINATING probe: does the in-memory globalThis registry hold
# across the instrumentation-loop ↔ route-handler boundary in this Next setup?
#
# Starts `next start` with the agent loop ENABLED (so instrumentation boots and
# logs its registry store id), waits until the server answers, then:
#   1) POST /api/register a user
#   2) GET  /api/users?owner=…  (SEPARATE request → must see the user)
#   3) GET  /api/reset          (route's globalThis store id)
#   4) GET  /api/activity       (find the loop's logged store id)
#   5) compares the two store ids
# It ALWAYS kills the server on exit (trap). Total cap enforced by readiness loop.
set -u
PORT="${PORT:-3941}"
BASE="http://127.0.0.1:${PORT}"
LOG=/tmp/ys-probe-server.log

cleanup() { [[ -n "${SRV_PID:-}" ]] && kill "$SRV_PID" 2>/dev/null; pkill -P "${SRV_PID:-0}" 2>/dev/null; }
trap cleanup EXIT INT TERM

AGENT_LOOP_ENABLED=1 npx next start -p "$PORT" > "$LOG" 2>&1 &
SRV_PID=$!

# Wait up to ~40s for the server to answer (agent loop boot does blocking work).
READY=0
for i in $(seq 1 40); do
  if curl -fsS "${BASE}/api/agent" >/dev/null 2>&1; then READY=1; break; fi
  if ! kill -0 "$SRV_PID" 2>/dev/null; then echo "SERVER_DIED_EARLY"; tail -20 "$LOG"; exit 3; fi
  sleep 1
done
[[ "$READY" = 1 ]] || { echo "SERVER_NOT_READY"; tail -20 "$LOG"; exit 2; }

OWNER="GUTC7K6F4OO5MUKC7XC25S5UJZD5HCWQA6VAHTKWFK56DC52FSU3OPRB"
echo "=== POST /api/register ==="
curl -fsS -X POST "${BASE}/api/register" -H 'content-type: application/json' \
  -d "{\"owner\":\"${OWNER}\",\"smartWallet\":\"CCPROBE000000000000000000000000000000000000000000000000000\",\"poolRuleId\":7,\"usdcRuleId\":8}" ; echo
echo "=== GET /api/users?owner (SEPARATE request) ==="
USERS_JSON=$(curl -fsS "${BASE}/api/users?owner=${OWNER}"); echo "$USERS_JSON"
echo "=== GET /api/users (list) ==="
curl -fsS "${BASE}/api/users"; echo
echo "=== GET /api/reset (route store id) ==="
RESET_JSON=$(curl -fsS "${BASE}/api/reset"); echo "$RESET_JSON"
echo "=== GET /api/activity (loop store id is logged here) ==="
ACT_JSON=$(curl -fsS "${BASE}/api/activity"); echo "$ACT_JSON" | tr ',' '\n' | grep -i "registry\|store id" || echo "(no registry log yet)"

# Extract + compare store ids.
ROUTE_ID=$(printf '%s' "$RESET_JSON" | sed -n 's/.*"storeId":"\([^"]*\)".*/\1/p')
LOOP_ID=$(printf '%s' "$ACT_JSON" | grep -o 'loop registry store id = [^"\\]*' | head -1 | sed 's/loop registry store id = //')
echo "ROUTE_STORE_ID=${ROUTE_ID}"
echo "LOOP_STORE_ID=${LOOP_ID}"
if [[ -n "$ROUTE_ID" && "$ROUTE_ID" == "$LOOP_ID" ]]; then
  echo "RESULT: SHARING_HOLDS (loop and route share the same globalThis store)"
elif printf '%s' "$USERS_JSON" | grep -q "$OWNER"; then
  echo "RESULT: ROUTE_SELF_CONSISTENT_BUT_LOOP_ID_UNCONFIRMED"
else
  echo "RESULT: SHARING_FAILED"
fi
