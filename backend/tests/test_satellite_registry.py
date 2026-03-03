"""Tests for the satellite registry — central config for all satellites."""
from __future__ import annotations

import pytest
from app.services.satellite_registry import (
    SATELLITE_REGISTRY,
    SatelliteConfig,
    SectorConfig,
    get_all_satellite_names,
    get_all_satellites,
    get_all_valid_bands,
    get_all_valid_satellites,
    get_all_valid_sectors,
    get_satellite,
    validate_band,
    validate_satellite,
    validate_sector,
)


class TestRegistryContents:
    """All expected satellites are registered with correct metadata."""

    def test_all_satellites_registered(self):
        names = get_all_satellite_names()
        assert "GOES-16" in names
        assert "GOES-18" in names
        assert "GOES-19" in names
        assert "Himawari-9" in names

    def test_four_satellites_total(self):
        assert len(SATELLITE_REGISTRY) == 4

    @pytest.mark.parametrize("name", ["GOES-16", "GOES-18", "GOES-19", "Himawari-9"])
    def test_get_satellite_returns_config(self, name):
        cfg = get_satellite(name)
        assert isinstance(cfg, SatelliteConfig)
        assert cfg.name == name

    def test_get_all_satellites_returns_dict(self):
        all_sats = get_all_satellites()
        assert isinstance(all_sats, dict)
        assert len(all_sats) == 4


class TestGOESConfig:
    """GOES satellites have correct configuration."""

    @pytest.mark.parametrize("name,bucket", [
        ("GOES-16", "noaa-goes16"),
        ("GOES-18", "noaa-goes18"),
        ("GOES-19", "noaa-goes19"),
    ])
    def test_goes_buckets(self, name, bucket):
        cfg = get_satellite(name)
        assert cfg.bucket == bucket

    @pytest.mark.parametrize("name", ["GOES-16", "GOES-18", "GOES-19"])
    def test_goes_format(self, name):
        cfg = get_satellite(name)
        assert cfg.format == "netcdf"

    @pytest.mark.parametrize("name", ["GOES-16", "GOES-18", "GOES-19"])
    def test_goes_fetchable(self, name):
        cfg = get_satellite(name)
        assert cfg.fetchable is True

    def test_goes_bands(self):
        cfg = get_satellite("GOES-16")
        assert len(cfg.bands) == 17  # C01-C16 + GEOCOLOR
        for i in range(1, 17):
            assert f"C{i:02d}" in cfg.bands
        assert "GEOCOLOR" in cfg.bands

    def test_goes_sectors(self):
        cfg = get_satellite("GOES-16")
        assert set(cfg.sectors) == {"FullDisk", "CONUS", "Mesoscale1", "Mesoscale2"}

    def test_goes_sector_configs(self):
        cfg = get_satellite("GOES-16")
        fd = cfg.sectors["FullDisk"]
        assert isinstance(fd, SectorConfig)
        assert fd.product_prefix == "ABI-L2-CMIPF"
        assert fd.cadence_minutes == 10
        assert fd.cdn_available is True

        conus = cfg.sectors["CONUS"]
        assert conus.cadence_minutes == 5
        assert conus.cdn_available is True

        m1 = cfg.sectors["Mesoscale1"]
        assert m1.cadence_minutes == 1
        assert m1.cdn_available is False

    def test_goes_band_descriptions_complete(self):
        cfg = get_satellite("GOES-16")
        for band in cfg.bands:
            assert band in cfg.band_descriptions, f"Missing description for {band}"

    def test_goes_band_metadata_complete(self):
        cfg = get_satellite("GOES-16")
        for band in cfg.bands:
            assert band in cfg.band_metadata, f"Missing metadata for {band}"

    def test_goes_availability(self):
        cfg = get_satellite("GOES-19")
        assert cfg.availability["status"] == "active"
        assert cfg.availability["available_from"] == "2024-01-01"

        cfg16 = get_satellite("GOES-16")
        assert cfg16.availability["status"] == "historical"


