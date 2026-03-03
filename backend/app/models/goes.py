"""Pydantic schemas for GOES endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta

from pydantic import BaseModel, Field, field_validator

from ..services.satellite_registry import get_all_valid_bands, get_all_valid_satellites, get_all_valid_sectors


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
            raise ValueError("end_time must be after start_time")
        # #207: Cap time range at 24 hours
        if start and (v - start) > timedelta(hours=24):
            raise ValueError("Time range must not exceed 24 hours")
        return v


class GoesBackfillRequest(BaseModel):
    satellite: str | None = None
    band: str | None = None
    sector: str = "FullDisk"
    expected_interval: float = Field(default=10.0, ge=0.5, le=60.0)


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
    satellite: str = Field(default="GOES-16")
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
        valid = {"true_color", "natural_color"}
        if v not in valid:
            raise ValueError(f"Invalid recipe. Must be one of: {valid}")
        return v

    @field_validator("end_time")
    @classmethod
    def validate_time_range(cls, v: datetime, info) -> datetime:
        start = info.data.get("start_time")
        if start and v <= start:
            raise ValueError("end_time must be after start_time")
        if start and (v - start) > timedelta(hours=24):
            raise ValueError("Time range must not exceed 24 hours")
        return v


class GoesFetchResponse(BaseModel):
    job_id: str
    status: str
    message: str
