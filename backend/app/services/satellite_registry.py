"""Central satellite configuration registry.

Single source of truth for all satellite metadata: buckets, bands, sectors,
availability, and band descriptions. GOES and Himawari configs live here;
legacy constants in goes_fetcher.py and _goes_shared.py re-export from here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class SectorConfig:
    """Configuration for a single satellite sector/scan region."""

    product_prefix: str
    display_name: str
    cadence_minutes: float
    file_size_kb: int = 4000
    cdn_available: bool = False


@dataclass(frozen=True)
class SatelliteConfig:
    """Full configuration for a satellite."""

    name: str
    bucket: str
    format: str  # "netcdf" | "hsd"
    bands: list[str]
    sectors: dict[str, SectorConfig]
    availability: dict[str, Any]
    band_descriptions: dict[str, str]
    band_metadata: dict[str, dict[str, Any]]
    fetchable: bool = True  # Whether the fetch pipeline supports this satellite


# ---------------------------------------------------------------------------
# GOES band descriptions & metadata (shared across GOES-16/18/19)
# ---------------------------------------------------------------------------

_GOES_BAND_DESCRIPTIONS: dict[str, str] = {
    "C01": "Blue (0.47µm)", "C02": "Red (0.64µm)", "C03": "Veggie (0.86µm)",
    "C04": "Cirrus (1.37µm)", "C05": "Snow/Ice (1.61µm)", "C06": "Cloud Particle (2.24µm)",
    "C07": "Shortwave IR (3.9µm)", "C08": "Upper-level WV (6.2µm)",
    "C09": "Mid-level WV (6.9µm)", "C10": "Lower-level WV (7.3µm)",
    "C11": "Cloud-top Phase (8.4µm)", "C12": "Ozone (9.6µm)",
    "C13": "Clean IR (10.3µm)", "C14": "IR (11.2µm)",
    "C15": "Dirty IR (12.3µm)", "C16": "CO2 (13.3µm)",
    "GEOCOLOR": "GeoColor (True Color Day, IR Night)",
}

_GOES_BAND_METADATA: dict[str, dict[str, Any]] = {
    "C01": {
        "wavelength_um": 0.47, "common_name": "Blue",
        "category": "visible", "use_case": "Daytime aerosol & smoke detection",
    },
    "C02": {
        "wavelength_um": 0.64, "common_name": "Red",
        "category": "visible", "use_case": "Primary visible — clouds & surface features",
    },
    "C03": {
        "wavelength_um": 0.86, "common_name": "Veggie",
        "category": "near_ir", "use_case": "Vegetation health, burn scars",
    },
    "C04": {
        "wavelength_um": 1.37, "common_name": "Cirrus",
        "category": "near_ir", "use_case": "Cirrus cloud detection",
    },
    "C05": {
        "wavelength_um": 1.61, "common_name": "Snow/Ice",
        "category": "near_ir", "use_case": "Snow/ice discrimination, cloud phase",
    },
    "C06": {
        "wavelength_um": 2.24, "common_name": "Cloud Particle",
        "category": "near_ir", "use_case": "Cloud particle size, snow detection",
    },
    "C07": {
        "wavelength_um": 3.9, "common_name": "Shortwave IR",
        "category": "infrared", "use_case": "Fire/hotspot detection, nighttime fog",
    },
    "C08": {
        "wavelength_um": 6.2, "common_name": "Upper Tropo WV",
        "category": "infrared", "use_case": "Upper-level water vapor, jet streams",
    },
    "C09": {
        "wavelength_um": 6.9, "common_name": "Mid Tropo WV",
        "category": "infrared", "use_case": "Mid-level water vapor tracking",
    },
    "C10": {
        "wavelength_um": 7.3, "common_name": "Lower Tropo WV",
        "category": "infrared", "use_case": "Lower-level water vapor, SO₂ detection",
    },
    "C11": {
        "wavelength_um": 8.4, "common_name": "Cloud-Top Phase",
        "category": "infrared", "use_case": "Cloud-top phase, dust detection",
    },
    "C12": {
        "wavelength_um": 9.6, "common_name": "Ozone",
        "category": "infrared", "use_case": "Total column ozone, turbulence",
    },
    "C13": {
        "wavelength_um": 10.3, "common_name": "Clean IR",
        "category": "infrared", "use_case": "Clean IR window — clouds & SST",
    },
    "C14": {
        "wavelength_um": 11.2, "common_name": "IR Longwave",
        "category": "infrared", "use_case": "Cloud-top temperature, general IR",
    },
    "C15": {
        "wavelength_um": 12.3, "common_name": "Dirty IR",
        "category": "infrared", "use_case": "Dirty IR window — volcanic ash",
    },
    "C16": {
        "wavelength_um": 13.3, "common_name": "CO₂ Longwave",
        "category": "infrared", "use_case": "Cloud-top height estimation",
    },
    "GEOCOLOR": {
        "wavelength_um": None, "common_name": "GeoColor",
        "category": "composite", "use_case": "True color daytime, multispectral IR nighttime",
    },
}

_GOES_BANDS: list[str] = [f"C{i:02d}" for i in range(1, 17)] + ["GEOCOLOR"]

_GOES_SECTORS: dict[str, SectorConfig] = {
    "FullDisk": SectorConfig(
        product_prefix="ABI-L2-CMIPF",
        display_name="Full Disk",
        cadence_minutes=10,
        file_size_kb=12000,
        cdn_available=True,
    ),
    "CONUS": SectorConfig(
        product_prefix="ABI-L2-CMIPC",
        display_name="CONUS",
        cadence_minutes=5,
        file_size_kb=4000,
        cdn_available=True,
    ),
    "Mesoscale1": SectorConfig(
        product_prefix="ABI-L2-CMIPM",
        display_name="Mesoscale 1",
        cadence_minutes=1,
        file_size_kb=500,
        cdn_available=False,
    ),
    "Mesoscale2": SectorConfig(
        product_prefix="ABI-L2-CMIPM",
        display_name="Mesoscale 2",
        cadence_minutes=1,
        file_size_kb=500,
        cdn_available=False,
    ),
}

# ---------------------------------------------------------------------------
# Himawari band descriptions & metadata
# ---------------------------------------------------------------------------

_HIMAWARI_BAND_DESCRIPTIONS: dict[str, str] = {
    "B01": "Visible Blue (0.47µm)",
    "B02": "Visible Green (0.51µm)",
    "B03": "Visible Red (0.64µm)",
    "B04": "Near-IR Veggie (0.86µm)",
    "B05": "Snow/Ice (1.6µm)",
    "B06": "Cloud Particle (2.3µm)",
    "B07": "Shortwave IR (3.9µm)",
    "B08": "Upper Water Vapor (6.2µm)",
    "B09": "Mid Water Vapor (6.9µm)",
    "B10": "Lower Water Vapor (7.3µm)",
    "B11": "Cloud-Top Phase (8.6µm)",
    "B12": "Ozone (9.6µm)",
    "B13": "Clean IR Longwave (10.4µm)",
    "B14": "IR Longwave (11.2µm)",
    "B15": "Dirty Longwave (12.4µm)",
    "B16": "CO₂ Longwave (13.3µm)",
    "TrueColor": "True Color (RGB Composite)",
}

_HIMAWARI_BAND_METADATA: dict[str, dict[str, Any]] = {
    "B01": {
        "wavelength_um": 0.47, "common_name": "Blue",
        "category": "visible", "use_case": "Daytime aerosol & smoke detection",
    },
    "B02": {
        "wavelength_um": 0.51, "common_name": "Green",
        "category": "visible", "use_case": "True color green channel, vegetation",
    },
    "B03": {
        "wavelength_um": 0.64, "common_name": "Red",
        "category": "visible", "use_case": "Primary visible — clouds & surface features",
    },
    "B04": {
        "wavelength_um": 0.86, "common_name": "Veggie",
        "category": "near_ir", "use_case": "Vegetation health, burn scars",
    },
    "B05": {
        "wavelength_um": 1.6, "common_name": "Snow/Ice",
        "category": "near_ir", "use_case": "Snow/ice discrimination, cloud phase",
    },
    "B06": {
        "wavelength_um": 2.3, "common_name": "Cloud Particle",
        "category": "near_ir", "use_case": "Cloud particle size, snow detection",
    },
    "B07": {
        "wavelength_um": 3.9, "common_name": "Shortwave IR",
        "category": "infrared", "use_case": "Fire/hotspot detection, nighttime fog",
    },
    "B08": {
        "wavelength_um": 6.2, "common_name": "Upper Tropo WV",
        "category": "infrared", "use_case": "Upper-level water vapor, jet streams",
    },
    "B09": {
        "wavelength_um": 6.9, "common_name": "Mid Tropo WV",
        "category": "infrared", "use_case": "Mid-level water vapor tracking",
    },
    "B10": {
        "wavelength_um": 7.3, "common_name": "Lower Tropo WV",
        "category": "infrared", "use_case": "Lower-level water vapor, SO₂ detection",
    },
    "B11": {
        "wavelength_um": 8.6, "common_name": "Cloud-Top Phase",
        "category": "infrared", "use_case": "Cloud-top phase, dust detection",
    },
    "B12": {
        "wavelength_um": 9.6, "common_name": "Ozone",
        "category": "infrared", "use_case": "Total column ozone, turbulence",
    },
    "B13": {
        "wavelength_um": 10.4, "common_name": "Clean IR",
        "category": "infrared", "use_case": "Clean IR window — clouds & SST",
    },
    "B14": {
        "wavelength_um": 11.2, "common_name": "IR Longwave",
        "category": "infrared", "use_case": "Cloud-top temperature, general IR",
    },
    "B15": {
        "wavelength_um": 12.4, "common_name": "Dirty IR",
        "category": "infrared", "use_case": "Dirty IR window — volcanic ash",
    },
    "B16": {
        "wavelength_um": 13.3, "common_name": "CO₂ Longwave",
        "category": "infrared", "use_case": "Cloud-top height estimation",
    },
    "TrueColor": {
        "wavelength_um": None, "common_name": "True Color",
        "category": "composite", "use_case": "RGB composite from B03+B02+B01",
    },
}

_HIMAWARI_BANDS: list[str] = [f"B{i:02d}" for i in range(1, 17)] + ["TrueColor"]

_HIMAWARI_SECTORS: dict[str, SectorConfig] = {
    "FLDK": SectorConfig(
        product_prefix="AHI-L1b-FLDK",
        display_name="Full Disk",
        cadence_minutes=10,
        file_size_kb=15000,
        cdn_available=False,
    ),
    "Japan": SectorConfig(
        product_prefix="AHI-L1b-Japan",
        display_name="Japan",
        cadence_minutes=2.5,
        file_size_kb=2000,
        cdn_available=False,
    ),
    "Target": SectorConfig(
        product_prefix="AHI-L1b-Target",
        display_name="Target Area",
        cadence_minutes=2.5,
        file_size_kb=2000,
        cdn_available=False,
    ),
}

# ---------------------------------------------------------------------------
# Satellite registry — the single source of truth
# ---------------------------------------------------------------------------

_GOES_AVAILABILITY_16: dict[str, Any] = {
    "available_from": "2017-01-01",
    "available_to": "2025-04-07",
    "status": "historical",
    "description": "GOES-East (historical, replaced by GOES-19)",
}

_GOES_AVAILABILITY_18: dict[str, Any] = {
    "available_from": "2022-01-01",
    "available_to": None,
    "status": "active",
    "description": "GOES-West (active)",
}

_GOES_AVAILABILITY_19: dict[str, Any] = {
    "available_from": "2024-01-01",
    "available_to": None,
    "status": "active",
    "description": "GOES-East (active, replaced GOES-16)",
}

_HIMAWARI_AVAILABILITY: dict[str, Any] = {
    "available_from": "2022-12-13",
    "available_to": None,
    "status": "active",
    "description": "Himawari-9 (JMA, 140.7°E — East Asia, Australia, W. Pacific)",
}


def _make_goes(name: str, bucket: str, availability: dict[str, Any]) -> SatelliteConfig:
    return SatelliteConfig(
        name=name,
        bucket=bucket,
        format="netcdf",
        bands=list(_GOES_BANDS),
        sectors=dict(_GOES_SECTORS),
        availability=dict(availability),
        band_descriptions=dict(_GOES_BAND_DESCRIPTIONS),
        band_metadata={k: dict(v) for k, v in _GOES_BAND_METADATA.items()},
        fetchable=True,
    )


SATELLITE_REGISTRY: dict[str, SatelliteConfig] = {
    "GOES-16": _make_goes("GOES-16", "noaa-goes16", _GOES_AVAILABILITY_16),
    "GOES-18": _make_goes("GOES-18", "noaa-goes18", _GOES_AVAILABILITY_18),
    "GOES-19": _make_goes("GOES-19", "noaa-goes19", _GOES_AVAILABILITY_19),
    "Himawari-9": SatelliteConfig(
        name="Himawari-9",
        bucket="noaa-himawari9",
        format="hsd",
        bands=list(_HIMAWARI_BANDS),
        sectors=dict(_HIMAWARI_SECTORS),
        availability=dict(_HIMAWARI_AVAILABILITY),
        band_descriptions=dict(_HIMAWARI_BAND_DESCRIPTIONS),
        band_metadata={k: dict(v) for k, v in _HIMAWARI_BAND_METADATA.items()},
        fetchable=False,  # Fetch pipeline not yet implemented
    ),
}


# ---------------------------------------------------------------------------
# Public lookup API
# ---------------------------------------------------------------------------

def get_satellite(name: str) -> SatelliteConfig:
    """Get a satellite config by name. Raises KeyError if not found."""
    try:
        return SATELLITE_REGISTRY[name]
    except KeyError:
        raise KeyError(f"Unknown satellite: {name!r}. Valid: {list(SATELLITE_REGISTRY)}")


def get_all_satellites() -> dict[str, SatelliteConfig]:
    """Return the full satellite registry."""
    return dict(SATELLITE_REGISTRY)


def get_all_satellite_names() -> list[str]:
    """Return all registered satellite names."""
    return list(SATELLITE_REGISTRY)


def validate_satellite(name: str) -> None:
    """Raise ValueError if satellite name is not registered."""
    if name not in SATELLITE_REGISTRY:
        raise ValueError(
            f"Unknown satellite: {name}. Valid: {list(SATELLITE_REGISTRY)}"
        )


def validate_sector(satellite: str, sector: str) -> None:
    """Raise ValueError if sector is not valid for the given satellite."""
    validate_satellite(satellite)
    cfg = SATELLITE_REGISTRY[satellite]
    if sector not in cfg.sectors:
        raise ValueError(
            f"Unknown sector: {sector} for {satellite}. "
            f"Valid: {list(cfg.sectors)}"
        )


def validate_band(satellite: str, band: str) -> None:
    """Raise ValueError if band is not valid for the given satellite."""
    validate_satellite(satellite)
    cfg = SATELLITE_REGISTRY[satellite]
    if band not in cfg.bands:
        raise ValueError(
            f"Unknown band: {band} for {satellite}. Valid: {cfg.bands}"
        )


def get_all_valid_satellites() -> set[str]:
    """Return the set of all registered satellite names."""
    return set(SATELLITE_REGISTRY)


def get_all_valid_sectors() -> set[str]:
    """Return the union of all sectors across all satellites."""
    sectors: set[str] = set()
    for cfg in SATELLITE_REGISTRY.values():
        sectors.update(cfg.sectors)
    return sectors


def get_all_valid_bands() -> set[str]:
    """Return the union of all bands across all satellites."""
    bands: set[str] = set()
    for cfg in SATELLITE_REGISTRY.values():
        bands.update(cfg.bands)
    return bands
