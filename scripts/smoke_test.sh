#!/usr/bin/env bash
set -euo pipefail

# Integration smoke test for sat-tracker API.
# Usage: ./scripts/smoke_test.sh <API_URL> <API_KEY>
# Example: ./scripts/smoke_test.sh http://localhost:8000 my-secret-key

API_URL="${1:?Usage: smoke_test.sh <API_URL> <API_KEY>}"
API_KEY="${2:?Usage: smoke_test.sh <API_URL> <API_KEY>}"

PASS=0
FAIL=0
TOTAL=0

check() {
    local expected_code="$1"
    local method="$2"
    local path="$3"
    local body="${4:-}"
    TOTAL=$((TOTAL + 1))

    local args=(-s -o /dev/null -w "%{http_code}" -H "X-API-Key: $API_KEY")
    if [ "$method" != "GET" ]; then
        args+=(-X "$method")
    fi
    if [ -n "$body" ]; then
        args+=(-H "Content-Type: application/json" -d "$body")
    fi

    local code
    code=$(curl "${args[@]}" "${API_URL}${path}")

    if [ "$code" = "$expected_code" ]; then
        echo "  ✅ $method $path → $code"
        PASS=$((PASS + 1))
    else
        echo "  ❌ $method $path → $code (expected $expected_code)"
        FAIL=$((FAIL + 1))
    fi
}

echo "🔍 Sat-Tracker Smoke Test"
echo "   API: $API_URL"
echo ""

echo "── Health ──"
check 200 GET /api/health
check 200 GET /api/health/detailed

echo "── Settings ──"
check 200 GET /api/settings
check 200 PUT /api/settings '{"video_fps":24}'

echo "── GOES ──"
check 200 GET /api/goes/products
check 200 GET /api/goes/catalog
check 200 GET "/api/goes/frames?page=1&per_page=1"
check 200 GET /api/goes/frames/stats

echo "── Jobs ──"
check 200 GET "/api/jobs?page=1&per_page=1"

echo "── Notifications ──"
check 200 GET /api/notifications

echo "── Stats ──"
check 200 GET /api/stats
check 200 GET /api/stats/storage/breakdown

echo "── System ──"
check 200 GET /api/system/info

echo "── Frames alias ──"
check 200 GET "/api/frames?page=1&per_page=1"

echo ""
echo "═══════════════════════════════"
echo "  Results: $PASS/$TOTAL passed"
if [ "$FAIL" -gt 0 ]; then
    echo "  ❌ $FAIL FAILED"
    exit 1
else
    echo "  ✅ All passed!"
    exit 0
fi
