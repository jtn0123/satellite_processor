"""Shared constants and utilities for GOES router modules."""

import atexit
from concurrent.futures import ThreadPoolExecutor

# Bug #18: Dedicated thread pool for S3 operations
_s3_executor = ThreadPoolExecutor(max_workers=4)
atexit.register(_s3_executor.shutdown, wait=False)

BAND_DESCRIPTIONS = {
    "C01": "Blue (0.47µm)", "C02": "Red (0.64µm)", "C03": "Veggie (0.86µm)",
    "C04": "Cirrus (1.37µm)", "C05": "Snow/Ice (1.61µm)", "C06": "Cloud Particle (2.24µm)",
    "C07": "Shortwave IR (3.9µm)", "C08": "Upper-level WV (6.2µm)",
    "C09": "Mid-level WV (6.9µm)", "C10": "Lower-level WV (7.3µm)",
    "C11": "Cloud-top Phase (8.4µm)", "C12": "Ozone (9.6µm)",
    "C13": "Clean IR (10.3µm)", "C14": "IR (11.2µm)",
    "C15": "Dirty IR (12.3µm)", "C16": "CO2 (13.3µm)",
    "GEOCOLOR": "GeoColor (True Color Day, IR Night)",
}

BAND_METADATA = {
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

SECTOR_DISPLAY_NAMES = {
    "FullDisk": "Full Disk",
    "CONUS": "CONUS",
    "Mesoscale1": "Mesoscale 1",
    "Mesoscale2": "Mesoscale 2",
}

SECTOR_FILE_SIZES_KB = {
    "FullDisk": 12000,
    "CONUS": 4000,
    "Mesoscale1": 500,
    "Mesoscale2": 500,
}

COMPOSITE_RECIPES = {
    "true_color": {"name": "True Color", "bands": ["C02", "C03", "C01"]},
    "natural_color": {"name": "Natural Color", "bands": ["C07", "C06", "C02"]},
    "fire_detection": {"name": "Fire Detection", "bands": ["C07", "C06", "C02"]},
    "dust_ash": {"name": "Dust/Ash", "bands": ["C15", "C14", "C13", "C11"]},
    "day_cloud_phase": {"name": "Day Cloud Phase", "bands": ["C13", "C02", "C05"]},
    "airmass": {"name": "Airmass", "bands": ["C08", "C10", "C12", "C13"]},
}
