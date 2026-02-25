#!/bin/bash
# Create or update a Cloud Scheduler job that triggers daily DuckDB monitoring sync.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
JOB_NAME="${JOB_NAME:-axis-monitoring-sync-daily}"
SERVICE_URL="${SERVICE_URL:-}"
SCHEDULE="${SCHEDULE:-0 3 * * *}"
TIME_ZONE="${TIME_ZONE:-Etc/UTC}"
AUTH_MODE="${AUTH_MODE:-oidc}" # oidc | none
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_EMAIL:-}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-}"

if [ -z "$PROJECT_ID" ]; then
  echo "Missing PROJECT_ID"
  exit 1
fi
if [ -z "$SERVICE_URL" ]; then
  echo "Missing SERVICE_URL (example: https://axis-backend-xxxxx-uc.a.run.app)"
  exit 1
fi
if [ "$AUTH_MODE" = "oidc" ] && [ -z "$SERVICE_ACCOUNT_EMAIL" ]; then
  echo "AUTH_MODE=oidc requires SERVICE_ACCOUNT_EMAIL"
  exit 1
fi

SYNC_URI="${SERVICE_URL%/}/api/store/sync/monitoring"

echo "Using project: ${PROJECT_ID}"
gcloud config set project "$PROJECT_ID" >/dev/null

base_args=(
  --location="$REGION"
  --schedule="$SCHEDULE"
  --uri="$SYNC_URI"
  --http-method=POST
  --time-zone="$TIME_ZONE"
)

auth_args=()
if [ "$AUTH_MODE" = "oidc" ]; then
  auth_args=(
    --oidc-service-account-email="$SERVICE_ACCOUNT_EMAIL"
    --oidc-token-audience="$SERVICE_URL"
  )
elif [ "$AUTH_MODE" != "none" ]; then
  echo "AUTH_MODE must be 'oidc' or 'none'"
  exit 1
fi

echo "Ensuring Cloud Scheduler job exists: ${JOB_NAME}"
if gcloud scheduler jobs describe "$JOB_NAME" --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB_NAME" "${base_args[@]}" "${auth_args[@]}"
  echo "Updated existing job: ${JOB_NAME}"
else
  gcloud scheduler jobs create http "$JOB_NAME" "${base_args[@]}" "${auth_args[@]}"
  echo "Created new job: ${JOB_NAME}"
fi

if [ "$AUTH_MODE" = "oidc" ] && [ -n "$CLOUD_RUN_SERVICE" ]; then
  echo "Granting run.invoker to scheduler service account on ${CLOUD_RUN_SERVICE}"
  gcloud run services add-iam-policy-binding "$CLOUD_RUN_SERVICE" \
    --region="$REGION" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/run.invoker" >/dev/null
  echo "Invoker permission ensured."
fi

echo "Done. Triggering a test run now..."
gcloud scheduler jobs run "$JOB_NAME" --location="$REGION"
echo "Job run submitted. Check /api/store/status and Cloud Run logs."
