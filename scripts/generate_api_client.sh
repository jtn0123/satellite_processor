#!/usr/bin/env bash
set -euo pipefail

# Generate TypeScript types from the FastAPI OpenAPI spec.
# Usage: ./scripts/generate_api_client.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
SPEC_FILE="$FRONTEND_DIR/src/api/openapi.json"
TYPES_FILE="$FRONTEND_DIR/src/api/generated-types.ts"

echo "📋 Step 1: Extracting OpenAPI spec from FastAPI app..."
cd "$BACKEND_DIR"
python3 -c "
import json, sys
sys.path.insert(0, '.')
from app.main import app
spec = app.openapi()
print(json.dumps(spec, indent=2))
" > "$SPEC_FILE"
echo "   → Written to $SPEC_FILE"

echo "📋 Step 2: Generating TypeScript types..."
cd "$FRONTEND_DIR"
npx openapi-typescript "$SPEC_FILE" -o "$TYPES_FILE"
echo "   → Written to $TYPES_FILE"

echo "✅ API client types generated successfully!"
