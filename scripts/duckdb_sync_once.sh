#!/bin/bash
# Trigger a one-time DuckDB sync and poll status until completion.

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8500}"
DATASET="${DATASET:-monitoring}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-3}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-900}"
AUTH_BEARER_TOKEN="${AUTH_BEARER_TOKEN:-}"

SYNC_ENDPOINT="${BACKEND_URL%/}/api/store/sync/${DATASET}"
STATUS_ENDPOINT="${BACKEND_URL%/}/api/store/status"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "Starting one-time sync: dataset=${DATASET}, backend=${BACKEND_URL}"
sync_body_file="${tmpdir}/sync-response.json"
if [ -n "$AUTH_BEARER_TOKEN" ]; then
  sync_http_code="$(curl -sS -o "$sync_body_file" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
    "$SYNC_ENDPOINT" || true)"
else
  sync_http_code="$(curl -sS -o "$sync_body_file" -w "%{http_code}" -X POST \
    "$SYNC_ENDPOINT" || true)"
fi

if [ "$sync_http_code" -lt 200 ] || [ "$sync_http_code" -ge 300 ]; then
  echo "Failed to trigger sync (HTTP ${sync_http_code})"
  cat "$sync_body_file"
  exit 1
fi

echo "Sync accepted:"
cat "$sync_body_file"
echo

started_epoch="$(date +%s)"
echo "Polling ${STATUS_ENDPOINT} every ${POLL_INTERVAL_SECONDS}s (max ${MAX_WAIT_SECONDS}s)..."

while true; do
  now_epoch="$(date +%s)"
  elapsed="$((now_epoch - started_epoch))"
  if [ "$elapsed" -gt "$MAX_WAIT_SECONDS" ]; then
    echo "Timed out waiting for sync completion after ${MAX_WAIT_SECONDS}s."
    exit 1
  fi

  status_body_file="${tmpdir}/status-response.json"
  if [ -n "$AUTH_BEARER_TOKEN" ]; then
    status_http_code="$(curl -sS -o "$status_body_file" -w "%{http_code}" \
      -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
      "$STATUS_ENDPOINT" || true)"
  else
    status_http_code="$(curl -sS -o "$status_body_file" -w "%{http_code}" \
      "$STATUS_ENDPOINT" || true)"
  fi
  if [ "$status_http_code" -lt 200 ] || [ "$status_http_code" -ge 300 ]; then
    echo "Failed to fetch status (HTTP ${status_http_code})"
    cat "$status_body_file"
    exit 1
  fi

  # Parse per-dataset sync status from JSON without requiring jq.
  parsed="$(python3 - "$status_body_file" "$DATASET" <<'PY'
import json
import sys

path = sys.argv[1]
dataset = sys.argv[2]
table_map = {"monitoring": "monitoring_data", "feedback": "feedback_raw", "eval": "eval_data"}
table = table_map.get(dataset, dataset)

with open(path, encoding="utf-8") as f:
    data = json.load(f)

ds = data.get("datasets", {}).get(table, {})
state = ds.get("state", "unknown")
rows = ds.get("rows", 0)
error = ds.get("error") or ""
print(f"{state}\t{rows}\t{error}")
PY
)"

  state="$(printf "%s" "$parsed" | awk -F '\t' '{print $1}')"
  rows="$(printf "%s" "$parsed" | awk -F '\t' '{print $2}')"
  error="$(printf "%s" "$parsed" | awk -F '\t' '{print $3}')"

  printf "[%ss] state=%s rows=%s\n" "$elapsed" "$state" "$rows"

  if [ "$state" = "ready" ]; then
    echo "Sync completed successfully."
    exit 0
  fi
  if [ "$state" = "error" ]; then
    echo "Sync failed: ${error}"
    cat "$status_body_file"
    exit 1
  fi

  sleep "$POLL_INTERVAL_SECONDS"
done
