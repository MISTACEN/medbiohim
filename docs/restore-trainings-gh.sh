#!/usr/bin/env bash
# Restore trainings.php on GH main (requires: gh auth login)
set -euo pipefail
REPO=MISTACEN/medbiohim
FILE=backend/config/routes/trainings.php
CONTENT_FILE="${1:-spaceweb_upload/config/routes/trainings.php}"
SHA=$(gh api "repos/$REPO/contents/$FILE?ref=main" --jq .sha)
gh api --method PUT "repos/$REPO/contents/$FILE" \
  -f message="fix(trainings): restore full file with real SQL newlines (PG 42601)" \
  -f content="$(base64 -w0 "$CONTENT_FILE")" \
  -f branch=main \
  -f sha="$SHA"
echo OK
