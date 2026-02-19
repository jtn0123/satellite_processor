"""Celery task for generating animations from GOES frames."""
from __future__ import annotations

import logging
import math
import shutil
import subprocess
from pathlib import Path

from ..celery_app import celery_app
from ..config import settings
from ..utils import utcnow
from .helpers import _get_sync_db, _publish_progress, _update_job_db

logger = logging.getLogger(__name__)

QUALITY_CRF = {"low": "28", "medium": "23", "high": "18"}
PREVIEW_MAX_WIDTH = 1024


def _apply_overlay(img, frame, overlay: dict, label_text: str):
    """Burn text overlay onto a frame image using PIL."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    pil_img = Image.fromarray(img[:, :, ::-1])  # BGR -> RGB
    draw = ImageDraw.Draw(pil_img)

    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    except OSError:
        font = ImageFont.load_default()

    y_pos = 10

    if overlay.get("label") and label_text:
        draw.text((10, y_pos), label_text, fill=(255, 255, 255), font=font,
                  stroke_width=2, stroke_fill=(0, 0, 0))
        y_pos += 30

    if overlay.get("timestamp") and frame.capture_time:
        ts_text = frame.capture_time.strftime("%Y-%m-%d %H:%M UTC")
        draw.text((10, y_pos), ts_text, fill=(255, 255, 255), font=font,
                  stroke_width=2, stroke_fill=(0, 0, 0))

    result = np.array(pil_img)[:, :, ::-1]  # RGB -> BGR
    return result


def _apply_loop_style(frames, loop_style: str, fps: int) -> list:
    """Apply loop style (pingpong/hold) to the frame list."""
    if not frames:
        return frames
    if loop_style == "pingpong":
        return list(frames) + list(reversed(frames[1:-1]))
    if loop_style == "hold":
        hold_count = fps * 2
        return list(frames) + [frames[-1]] * hold_count
    return list(frames)


def _build_overlay_label(overlay: dict | None, frames) -> str:
    """Build the overlay label text from the first frame."""
    if not (overlay and overlay.get("label") and frames):
        return ""
    f0 = frames[0]
    return f"{f0.satellite} {f0.sector} Band {f0.band.replace('C', '')}"


def _process_single_frame(img, crop, resolution: str, scale: str):
    """Apply crop, resolution, and scale transforms to a single frame image."""
    import cv2

    if crop:
        img = img[crop.y:crop.y + crop.height, crop.x:crop.x + crop.width]

    if resolution == "preview":
        h, w = img.shape[:2]
        if w > PREVIEW_MAX_WIDTH:
            ratio = PREVIEW_MAX_WIDTH / w
            img = cv2.resize(img, (PREVIEW_MAX_WIDTH, int(h * ratio)), interpolation=cv2.INTER_AREA)

    if scale and scale != "100%":
        pct = int(scale.replace("%", "")) / 100.0
        if not math.isclose(pct, 1.0) and pct > 0:
            new_w = int(img.shape[1] * pct)
            new_h = int(img.shape[0] * pct)
            interp = cv2.INTER_AREA if pct < 1 else cv2.INTER_CUBIC
            img = cv2.resize(img, (new_w, new_h), interpolation=interp)

    return img


def _render_frames_to_dir(frames, work_dir: Path, job_id: str, crop, resolution: str,
                          scale: str, overlay: dict | None, label_text: str):
    """Read, transform, and write all frames to the working directory."""
    import cv2

    output_idx = 0
    for i, frame in enumerate(frames):
        src = Path(frame.file_path)
        if not src.exists():
            logger.warning("Frame file missing: %s", src)
            continue

        img = cv2.imread(str(src))
        if img is None:
            continue

        img = _process_single_frame(img, crop, resolution, scale)

        if overlay and (overlay.get("timestamp") or overlay.get("label")):
            img = _apply_overlay(img, frame, overlay, label_text)

        dest = work_dir / f"frame{output_idx:06d}.png"
        cv2.imwrite(str(dest), img)
        output_idx += 1

        pct_done = 10 + int((i + 1) / len(frames) * 60)
        if (i + 1) % max(1, len(frames) // 20) == 0:
            _publish_progress(job_id, pct_done,
                              f"Processed frame {i + 1}/{len(frames)}", "processing")
            _update_job_db(job_id, progress=pct_done,
                           status_message=f"Processed frame {i + 1}/{len(frames)}")

    return output_idx


def _encode_output(fmt: str, fps: int, quality: str, work_dir: Path, output_path: Path):
    """Encode frames into GIF or MP4 using FFmpeg."""
    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    input_pattern = str(work_dir / "frame%06d.png")

    if fmt == "gif":
        palette = str(work_dir / "palette.png")
        cmd1 = [ffmpeg, "-y", "-framerate", str(fps), "-i", input_pattern,
                 "-vf", "palettegen", palette]
        _run_ffmpeg(cmd1)
        cmd2 = [ffmpeg, "-y", "-framerate", str(fps), "-i", input_pattern,
                 "-i", palette, "-lavfi", "paletteuse", str(output_path)]
        _run_ffmpeg(cmd2)
    else:
        crf = QUALITY_CRF.get(quality, "23")
        cmd = [
            ffmpeg, "-y", "-framerate", str(fps), "-i", input_pattern,
            "-c:v", "libx264", "-crf", crf, "-preset", "medium",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(output_path),
        ]
        _run_ffmpeg(cmd)


def _run_ffmpeg(cmd: list[str]):
    """Run an FFmpeg command, capturing stderr for error reporting."""
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")
        logger.error("FFmpeg failed (rc=%d): %s", result.returncode, stderr)
        raise subprocess.CalledProcessError(result.returncode, cmd, output=result.stdout, stderr=result.stderr)


def _mark_animation_failed(session, animation_id: str, error: str):
    """Mark the animation record as failed in the database."""
    from ..db.models import Animation
    try:
        logger.error("Marking animation %s as failed: %s", animation_id, error)
        anim = session.query(Animation).filter(Animation.id == animation_id).first()
        if anim:
            anim.status = "failed"
            anim.error = error
            anim.completed_at = utcnow()
            session.commit()
    except Exception:
        logger.exception("Failed to mark animation %s as failed", animation_id)


@celery_app.task(bind=True, name="generate_animation")
def generate_animation(self, job_id: str, animation_id: str):
    """Generate an animation (MP4/GIF) from selected GOES frames."""
    from ..db.models import Animation, CropPreset, GoesFrame, Job

    logger.info("Starting animation job %s (anim %s)", job_id, animation_id)
    _update_job_db(job_id, status="processing", started_at=utcnow(),
                   status_message="Preparing animation...")
    _publish_progress(job_id, 0, "Preparing animation...", "processing")

    session = _get_sync_db()
    try:
        anim = session.query(Animation).filter(Animation.id == animation_id).first()
        if not anim:
            raise RuntimeError(f"Animation {animation_id} not found")

        job_record = session.query(Job).filter_by(id=job_id).first()
        params = job_record.params if job_record else {}

        frame_ids = params.get("frame_ids", [])
        fps = params.get("fps", 10)
        fmt = params.get("format", "mp4")
        quality = params.get("quality", "medium")
        resolution = params.get("resolution", "full")
        loop_style = params.get("loop_style", "forward")
        overlay = params.get("overlay")
        crop_preset_id = params.get("crop_preset_id")
        scale = params.get("scale", "100%")

        frames = (
            session.query(GoesFrame)
            .filter(GoesFrame.id.in_(frame_ids))
            .order_by(GoesFrame.capture_time.asc())
            .all()
        )
        if not frames:
            raise RuntimeError("No frames found")

        frames = _apply_loop_style(frames, loop_style, fps)

        anim.status = "processing"
        anim.frame_count = len(frames)
        session.commit()

        crop = None
        if crop_preset_id:
            crop = session.query(CropPreset).filter(CropPreset.id == crop_preset_id).first()

        label_text = _build_overlay_label(overlay, frames)

        work_dir = Path(settings.output_dir) / f"anim_{animation_id}"
        work_dir.mkdir(parents=True, exist_ok=True)

        _publish_progress(job_id, 10, "Processing frames...", "processing")
        _render_frames_to_dir(frames, work_dir, job_id, crop, resolution, scale, overlay, label_text)

        _publish_progress(job_id, 75, "Encoding video...", "processing")

        ext = "gif" if fmt == "gif" else "mp4"
        output_path = Path(settings.output_dir) / f"animation_{animation_id}.{ext}"
        _encode_output(fmt, fps, quality, work_dir, output_path)

        file_size = output_path.stat().st_size if output_path.exists() else 0
        duration_seconds = len(frames) / fps if fps > 0 else 0

        anim.status = "completed"
        anim.output_path = str(output_path)
        anim.file_size = file_size
        anim.duration_seconds = round(duration_seconds, 1)
        anim.completed_at = utcnow()
        session.commit()

        _update_job_db(
            job_id, status="completed", progress=100,
            output_path=str(output_path),
            completed_at=utcnow(),
            status_message=f"Animation complete: {len(frames)} frames, {duration_seconds:.1f}s",
        )
        _publish_progress(job_id, 100,
                          f"Animation complete: {len(frames)} frames", "completed")

    except Exception as e:
        logger.exception("Animation job %s failed", job_id)
        session.rollback()
        _mark_animation_failed(session, animation_id, str(e))
        _update_job_db(
            job_id, status="failed", error=str(e),
            completed_at=utcnow(), status_message=f"Error: {e}",
        )
        _publish_progress(job_id, 0, f"Error: {e}", "failed")
        raise
    finally:
        session.close()
        if work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)
