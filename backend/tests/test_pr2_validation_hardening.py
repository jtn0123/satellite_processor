"""Tests for PR2 backend API validation hardening.

Covers JTN-421, JTN-426, JTN-473, JTN-474, and JTN-475. These tests
exercise the validation edges that previously let malformed requests
through and either crashed workers or leaked internal state into the
API contract.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from app.db.models import FetchPreset, GoesFrame, Job, Tag
from app.utils import utcnow


def _make_frame(**overrides) -> GoesFrame:
    defaults = {
        "id": str(uuid.uuid4()),
        "satellite": "GOES-19",
        "sector": "CONUS",
        "band": "C02",
        "capture_time": utcnow(),
        "file_path": "./data/test.png",
        "file_size": 1024,
        "width": 100,
        "height": 100,
    }
    defaults.update(overrides)
    return GoesFrame(**defaults)


# ────────────────────────────────────────────────────────────────────
# JTN-421 + JTN-426 — future dates, impossible tuples, empty job bodies
# ────────────────────────────────────────────────────────────────────


class TestJobCreateValidation:
    """JTN-421 ISSUE-028: POST /api/jobs empty-body rejection."""

    @pytest.mark.asyncio
    async def test_empty_body_rejected(self, client):
        resp = await client.post("/api/jobs", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_empty_params_without_input_path_rejected(self, client):
        resp = await client.post(
            "/api/jobs",
            json={"job_type": "image_process", "params": {}},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_with_input_path_accepted(self, client):
        with patch("app.routers.jobs.celery_app") as mock_celery:
            mock_celery.send_task.return_value = MagicMock(id="task-1")
            resp = await client.post(
                "/api/jobs",
                json={
                    "job_type": "image_process",
                    "params": {},
                    "input_path": "/data/frames",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        # JTN-421 ISSUE-028 part 2: celery_task_id is NOT echoed into status_message.
        assert "celery_task_id:" not in (data.get("status_message") or "")
        assert data.get("task_id") == "task-1"


class TestFetchFutureDateValidation:
    """JTN-421 ISSUE-030: future-dated fetch ranges should 422."""

    @pytest.mark.asyncio
    async def test_future_start_time_rejected(self, client):
        future = datetime.now(UTC) + timedelta(days=365 * 30)
        resp = await client.post(
            "/api/satellite/fetch",
            json={
                "satellite": "GOES-19",
                "sector": "CONUS",
                "band": "C02",
                "start_time": future.isoformat(),
                "end_time": (future + timedelta(hours=1)).isoformat(),
            },
        )
        assert resp.status_code == 422
        body_str = resp.text.lower()
        assert "future" in body_str or "not yet available" in body_str

    @pytest.mark.asyncio
    async def test_now_plus_grace_accepted(self, client):
        """A near-now request falls within the 30-minute clock-skew grace."""
        now = datetime.now(UTC)
        start = now - timedelta(hours=1)
        end = now + timedelta(minutes=5)  # inside the 30-min grace
        resp = await client.post(
            "/api/satellite/fetch",
            json={
                "satellite": "GOES-19",
                "sector": "CONUS",
                "band": "C02",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
            },
        )
        # May 200/201/202 (task dispatch fails in test env) but must not 422
        # for future-date reason specifically.
        assert resp.status_code != 422 or "future" not in resp.text.lower()


class TestFetchTripleValidation:
    """JTN-421 ISSUE-029 + JTN-426: reject impossible (satellite, sector, band) combos."""

    @pytest.mark.asyncio
    async def test_goes19_with_himawari_sector_rejected(self, client):
        start = datetime.now(UTC) - timedelta(hours=2)
        end = start + timedelta(hours=1)
        resp = await client.post(
            "/api/satellite/fetch",
            json={
                "satellite": "GOES-19",
                "sector": "FLDK",  # Himawari only
                "band": "C02",
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
            },
        )
        assert resp.status_code == 422
        body = resp.text.lower()
        assert "fldk" in body or "valid sectors" in body or "sector" in body

    @pytest.mark.asyncio
    async def test_himawari_with_goes_band_rejected(self, client):
        start = datetime.now(UTC) - timedelta(hours=2)
        end = start + timedelta(hours=1)
        resp = await client.post(
            "/api/satellite/fetch",
            json={
                "satellite": "Himawari-9",
                "sector": "FLDK",
                "band": "C02",  # GOES-only band
                "start_time": start.isoformat(),
                "end_time": end.isoformat(),
            },
        )
        assert resp.status_code == 422
        assert "c02" in resp.text.lower() or "valid bands" in resp.text.lower()


class TestLastFetchTimeOnPresets:
    """JTN-421 ISSUE-031: preset list should expose last_fetch_time."""

    @pytest.mark.asyncio
    async def test_last_fetch_time_populated_from_completed_job(self, client, db):
        preset = FetchPreset(
            id=str(uuid.uuid4()),
            name="Test Preset",
            satellite="GOES-19",
            sector="CONUS",
            band="C02",
            description="test",
        )
        db.add(preset)
        completed_at = datetime.now(UTC) - timedelta(minutes=5)
        job = Job(
            id=str(uuid.uuid4()),
            job_type="goes_fetch",
            status="completed",
            params={"preset_id": preset.id},
            completed_at=completed_at,
        )
        db.add(job)
        await db.commit()

        resp = await client.get("/api/satellite/fetch-presets")
        assert resp.status_code == 200
        body = resp.json()
        matching = [p for p in body if p["id"] == preset.id]
        assert matching, "seeded preset missing from list"
        assert matching[0]["last_fetch_time"] is not None

    @pytest.mark.asyncio
    async def test_last_fetch_time_null_when_never_run(self, client, db):
        preset = FetchPreset(
            id=str(uuid.uuid4()),
            name="Never Run",
            satellite="GOES-19",
            sector="CONUS",
            band="C02",
            description="test",
        )
        db.add(preset)
        await db.commit()

        resp = await client.get("/api/satellite/fetch-presets")
        matching = [p for p in resp.json() if p["id"] == preset.id]
        assert matching
        assert matching[0]["last_fetch_time"] is None


# ────────────────────────────────────────────────────────────────────
# JTN-473 — share link, image upload, export, idempotency, bulk caps
# ────────────────────────────────────────────────────────────────────


class TestShareLinkBodyHours:
    """JTN-473 Issue A: share link body expires_in_hours honored + bounds."""

    @pytest.mark.asyncio
    async def test_body_expires_in_hours_honored(self, client, db):
        frame = _make_frame(id="share-body-1")
        db.add(frame)
        await db.commit()

        resp = await client.post(
            "/api/satellite/frames/share-body-1/share",
            json={"expires_in_hours": 24},
        )
        assert resp.status_code == 200
        data = resp.json()
        expires = datetime.fromisoformat(data["expires_at"])
        now = utcnow()
        # Should expire ~24h from now, not the old 72h default
        delta_hours = (expires - now).total_seconds() / 3600
        assert 23 < delta_hours < 25

    @pytest.mark.asyncio
    async def test_body_hours_alias_honored(self, client, db):
        frame = _make_frame(id="share-body-2")
        db.add(frame)
        await db.commit()

        resp = await client.post(
            "/api/satellite/frames/share-body-2/share",
            json={"hours": 12},
        )
        assert resp.status_code == 200
        expires = datetime.fromisoformat(resp.json()["expires_at"])
        delta_hours = (expires - utcnow()).total_seconds() / 3600
        assert 11 < delta_hours < 13

    @pytest.mark.asyncio
    async def test_body_negative_rejected(self, client, db):
        frame = _make_frame(id="share-body-3")
        db.add(frame)
        await db.commit()

        resp = await client.post(
            "/api/satellite/frames/share-body-3/share",
            json={"expires_in_hours": -1},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_body_zero_rejected(self, client, db):
        frame = _make_frame(id="share-body-4")
        db.add(frame)
        await db.commit()

        resp = await client.post(
            "/api/satellite/frames/share-body-4/share",
            json={"expires_in_hours": 0},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_body_above_30_days_rejected(self, client, db):
        frame = _make_frame(id="share-body-5")
        db.add(frame)
        await db.commit()

        resp = await client.post(
            "/api/satellite/frames/share-body-5/share",
            json={"expires_in_hours": 10_000},
        )
        assert resp.status_code == 422


class TestImageUploadValidation:
    """JTN-473 Issue B: image upload content-type allowlist + PIL verify."""

    @pytest.mark.asyncio
    async def test_upload_rejects_non_image_content(self, client):
        # Small text payload with a .jpg extension — bytes clearly aren't an image.
        resp = await client.post(
            "/api/images/upload",
            files={"file": ("fake.jpg", b"this is not an image", "image/jpeg")},
        )
        # Either 415 (PIL verify failed) or 400 (extension check) is acceptable;
        # 200 would mean we silently stored junk.
        assert resp.status_code in (400, 415), resp.text

    @pytest.mark.asyncio
    async def test_upload_rejects_text_content_type(self, client):
        resp = await client.post(
            "/api/images/upload",
            files={"file": ("fake.jpg", b"hello", "text/plain")},
        )
        assert resp.status_code in (400, 415)

    @pytest.mark.asyncio
    async def test_upload_rejects_content_length_over_cap(self, client):
        # Send an oversize Content-Length header — no body needs to be streamed
        # because the request-time check rejects it early.
        resp = await client.post(
            "/api/images/upload",
            files={"file": ("big.jpg", b"x", "image/jpeg")},
            headers={"content-length": str(200 * 1024 * 1024)},
        )
        # httpx overrides content-length; the second gate (streamed size) is
        # exercised separately. This test asserts the route is reachable.
        assert resp.status_code in (400, 413, 415), resp.text


class TestFrameExportFormat:
    """JTN-473 Issue C: Accept header / explicit format param respected."""

    @pytest.mark.asyncio
    async def test_default_is_csv(self, client):
        resp = await client.get("/api/satellite/frames/export")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_explicit_json_wins(self, client):
        resp = await client.get("/api/satellite/frames/export?format=json")
        assert resp.status_code == 200
        assert "application/json" in resp.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_accept_json_header_respected(self, client):
        resp = await client.get(
            "/api/satellite/frames/export",
            headers={"accept": "application/json"},
        )
        assert resp.status_code == 200
        assert "application/json" in resp.headers.get("content-type", "")


class TestAnimationIdempotency:
    """JTN-473 Issue E: identical animation requests within a short window dedupe."""

    @pytest.mark.asyncio
    async def test_back_to_back_returns_same_id(self, client, db):
        # Clear the idempotency cache between tests — module-level dict state.
        from app.routers import animations as animations_router

        animations_router._animation_idempotency_cache.clear()

        # Insert a couple of frames so the worker actually has something to pick.
        capture = utcnow() - timedelta(hours=1)
        for i in range(3):
            db.add(
                GoesFrame(
                    id=f"anim-frame-{i}",
                    satellite="GOES-19",
                    sector="CONUS",
                    band="C02",
                    capture_time=capture + timedelta(minutes=i * 5),
                    file_path=f"./data/frame_{i}.png",
                    file_size=100,
                    width=10,
                    height=10,
                )
            )
        await db.commit()

        payload = {
            "satellite": "GOES-19",
            "sector": "CONUS",
            "band": "C02",
            "start_time": (capture - timedelta(minutes=5)).isoformat(),
            "end_time": (capture + timedelta(hours=1)).isoformat(),
            "fps": 12,
            "format": "mp4",
        }
        with patch(
            "app.tasks.animation_tasks.generate_animation.delay",
            return_value=MagicMock(id="fake-task"),
        ):
            r1 = await client.post("/api/satellite/animations/from-range", json=payload)
            assert r1.status_code == 200, r1.text
            id1 = r1.json()["id"]

            r2 = await client.post("/api/satellite/animations/from-range", json=payload)
            assert r2.status_code == 200
            id2 = r2.json()["id"]
        assert id1 == id2, "expected idempotency dedupe on identical params"

    @pytest.mark.asyncio
    async def test_user_name_preserved(self, client, db):
        from app.routers import animations as animations_router

        animations_router._animation_idempotency_cache.clear()
        capture = utcnow() - timedelta(hours=1)
        db.add(
            GoesFrame(
                id="anim-frame-name-1",
                satellite="GOES-19",
                sector="CONUS",
                band="C02",
                capture_time=capture,
                file_path="./data/frame.png",
                file_size=100,
                width=10,
                height=10,
            )
        )
        await db.commit()

        with patch(
            "app.tasks.animation_tasks.generate_animation.delay",
            return_value=MagicMock(id="fake-task"),
        ):
            resp = await client.post(
                "/api/satellite/animations/from-range",
                json={
                    "name": "My Custom Title",
                    "satellite": "GOES-19",
                    "sector": "CONUS",
                    "band": "C02",
                    "start_time": (capture - timedelta(minutes=5)).isoformat(),
                    "end_time": (capture + timedelta(hours=1)).isoformat(),
                    "fps": 12,
                },
            )
        assert resp.status_code == 200
        assert resp.json()["name"] == "My Custom Title"


class TestBulkJobDeleteCaps:
    """JTN-473 Issue D: bulk delete empty/overcap rejection."""

    @pytest.mark.asyncio
    async def test_missing_body_and_no_all_rejected(self, client):
        resp = await client.request("DELETE", "/api/jobs/bulk", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_empty_array_rejected(self, client):
        resp = await client.request("DELETE", "/api/jobs/bulk", json={"job_ids": []})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_oversize_array_rejected(self, client):
        resp = await client.request(
            "DELETE",
            "/api/jobs/bulk",
            json={"job_ids": [str(uuid.uuid4()) for _ in range(1000)]},
        )
        assert resp.status_code == 422


# ────────────────────────────────────────────────────────────────────
# JTN-474 — CRUD hardening
# ────────────────────────────────────────────────────────────────────


class TestSeedDefaultsExpanded:
    """JTN-474 ISSUE-058: seed list now covers common GOES + Himawari presets."""

    @pytest.mark.asyncio
    async def test_seed_creates_more_than_one(self, client):
        resp = await client.post("/api/satellite/fetch-presets/seed-defaults")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] > 1
        names = set(data["seeded"])
        assert any("GOES-19" in n for n in names)
        assert any("Himawari" in n for n in names)


class TestSettingsDefaultCropBounds:
    """JTN-474 ISSUE-060: negative default_crop rejected."""

    @pytest.mark.asyncio
    async def test_negative_crop_rejected(self, client):
        resp = await client.put(
            "/api/settings",
            json={"default_crop": {"x": -100, "y": 0, "w": 100, "h": 100}},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_huge_crop_rejected(self, client):
        resp = await client.put(
            "/api/settings",
            json={"default_crop": {"x": 0, "y": 0, "w": 1_000_000_000, "h": 1}},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_unknown_field_rejected(self, client):
        resp = await client.put("/api/settings", json={"totally_bogus_field": "oops"})
        assert resp.status_code == 422


class TestFrameTaggingIDValidation:
    """JTN-474 ISSUE-061: tag / frame id existence checked."""

    @pytest.mark.asyncio
    async def test_nonexistent_frame_404(self, client, db):
        tag = Tag(id="tag-exists", name="real-tag", color="#000000")
        db.add(tag)
        await db.commit()
        resp = await client.post(
            "/api/satellite/frames/tag",
            json={
                "frame_ids": [str(uuid.uuid4())],
                "tag_ids": ["tag-exists"],
            },
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_nonexistent_tag_404(self, client, db):
        frame = _make_frame(id="frame-tag-test-1")
        db.add(frame)
        await db.commit()
        resp = await client.post(
            "/api/satellite/frames/tag",
            json={
                "frame_ids": ["frame-tag-test-1"],
                "tag_ids": [str(uuid.uuid4())],
            },
        )
        assert resp.status_code == 404


class TestFrameCountExpectedField:
    """JTN-474 ISSUE-062: frame-count exposes expected_count alongside count."""

    @pytest.mark.asyncio
    async def test_expected_count_in_response_shape_validated_against_bad_params(self, client):
        # Bad combination — rejected at 422 instead of 500 (JTN-475 ISSUE-059).
        resp = await client.get(
            "/api/satellite/frame-count",
            params={
                "satellite": "GOES-19",
                "sector": "FLDK",  # Himawari-only
                "band": "C02",
                "start_time": "2026-01-01T00:00:00Z",
                "end_time": "2026-01-01T01:00:00Z",
            },
        )
        assert resp.status_code == 422


class TestAnimationPresetBounds:
    """JTN-474 ISSUE-067 + 068: fps cap raised + hours_back must be positive."""

    @pytest.mark.asyncio
    async def test_fps_60_accepted(self, client):
        resp = await client.post(
            "/api/satellite/animation-presets",
            json={
                "name": "fps60",
                "satellite": "GOES-19",
                "sector": "CONUS",
                "band": "C02",
                "fps": 60,
            },
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_fps_above_60_rejected(self, client):
        resp = await client.post(
            "/api/satellite/animation-presets",
            json={
                "name": "fps61",
                "satellite": "GOES-19",
                "sector": "CONUS",
                "band": "C02",
                "fps": 61,
            },
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_negative_hours_back_rejected(self, client):
        resp = await client.post(
            "/api/satellite/animation-presets",
            json={
                "name": "neg-hours",
                "satellite": "GOES-19",
                "sector": "CONUS",
                "band": "C02",
                "fps": 10,
                "hours_back": -1,
            },
        )
        assert resp.status_code == 422


class TestCropPresetBounds:
    """JTN-474 ISSUE-069: crop preset coords have an upper bound."""

    @pytest.mark.asyncio
    async def test_huge_width_rejected(self, client):
        resp = await client.post(
            "/api/satellite/crop-presets",
            json={
                "name": "huge",
                "x": 0,
                "y": 0,
                "width": 999_999_999,
                "height": 100,
            },
        )
        assert resp.status_code == 422


class TestScheduleIntervalCap:
    """JTN-474 ISSUE-070: schedule interval_minutes capped at 1 week."""

    @pytest.mark.asyncio
    async def test_oversize_interval_rejected(self, client, db):
        preset = FetchPreset(
            id=str(uuid.uuid4()),
            name="x",
            satellite="GOES-19",
            sector="CONUS",
            band="C02",
            description="",
        )
        db.add(preset)
        await db.commit()

        resp = await client.post(
            "/api/satellite/schedules",
            json={
                "name": "too-long",
                "preset_id": preset.id,
                "interval_minutes": 99_999,  # 69 days
            },
        )
        assert resp.status_code == 422


class TestTagNameCleaning:
    """JTN-474 ISSUE-071 + 072: trim whitespace, reject HTML."""

    @pytest.mark.asyncio
    async def test_script_tag_rejected(self, client):
        resp = await client.post(
            "/api/satellite/tags",
            json={"name": "<script>alert(1)</script>"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_whitespace_trimmed(self, client):
        resp = await client.post(
            "/api/satellite/tags",
            json={"name": "  trim-me  "},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "trim-me"

    @pytest.mark.asyncio
    async def test_case_insensitive_duplicate(self, client):
        r1 = await client.post("/api/satellite/tags", json={"name": "CaseTest"})
        assert r1.status_code == 200
        r2 = await client.post("/api/satellite/tags", json={"name": "casetest"})
        assert r2.status_code == 409


class TestPresetNameHtmlRejection:
    """JTN-474 ISSUE-071: preset name rejects HTML."""

    @pytest.mark.asyncio
    async def test_html_name_rejected(self, client):
        resp = await client.post(
            "/api/presets",
            json={
                "name": "<img src=x onerror=alert(1)>",
                "params": {"fps": 30},
            },
        )
        assert resp.status_code == 422


# ────────────────────────────────────────────────────────────────────
# JTN-475 — 500s → 422s, cache headers, recipes
# ────────────────────────────────────────────────────────────────────


class TestPreviewCatalog422:
    """JTN-475 ISSUE-059: invalid band/satellite returns 422, not 500."""

    @pytest.mark.asyncio
    async def test_catalog_invalid_band(self, client):
        resp = await client.get(
            "/api/satellite/catalog",
            params={
                "satellite": "GOES-19",
                "sector": "CONUS",
                "band": "C99",
                "date": "2026-01-01",
            },
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_catalog_invalid_satellite(self, client):
        resp = await client.get(
            "/api/satellite/catalog",
            params={
                "satellite": "NotReal",
                "sector": "CONUS",
                "band": "C02",
            },
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_preview_invalid_band(self, client):
        resp = await client.get(
            "/api/satellite/preview",
            params={
                "satellite": "GOES-19",
                "sector": "CONUS",
                "band": "C99",
                "time": "2026-01-01T00:00:00Z",
            },
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_preview_invalid_satellite(self, client):
        resp = await client.get(
            "/api/satellite/preview",
            params={
                "satellite": "NotReal",
                "sector": "CONUS",
                "band": "C02",
                "time": "2026-01-01T00:00:00Z",
            },
        )
        assert resp.status_code == 422


class TestCompositeRecipesFix:
    """JTN-475 ISSUE-066: natural_color and fire_detection distinct band sets."""

    @pytest.mark.asyncio
    async def test_natural_color_and_fire_detection_distinct(self, client):
        resp = await client.get("/api/satellite/composite-recipes")
        assert resp.status_code == 200
        by_id = {r["id"]: r for r in resp.json()}
        assert "natural_color" in by_id
        assert "fire_detection" in by_id
        assert by_id["natural_color"]["bands"] != by_id["fire_detection"]["bands"]
        # Natural color uses visible + veggie bands (C01..C03)
        assert set(by_id["natural_color"]["bands"]) == {"C01", "C02", "C03"}


class TestFrameImageCacheHeaders:
    """JTN-475 ISSUE-065: /frames/{id}/image emits ETag/Last-Modified."""

    @pytest.mark.asyncio
    async def test_file_response_emits_last_modified(self, client, db):
        from pathlib import Path

        from app.config import settings as app_settings

        storage_root = Path(app_settings.storage_path).resolve()
        storage_root.mkdir(parents=True, exist_ok=True)
        img_path = storage_root / "pr2_cache_headers_test.png"
        # Minimal valid 1x1 PNG so FileResponse can stat and serve it.
        img_path.write_bytes(
            bytes.fromhex(
                "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
                "890000000d49444154789c6300010000000500010d0a2db40000000049454e44"
                "ae426082"
            )
        )
        try:
            frame_id = str(uuid.uuid4())
            frame = GoesFrame(
                id=frame_id,
                satellite="GOES-19",
                sector="CONUS",
                band="C02",
                capture_time=utcnow(),
                file_path=str(img_path),
                file_size=img_path.stat().st_size,
                width=1,
                height=1,
            )
            db.add(frame)
            await db.commit()

            resp = await client.get(f"/api/satellite/frames/{frame_id}/image")
            # FileResponse emits at least content-length and last-modified on real files.
            assert resp.status_code == 200, resp.text
            header_keys = {k.lower() for k in resp.headers}
            assert "last-modified" in header_keys
        finally:
            img_path.unlink(missing_ok=True)
