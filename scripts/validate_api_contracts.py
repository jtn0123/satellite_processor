#!/usr/bin/env python3
"""Validate that all frontend API calls match the backend OpenAPI spec.

Usage:
    cd backend && python3 ../scripts/validate_api_contracts.py

Exits with code 1 if any mismatch is found.
"""

import json
import re
import sys
from pathlib import Path

# --- Step 1: Extract OpenAPI spec from the FastAPI app ---

def get_openapi_spec() -> dict:
    """Import the FastAPI app and get its OpenAPI spec."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
    from app.main import app  # noqa: E402
    return app.openapi()


# --- Step 2: Parse frontend API calls ---

# Matches: api.get('/path'), api.post(`/path`), api.delete("/path/${id}/action"), etc.
API_CALL_RE = re.compile(
    r"""api\.(get|post|put|patch|delete)\(\s*[`'"](/[^`'"]*?)[`'"]"""
)

# Template literal interpolation patterns like ${id}
TEMPLATE_VAR_RE = re.compile(r"\$\{[^}]+\}")


def normalize_path(raw_path: str) -> str:
    """Convert template literal paths to OpenAPI path-param style.

    e.g. /notifications/${id}/read → /notifications/{id}/read
    """
    def replacer(m: re.Match) -> str:
        var_name = m.group(0)[2:-1]  # strip ${ and }
        return f"{{{var_name}}}"
    return TEMPLATE_VAR_RE.sub(replacer, raw_path)


def scan_frontend_calls(frontend_dir: Path) -> list[tuple[str, str, str, int]]:
    """Scan .ts/.tsx files for api.method('/path') calls.

    Returns list of (method, raw_path, file, line_number).
    """
    calls = []
    for ext in ("*.ts", "*.tsx"):
        for file in frontend_dir.rglob(ext):
            # Skip test files
            if "/test/" in str(file) or file.name.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")):
                continue
            content = file.read_text(errors="ignore")
            for line_no, line in enumerate(content.splitlines(), 1):
                for match in API_CALL_RE.finditer(line):
                    method = match.group(1).upper()
                    raw_path = match.group(2)
                    calls.append((method, raw_path, str(file), line_no))
    return calls


def path_matches_spec(normalized: str, spec_path: str) -> bool:
    """Check if a normalized frontend path matches an OpenAPI spec path.

    Handles path parameters: /goes/frames/{frame_id} matches /goes/frames/{id}
    """
    norm_parts = normalized.strip("/").split("/")
    spec_parts = spec_path.strip("/").split("/")
    if len(norm_parts) != len(spec_parts):
        return False
    for np, sp in zip(norm_parts, spec_parts):
        if sp.startswith("{") and sp.endswith("}"):
            # Any path param segment matches
            if np.startswith("{") and np.endswith("}"):
                continue
            continue
        if np.startswith("{") and np.endswith("}"):
            continue
        if np != sp:
            return False
    return True


def main() -> int:
    spec = get_openapi_spec()
    paths = spec.get("paths", {})

    # Build set of (METHOD, path) from spec
    spec_endpoints: dict[str, set[str]] = {}
    for path, methods in paths.items():
        for method in methods:
            method_upper = method.upper()
            if method_upper in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                spec_endpoints.setdefault(method_upper, set()).add(path)

    frontend_dir = Path(__file__).resolve().parent.parent / "frontend" / "src"
    calls = scan_frontend_calls(frontend_dir)

    mismatches = []
    for method, raw_path, file, line_no in calls:
        normalized = normalize_path(raw_path)
        # Frontend calls omit /api prefix since axios baseURL includes it
        api_path = f"/api{normalized}"

        method_paths = spec_endpoints.get(method, set())
        matched = any(path_matches_spec(api_path, sp) for sp in method_paths)

        if not matched:
            # Check if the path exists with a different method
            all_paths = set()
            for paths_set in spec_endpoints.values():
                all_paths.update(paths_set)
            path_exists = any(path_matches_spec(api_path, sp) for sp in all_paths)
            if path_exists:
                mismatches.append(
                    f"  WRONG METHOD: {method} {raw_path} → path exists but not with {method}"
                    f"\n    at {file}:{line_no}"
                )
            else:
                mismatches.append(
                    f"  MISSING: {method} {raw_path} → no matching endpoint in spec"
                    f"\n    at {file}:{line_no}"
                )

    if mismatches:
        print(f"❌ Found {len(mismatches)} API contract mismatch(es):\n")
        for m in mismatches:
            print(m)
        print(f"\nSpec has {sum(len(v) for v in spec_endpoints.values())} endpoints across {len(spec_endpoints)} methods")
        return 1

    print(f"✅ All {len(calls)} frontend API calls match the OpenAPI spec")
    return 0


def check_band_consistency() -> int:
    """Verify all bands from /goes/products are in VALID_BANDS."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
    from app.services.goes_fetcher import VALID_BANDS  # noqa: E402

    from app.main import app  # noqa: E402
    import asyncio
    from httpx import ASGITransport, AsyncClient

    async def _check() -> int:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/goes/products")
            if resp.status_code != 200:
                print(f"❌ /api/goes/products returned {resp.status_code}")
                return 1
            raw_bands = resp.json().get("bands", [])
            bands = [b["id"] if isinstance(b, dict) else b for b in raw_bands]
            missing = [b for b in bands if b not in VALID_BANDS]
            if missing:
                print(f"❌ Bands in /goes/products but not in VALID_BANDS: {missing}")
                return 1
            print(f"✅ All {len(bands)} product bands are in VALID_BANDS")
            return 0

    return asyncio.run(_check())


if __name__ == "__main__":
    rc = main()
    rc2 = check_band_consistency()
    sys.exit(rc or rc2)
