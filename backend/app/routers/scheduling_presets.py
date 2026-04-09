"""Default fetch preset definitions.

The preset CRUD endpoints live in scheduling.py (which is the registered
router). This module only holds the constant data imported by
scheduling.py and main.py.

JTN-474 ISSUE-058: previously this list contained exactly one preset, so
``POST /api/satellite/fetch-presets/seed-defaults`` returned
``{"seeded":[],"total":0}`` after the first call and gave the impression
the endpoint was broken. The list below covers the common starter
presets a new user actually wants.
"""

DEFAULT_FETCH_PRESETS = [
    {
        "name": "GOES-19 CONUS True Color (C02)",
        "satellite": "GOES-19",
        "sector": "CONUS",
        "band": "C02",
        "description": "GOES-East CONUS red visible — the canonical daytime view",
    },
    {
        "name": "GOES-19 CONUS Clean IR (C13)",
        "satellite": "GOES-19",
        "sector": "CONUS",
        "band": "C13",
        "description": "GOES-East CONUS clean longwave IR — clouds & SST, works at night",
    },
    {
        "name": "GOES-19 Full Disk Red (C02)",
        "satellite": "GOES-19",
        "sector": "FullDisk",
        "band": "C02",
        "description": "GOES-East full-disk red visible, 10-minute cadence",
    },
    {
        "name": "GOES-18 CONUS Red (C02)",
        "satellite": "GOES-18",
        "sector": "CONUS",
        "band": "C02",
        "description": "GOES-West CONUS red visible",
    },
    {
        "name": "GOES-18 Full Disk Clean IR (C13)",
        "satellite": "GOES-18",
        "sector": "FullDisk",
        "band": "C13",
        "description": "GOES-West full-disk clean longwave IR",
    },
    {
        "name": "Himawari FLDK True Color",
        "satellite": "Himawari-9",
        "sector": "FLDK",
        "band": "TrueColor",
        "description": "Full disk true color composite",
    },
    {
        "name": "Himawari FLDK Red (B03)",
        "satellite": "Himawari-9",
        "sector": "FLDK",
        "band": "B03",
        "description": "Himawari-9 full disk red visible (0.64µm)",
    },
    {
        "name": "Himawari FLDK Clean IR (B13)",
        "satellite": "Himawari-9",
        "sector": "FLDK",
        "band": "B13",
        "description": "Himawari-9 full disk clean IR longwave (10.4µm)",
    },
]