class TestHimawariConfig:
    """Himawari-9 has correct configuration."""

    def test_himawari_bucket(self):
        cfg = get_satellite("Himawari-9")
        assert cfg.bucket == "noaa-himawari9"

    def test_himawari_format(self):
        cfg = get_satellite("Himawari-9")
        assert cfg.format == "hsd"

    def test_himawari_fetchable(self):
        cfg = get_satellite("Himawari-9")
        assert cfg.fetchable is True

    def test_himawari_bands(self):
        cfg = get_satellite("Himawari-9")
        assert len(cfg.bands) == 17  # B01-B16 + TrueColor
        for i in range(1, 17):
            assert f"B{i:02d}" in cfg.bands
        assert "TrueColor" in cfg.bands

    def test_himawari_sectors(self):
        cfg = get_satellite("Himawari-9")
        assert set(cfg.sectors) == {"FLDK", "Japan", "Target"}

    def test_himawari_sector_configs(self):
        cfg = get_satellite("Himawari-9")

        fldk = cfg.sectors["FLDK"]
        assert fldk.product_prefix == "AHI-L1b-FLDK"
        assert fldk.cadence_minutes == 10
        assert fldk.cdn_available is False

        japan = cfg.sectors["Japan"]
        assert japan.cadence_minutes == 2.5

        target = cfg.sectors["Target"]
        assert target.cadence_minutes == 2.5

    def test_himawari_band_descriptions_complete(self):
        cfg = get_satellite("Himawari-9")
        for band in cfg.bands:
            assert band in cfg.band_descriptions, f"Missing description for {band}"

    def test_himawari_band_metadata_complete(self):
        cfg = get_satellite("Himawari-9")
        for band in cfg.bands:
            assert band in cfg.band_metadata, f"Missing metadata for {band}"

    def test_himawari_availability(self):
        cfg = get_satellite("Himawari-9")
        assert cfg.availability["status"] == "active"
        assert cfg.availability["available_from"] == "2022-12-13"
        assert cfg.availability["available_to"] is None


class TestValidation:
    """Registry validation functions work correctly."""

    @pytest.mark.parametrize("name", ["GOES-16", "GOES-18", "GOES-19", "Himawari-9"])
    def test_validate_satellite_valid(self, name):
        validate_satellite(name)  # should not raise

    @pytest.mark.parametrize("bad", ["GOES-15", "Himawari-8", "", "goes-16"])
    def test_validate_satellite_invalid(self, bad):
        with pytest.raises(ValueError, match="Unknown satellite"):
            validate_satellite(bad)

    def test_validate_sector_goes(self):
        for sector in ["FullDisk", "CONUS", "Mesoscale1", "Mesoscale2"]:
            validate_sector("GOES-16", sector)

    def test_validate_sector_himawari(self):
        for sector in ["FLDK", "Japan", "Target"]:
            validate_sector("Himawari-9", sector)

    def test_validate_sector_cross_satellite_rejected(self):
        with pytest.raises(ValueError, match="Unknown sector"):
            validate_sector("GOES-16", "FLDK")
        with pytest.raises(ValueError, match="Unknown sector"):
            validate_sector("Himawari-9", "CONUS")

    def test_validate_band_goes(self):
        for i in range(1, 17):
            validate_band("GOES-16", f"C{i:02d}")
        validate_band("GOES-16", "GEOCOLOR")

    def test_validate_band_himawari(self):
        for i in range(1, 17):
            validate_band("Himawari-9", f"B{i:02d}")
        validate_band("Himawari-9", "TrueColor")

    def test_validate_band_cross_satellite_rejected(self):
        with pytest.raises(ValueError, match="Unknown band"):
            validate_band("GOES-16", "B01")
        with pytest.raises(ValueError, match="Unknown band"):
            validate_band("Himawari-9", "C01")


class TestLookupFunctions:
    """Aggregate lookup functions return correct sets."""

    def test_get_all_valid_satellites(self):
        sats = get_all_valid_satellites()
        assert sats == {"GOES-16", "GOES-18", "GOES-19", "Himawari-9"}

    def test_get_all_valid_sectors(self):
        sectors = get_all_valid_sectors()
        # GOES sectors
        assert "FullDisk" in sectors
        assert "CONUS" in sectors
        assert "Mesoscale1" in sectors
        assert "Mesoscale2" in sectors
        # Himawari sectors
        assert "FLDK" in sectors
        assert "Japan" in sectors
        assert "Target" in sectors

    def test_get_all_valid_bands(self):
        bands = get_all_valid_bands()
        # GOES bands
        assert "C01" in bands
        assert "C16" in bands
        assert "GEOCOLOR" in bands
        # Himawari bands
        assert "B01" in bands
        assert "B16" in bands
        assert "TrueColor" in bands

    def test_get_satellite_unknown_raises_keyerror(self):
        with pytest.raises(KeyError, match="Unknown satellite"):
            get_satellite("NotASat")
