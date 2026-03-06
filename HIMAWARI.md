# Himawari-9 Support

## Overview

Satellite Processor supports Himawari-9 (AHI) imagery from NOAA's public S3 bucket. Himawari-9 is operated by JMA (Japan Meteorological Agency) and positioned at 140.7°E, covering East Asia, Australia, and the Western/Central Pacific.

## Supported Data

- **Sectors:** Full Disk (FLDK), Japan, Target
- **Bands:** B01-B16 (all AHI bands)
- **Composite:** True Color (B03/B02/B01 RGB)
- **Cadence:** 10-minute observations (FLDK), 2.5-minute (Japan/Target)

## Data Source

- **Bucket:** `noaa-himawari9` (public, no auth required)
- **Path:** `AHI-L1b-FLDK/YYYY/MM/DD/HHMM/`
- **Format:** HSD binary (.DAT.bz2), 10 segments per band

## Band Reference

| Band | Wavelength | Name | Category |
|------|-----------|------|----------|
| B01 | 0.47 µm | Visible Blue | Visible |
| B02 | 0.51 µm | Visible Green | Visible |
| B03 | 0.64 µm | Visible Red | Visible |
| B04 | 0.86 µm | Near-IR Veggie | Near-IR |
| B05 | 1.6 µm | Snow/Ice | Near-IR |
| B06 | 2.3 µm | Cloud Particle | Near-IR |
| B07 | 3.9 µm | Shortwave IR | IR |
| B08 | 6.2 µm | Upper Water Vapor | IR |
| B09 | 6.9 µm | Mid Water Vapor | IR |
| B10 | 7.3 µm | Lower Water Vapor | IR |
| B11 | 8.6 µm | Cloud-Top Phase | IR |
| B12 | 9.6 µm | Ozone | IR |
| B13 | 10.4 µm | Clean IR Longwave | IR |
| B14 | 11.2 µm | IR Longwave | IR |
| B15 | 12.4 µm | Dirty Longwave | IR |
| B16 | 13.3 µm | CO₂ Longwave | IR |

## Getting Started

1. Navigate to the **Fetch** tab
2. Select satellite: **Himawari-9**
3. Choose sector (FLDK recommended) and band (TrueColor for composites)
4. Set time range and fetch
5. View in **Live** or **Browse** tabs

## Architecture

- Custom lightweight HSD parser (no satpy dependency)
- 10 segments downloaded in parallel, assembled into full-resolution image → PNG
- Same `goes_frames` table, `satellite="Himawari-9"` field
- Per-satellite cleanup rules supported

## GOES vs Himawari Comparison

| Feature | GOES (ABI) | Himawari (AHI) |
|---------|-----------|----------------|
| Satellites | GOES-16, 18, 19 | Himawari-9 |
| Data format | NetCDF4 (.nc) | HSD binary (.DAT.bz2) |
| S3 bucket | `noaa-goes16/18/19` | `noaa-himawari9` |
| Sectors | FullDisk, CONUS, Meso1/2 | FLDK, Japan, Target |
| Full disk cadence | 10 min | 10 min |
| Regional cadence | CONUS 5min, Meso 1min | Japan 2.5min, Target 2.5min |
| Files per band | 1 file | 10 segments (stitched) |
| True color | Pre-made GEOCOLOR (CDN) | Composite B03+B02+B01 |
| CDN images | Yes (NOAA CDN) | **No** — must process from raw |

## Notes

- No CDN for Himawari — all images require the fetch pipeline (~30-60s per image)
- Schedule auto-fetch via Presets for continuous updates
- `/api/goes/*` paths still work (backward-compat redirect to `/api/satellite/*`)
- Himawari has a real green band (B02 at 0.51µm) — True Color composites are straightforward RGB, no synthetic green needed
