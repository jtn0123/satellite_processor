#!/usr/bin/env bash
set -euo pipefail

# Deployment smoke test for the frontend Docker image.
# Builds and starts the frontend container, then verifies:
#   1. index.html returns 200 with no-cache headers
#   2. JS assets return 200 with Access-Control-Allow-Origin
#   3. CSS assets return 200
#   4. The app renders (root div present)
#
# Usage: ./scripts/smoke_test_deploy.sh
# Requires: docker (or podman)

CONTAINER_NAME="sat-smoke-test-$$"
PORT=8$(shuf -i 100-999 -n1)  # random port to avoid conflicts
PASS=0
FAIL=0
TOTAL=0

cleanup() {
    docker rm -f "$CONTAINER_NAME" &>/dev/null || true
}
trap cleanup EXIT

echo "🔍 Deployment Smoke Test"
echo ""

# Build the frontend image
echo "── Building frontend image ──"
docker build -t sat-smoke-frontend -f frontend/Dockerfile frontend/
echo ""

# Start container (API_KEY not needed for static asset tests)
docker run -d --name "$CONTAINER_NAME" -p "$PORT:80" \
    -e API_KEY=smoke-test-key sat-smoke-frontend >/dev/null

# Wait for nginx to be ready
READY=false
for _ in $(seq 1 10); do
    if curl -sf "http://localhost:$PORT/" >/dev/null 2>&1; then READY=true; break; fi
    sleep 1
done
if [ "$READY" = false ]; then
    echo "  ❌ Container failed to become ready"
    exit 1
fi

check_status() {
    local desc="$1" url="$2" expected="$3"
    TOTAL=$((TOTAL + 1))
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    if [ "$code" = "$expected" ]; then
        echo "  ✅ $desc → $code"
        PASS=$((PASS + 1))
    else
        echo "  ❌ $desc → $code (expected $expected)"
        FAIL=$((FAIL + 1))
    fi
}

check_header() {
    local desc="$1" url="$2" header="$3" pattern="$4"
    TOTAL=$((TOTAL + 1))
    local val
    val=$(curl -sI "$url" | grep -i "^${header}:" | head -1 | tr -d '\r')
    if echo "$val" | grep -qi "$pattern"; then
        echo "  ✅ $desc: $val"
        PASS=$((PASS + 1))
    else
        echo "  ❌ $desc: got '${val:-<missing>}' (expected pattern: $pattern)"
        FAIL=$((FAIL + 1))
    fi
}

BASE="http://localhost:$PORT"

echo "── index.html ──"
check_status "GET /" "$BASE/" "200"
check_header "Cache-Control on /" "$BASE/" "Cache-Control" "no-cache"
check_header "Pragma on /" "$BASE/" "Pragma" "no-cache"

# Extract asset paths from index.html
HTML=$(curl -s "$BASE/")

JS_PATH=$(echo "$HTML" | sed -n 's/.*src="\([^"]*\.js\)".*/\1/p' | head -1)
CSS_PATH=$(echo "$HTML" | sed -n 's/.*href="\([^"]*\.css\)".*/\1/p' | head -1)

echo "── JS assets ──"
if [ -n "${JS_PATH:-}" ]; then
    check_status "GET $JS_PATH" "$BASE$JS_PATH" "200"
    check_header "CORS on JS" "$BASE$JS_PATH" "Access-Control-Allow-Origin" "\\*"
else
    echo "  ⚠️  No JS asset found in HTML (build may have no JS output)"
fi

echo "── CSS assets ──"
if [ -n "${CSS_PATH:-}" ]; then
    check_status "GET $CSS_PATH" "$BASE$CSS_PATH" "200"
else
    echo "  ⚠️  No CSS asset found in HTML"
fi

echo "── App renders ──"
TOTAL=$((TOTAL + 1))
if echo "$HTML" | grep -q 'id="root"'; then
    echo "  ✅ Found <div id=\"root\"> in HTML"
    PASS=$((PASS + 1))
else
    echo "  ❌ Missing <div id=\"root\"> in HTML"
    FAIL=$((FAIL + 1))
fi

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
