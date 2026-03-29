"""Default fetch preset definitions.

The preset CRUD endpoints live in scheduling.py (which is the registered router).
This module only holds the constant data imported by scheduling.py and main.py.
"""

DEFAULT_FETCH_PRESETS = [
    {
        "name": "Himawari FLDK True Color",
        "satellite": "Himawari-9",
        "sector": "FLDK",
        "band": "TrueColor",
        "description": "Full disk true color composite",
    },
]
