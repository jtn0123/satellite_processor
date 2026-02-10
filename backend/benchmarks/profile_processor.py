"""
Processor Performance Profiling
-------------------------------
Benchmarks core satellite image processing operations across various image sizes.

Run standalone:
    cd backend && python -m benchmarks.profile_processor
"""

import cProfile
import io
import os
import pstats
import sys
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Sizes representative of real GOES imagery
TEST_SIZES = [
    (1024, 1024),
    (2048, 2048),
    (5424, 5424),
]


# ---------------------------------------------------------------------------
# Synthetic test-image generation
# ---------------------------------------------------------------------------

def generate_test_image(width: int, height: int, tmp_dir: Path) -> Path:
    """Create a synthetic GOES-like PNG with gradient + noise."""
    arr = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    # Add a gradient to mimic Earth-disk imagery
    grad = np.linspace(0, 255, width, dtype=np.uint8)
    arr[:, :, 1] = (arr[:, :, 1].astype(np.uint16) + grad) // 2
    path = tmp_dir / f"synthetic_{width}x{height}.png"
    cv2.imwrite(str(path), arr)
    return path


# ---------------------------------------------------------------------------
# Individual operation benchmarks
# ---------------------------------------------------------------------------

def bench_crop(img: np.ndarray) -> np.ndarray:
    """Crop center 50 %."""
    h, w = img.shape[:2]
    y0, x0 = h // 4, w // 4
    return img[y0 : y0 + h // 2, x0 : x0 + w // 2].copy()


def bench_false_color(img: np.ndarray) -> np.ndarray:
    """Simple false-color remap (swap channels + apply colormap on luma)."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.applyColorMap(gray, cv2.COLORMAP_INFERNO)


def bench_timestamp_overlay(img: np.ndarray) -> np.ndarray:
    """Burn a timestamp string onto the image via PIL."""
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb)
    draw = ImageDraw.Draw(pil_img)
    text = "2026-02-10T16:00:00Z"
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
    except OSError:
        font = ImageFont.load_default()
    draw.text((10, 10), text, fill=(255, 255, 0), font=font)
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


def bench_file_discovery(directory: Path) -> list:
    """Simulate discovering image files in a directory tree."""
    return sorted(directory.rglob("*.png"))


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def _time_op(name: str, fn, *args):
    """Run *fn* with perf_counter timing, return (name, duration_s, result)."""
    start = time.perf_counter()
    result = fn(*args)
    elapsed = time.perf_counter() - start
    return name, elapsed, result


def run_benchmarks():
    tmp_dir = Path(tempfile.mkdtemp(prefix="sat_bench_"))
    print(f"Temp directory: {tmp_dir}\n")

    results: list[tuple[str, str, float]] = []

    # Generate images
    for w, h in TEST_SIZES:
        label = f"{w}x{h}"
        print(f"Generating {label} test image …")
        img_path = generate_test_image(w, h, tmp_dir)
        img = cv2.imread(str(img_path))

        for op_name, fn in [
            ("crop", bench_crop),
            ("false_color", bench_false_color),
            ("timestamp_overlay", bench_timestamp_overlay),
        ]:
            _, elapsed, _ = _time_op(op_name, fn, img)
            results.append((label, op_name, elapsed))

    # File discovery benchmark (across all generated files)
    _, elapsed, _ = _time_op("file_discovery", bench_file_discovery, tmp_dir)
    results.append(("all", "file_discovery", elapsed))

    # -----------------------------------------------------------------------
    # cProfile for the full pipeline on the largest image
    # -----------------------------------------------------------------------
    largest = cv2.imread(str(tmp_dir / f"synthetic_{TEST_SIZES[-1][0]}x{TEST_SIZES[-1][1]}.png"))
    prof = cProfile.Profile()
    prof.enable()
    bench_crop(largest)
    bench_false_color(largest)
    bench_timestamp_overlay(largest)
    prof.disable()

    # -----------------------------------------------------------------------
    # Output summary table
    # -----------------------------------------------------------------------
    print("\n" + "=" * 60)
    print(f"{'Size':<14} {'Operation':<22} {'Time (ms)':>10}")
    print("-" * 60)
    for size_label, op, dur in results:
        print(f"{size_label:<14} {op:<22} {dur * 1000:>10.2f}")
    print("=" * 60)

    print("\ncProfile top-20 for full pipeline on largest image:")
    stream = io.StringIO()
    ps = pstats.Stats(prof, stream=stream).sort_stats("cumulative")
    ps.print_stats(20)
    print(stream.getvalue())

    # Cleanup
    import shutil
    shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    run_benchmarks()
