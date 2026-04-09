"""Pydantic schemas for GOES endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field, field_validator, model_validator

from ..config import DEFAULT_SATELLITE
from ..services.satellite_registry import (
    SATELLITE_REGISTRY,
    get_all_valid_bands,
    get_all_valid_satellites,
    get_all_valid_sectors,
)

# Clock-skew grace window for schema-level future-date rejection.
# Must match the worker-side helper in routers/goes_fetch.py.
_FUTURE_GRACE = timedelta(minutes=30)


def _reject_future_dt(dt: datetime, field: str) -> None:
    """Reject a datetime that is meaningfully in the future (JTN-421 ISSUE-030)."""
    now = datetime.now(UTC)
    normalized = dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)
    if normalized > now + _FUTURE_GRACE:
        raise ValueError(f"{field} ({normalized.isoformat()}) is in the future; satellite data is not yet available")


def _validate_triple(satellite: str, sector: str, band: str | None = None) -> None:
    """Validate (satellite, sector[, band]) — satellite must support the sector/band.

    Raises ``ValueError`` so Pydantic surfaces a 422 with the offending field
    rather than letting a bare ``KeyError`` escape through the worker
    (JTN-421 ISSUE-029, JTN-426).
    """
    cfg = SATELLITE_REGISTRY.get(satellite)
    if cfg is None:
        return  # caller's per-field validator will already have rejected this
    if sector not in cfg.sectors:
        valid = sorted(cfg.sectors)
        raise ValueError(f"Sector {sector!r} is not valid for {satellite}. Valid sectors: {valid}")
    if band is not None and band not in cfg.bands:
        valid_bands = sorted(cfg.bands)
        raise ValueError(f"Band {band!r} is not valid for {satellite}. Valid bands: {valid_bands}")


# Shared validation messages — keep in one place so Sonar doesn't ding us for
# literal duplication and so all three end_time validators stay in sync.
_END_AFTER_START_MSG = "end_time must be after start_time"


class GoesFetchRequest(BaseModel):
    """Request schema for fetching satellite frames within a time range. Max 24h window."""

    satellite: str = Field(..., description="Satellite name (e.g. GOES-16, GOES-18, GOES-19, Himawari-9)")
    sector: str = Field(..., description="Sector (e.g. FullDisk, CONUS, Mesoscale1, Mesoscale2, FLDK, Japan, Target)")
    band: str = Field(..., description="Band (e.g. C01-C16, B01-B16)")
    start_time: datetime = Field(..., description="Start time (ISO format)")
    end_time: datetime = Field(..., description="End time (ISO format)")

    @field_validator("satellite")
    @classmethod
    def validate_satellite(cls, v: str) -> str:
        valid = get_all_valid_satellites()
        if v not in valid:
            raise ValueError(f"Invalid satellite. Must be one of: {sorted(valid)}")
        return v

    @field_validator("sector")
    @classmethod
    def validate_sector(cls, v: str) -> str:
        valid = get_all_valid_sectors()
        if v not in valid:
            raise ValueError(f"Invalid sector. Must be one of: {sorted(valid)}")
        return v

    @field_validator("band")
    @classmethod
    def validate_band(cls, v: str) -> str:
        # GEOCOLOR and TrueColor are composites — block from direct S3 fetch
        if v == "GEOCOLOR":
            raise ValueError(
                "GEOCOLOR is a pre-rendered composite available via CDN only "
                "and cannot be fetched from S3. Use bands C01-C16."
            )
        if v == "TrueColor":
            raise ValueError(
                "TrueColor is a composite (B03+B02+B01) that must be created "
                "via the composite pipeline. Use bands B01-B16."
            )
        valid = get_all_valid_bands() - {"GEOCOLOR", "TrueColor"}
        if v not in valid:
            raise ValueError(f"Invalid band. Must be one of: {sorted(valid)}")
        return v

    @field_validator("end_time")
    @classmethod
    def validate_time_range(cls, v: datetime, info) -> datetime:
        start = info.data.get("start_time")
        if start and v <= start:
            raise ValueError(_END_AFTER_START_MSG)
        # #207: Cap time range at 24 hours
        if start and (v - start) > timedelta(hours=24):
            raise ValueError("Time range must not exceed 24 hours")
        _reject_future_dt(v, "end_time")
        return v

    @field_validator("start_time")
    @classmethod
    def validate_start_not_future(cls, v: datetime) -> datetime:
        _reject_future_dt(v, "start_time")
        return v

    @model_validator(mode="after")
    def validate_satellite_sector_band(self):
        _validate_triple(self.satellite, self.sector, self.band)
        return self


class GoesBackfillRequest(BaseModel):
    """Request schema for backfilling detected gaps.

    JTN-460: satellite, sector, band, start_time, and end_time are now required
    to prevent silent no-ops when an empty body is posted.
    """

    satellite: str = Field(..., description="Satellite name (required)")
    sector: str = Field(..., description="Sector (required)")
    band: str = Field(..., description="Band (required)")
    start_time: datetime = Field(..., description="Start of the backfill range (ISO format)")
    end_time: datetime = Field(..., description="End of the backfill range (ISO format)")
    expected_interval: float = Field(default=10.0, ge=0.5, le=60.0)

    @field_validator("end_time")
    @classmethod
    def validate_time_range(cls, v: datetime, info) -> datetime:
        start = info.data.get("start_time")
        if start and v <= start:
            raise ValueError(_END_AFTER_START_MSG)
        if start and (v - start) > timedelta(days=7):
            raise ValueError("Backfill time range must not exceed 7 days")
        return v


class SatelliteAvailability(BaseModel):
    available_from: str
    available_to: str | None
    status: str
    description: str


class GoesProductsResponse(BaseModel):
    satellites: list[str]
    satellite_availability: dict[str, SatelliteAvailability]
    sectors: list[dict[str, str]]
    bands: list[dict[str, str]]
    default_satellite: str


class GapInfo(BaseModel):
    start: str
    end: str
    duration_minutes: float
    expected_frames: int


class CoverageStats(BaseModel):
    coverage_percent: float
    gap_count: int
    total_frames: int
    expected_frames: int
    time_range: dict[str, str] | None
    gaps: list[GapInfo]


class CompositeCreateRequest(BaseModel):
    """Request schema for creating a band composite image."""

    recipe: str = Field(..., description="Composite recipe name")
    satellite: str = Field(default=DEFAULT_SATELLITE)
    sector: str = Field(default="CONUS")
    capture_time: str = Field(..., description="Capture time (ISO format)")


class CompositeResponse(BaseModel):
    id: str
    name: str
    recipe: str
    satellite: str
    sector: str
    capture_time: str | None = None
    file_path: str | None = None
    file_size: int | None = None
    status: str
    error: str | None = None
    created_at: str | None = None
    image_url: str | None = None

    model_config = {"from_attributes": True}


class FetchCompositeRequest(BaseModel):
    """Request schema for fetching composite imagery (multi-band + auto-composite)."""

    satellite: str = Field(..., description="Satellite name (e.g. GOES-16, GOES-18, GOES-19, Himawari-9)")
    sector: str = Field(..., description="Sector (e.g. FullDisk, CONUS, Mesoscale1, Mesoscale2, FLDK, Japan, Target)")
    recipe: str = Field(..., description="Composite recipe (true_color, natural_color)")
    start_time: datetime = Field(..., description="Start time (ISO format)")
    end_time: datetime = Field(..., description="End time (ISO format)")

    @field_validator("satellite")
    @classmethod
    def validate_satellite(cls, v: str) -> str:
        valid = get_all_valid_satellites()
        if v not in valid:
            raise ValueError(f"Invalid satellite. Must be one of: {sorted(valid)}")
        return v

    @field_validator("sector")
    @classmethod
    def validate_sector(cls, v: str) -> str:
        valid = get_all_valid_sectors()
        if v not in valid:
            raise ValueError(f"Invalid sector. Must be one of: {sorted(valid)}")
        return v

    @field_validator("recipe")
    @classmethod
    def validate_recipe(cls, v: str) -> str:
        valid = {"true_color", "natural_color", "himawari_true_color"}
        if v not in valid:
            raise ValueError(f"Invalid recipe. Must be one of: {valid}")
        return v

    @field_validator("end_time")
    @classmethod
    def validate_time_range(cls, v: datetime, info) -> datetime:
        start = info.data.get("start_time")
        if start and v <= start:
            raise ValueError(_END_AFTER_START_MSG)
        if start and (v - start) > timedelta(hours=24):
            raise ValueError("Time range must not exceed 24 hours")
        _reject_future_dt(v, "end_time")
        return v

    @field_validator("start_time")
    @classmethod
    def validate_start_not_future(cls, v: datetime) -> datetime:
        _reject_future_dt(v, "start_time")
        return v

    @model_validator(mode="after")
    def validate_satellite_sector(self):
        _validate_triple(self.satellite, self.sector)
        return self


class GoesFetchResponse(BaseModel):
    job_id: str
    status: str
    message: str
