#!/usr/bin/env bash
# Bounded, self-terminating probe for the reset affordances + /api/agent shape.
set -u
PORT="${PORT:-3942}"
BASE="http://127.0.0.1:${PORT}"
LOG=/tmp/ys-probe-reset.log
cleanup() { [[ -n "${SRV_PID:-}" ]] && kill "$SRV_PID" 2>/dev/null; pkill -P "${SRV_PID:-0}" 2>/dev/null; }
trap cleanup EXIT INT TERM

AGENT_LOOP_ENABLED=0 npx next start -p "$PORT" > "$LOG" 2>&1 &
SRV_PID=$!
for i in $(seq 1 40); do
  curl -fsS "${BASE}/api/agent" >/dev/null 2>&1 && break
  kill -0 "$SRV_PID" 2>/dev/null || { echo "SERVER_DIED"; tail -20 "$LOG"; exit 3; }
  sleep 1
done

A="GUTC7K6F4OO5MUKC7XC25S5UJZD5HCWQA6VAHTKWFK56DC52FSU3OPRB"
B="GDUKMGUGDZQK6YHZAAGUDFW4PJBE6P7GO7RZK6KPMSWN7FNVXPANUS3K"
echo "=== /api/agent shape ==="
curl -fsS "${BASE}/api/agent"; echo
echo "=== register A + B ==="
curl -fsS -X POST "${BASE}/api/register" -H 'content-type: application/json' -d "{\"owner\":\"$A\",\"smartWallet\":\"CCA00000000000000000000000000000000000000000000000000000000\",\"poolRuleId\":1,\"usdcRuleId\":2}" >/dev/null
curl -fsS -X POST "${BASE}/api/register" -H 'content-type: application/json' -d "{\"owner\":\"$B\",\"smartWallet\":\"CCB00000000000000000000000000000000000000000000000000000000\",\"poolRuleId\":3,\"usdcRuleId\":4}" >/dev/null
echo "count after register: $(curl -fsS "${BASE}/api/reset" | sed -n 's/.*"count":\([0-9]*\).*/\1/p')"
echo "=== DELETE /api/register?owner=A (single) ==="
curl -fsS -X DELETE "${BASE}/api/register?owner=$A"; echo
echo "A now: HTTP $(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/users?owner=$A") (expect 404)"
echo "count after delete A: $(curl -fsS "${BASE}/api/reset" | sed -n 's/.*"count":\([0-9]*\).*/\1/p') (expect 1)"
echo "=== POST /api/reset (clear all) ==="
curl -fsS -X POST "${BASE}/api/reset"; echo
echo "count after reset: $(curl -fsS "${BASE}/api/reset" | sed -n 's/.*"count":\([0-9]*\).*/\1/p') (expect 0)"
echo "B now: HTTP $(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/users?owner=$B") (expect 404)"
echo "PROBE_DONE"
