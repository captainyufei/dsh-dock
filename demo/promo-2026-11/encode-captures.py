#!/usr/bin/env python3
"""Encode timestamped, unmodified UI captures as constant-frame-rate clips."""

import argparse
import bisect
import json
import math
import shutil
import struct
import subprocess
import tempfile
import zlib
from fractions import Fraction
from pathlib import Path


DEMO_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = DEMO_DIR / "output" / "promo-0.3.17"


def executable(name):
    found = shutil.which(name)
    fallback = Path("/opt/homebrew/bin") / name
    if found:
        return found
    if fallback.is_file():
        return str(fallback)
    raise ValueError(f"Cannot find {name}. Install it or add it to PATH.")


def run(command):
    return subprocess.run(command, check=True, capture_output=True, text=True)


def inspect_media(ffprobe, path, count_frames=False):
    command = [ffprobe, "-v", "error", "-select_streams", "v:0"]
    if count_frames:
        command.append("-count_frames")
    command.extend([
        "-show_entries",
        "stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration:format=duration",
        "-of", "json", str(path),
    ])
    return json.loads(run(command).stdout)


def load_capture(directory, fps):
    capture = json.loads((directory / "capture.json").read_text())
    if capture.get("error"):
        raise ValueError(f"{directory.name} recorded an action error: {capture['error']}")
    duration = float(capture["duration"])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError(f"{directory.name} has an invalid duration.")
    frame_count = round(duration * fps)
    if frame_count < 1 or abs(frame_count / fps - duration) > 0.000001:
        raise ValueError(f"{directory.name} duration must align with the {fps}fps frame grid.")

    frames = []
    for frame in capture["frames"]:
        timestamp = float(frame["time"])
        if not math.isfinite(timestamp):
            raise ValueError(f"{directory.name} has a non-finite frame timestamp.")
        source = (directory / frame["file"]).resolve()
        if not source.is_relative_to(directory.resolve()) or not source.is_file():
            raise ValueError(f"Missing or out-of-directory capture frame {frame['file']!r}.")
        frames.append((max(0.0, min(duration, timestamp)), source))
    frames.sort(key=lambda frame: frame[0])
    if not frames:
        raise ValueError(f"{directory.name} contains no captured frames.")

    # Stable sorting retains capture order when timestamps match. The final
    # capture at a duplicate timestamp is the one visible at that instant.
    unique = {}
    for timestamp, source in frames:
        unique[timestamp] = source
    frames = list(unique.items())
    if frames[0][0] > 0:
        frames.insert(0, (0.0, frames[0][1]))
    return capture, duration, frame_count, frames


def concat_quote(path):
    return "'" + str(path).replace("'", "'\\''") + "'"


def write_concat(path, frames, frame_count, fps):
    timestamps = [timestamp for timestamp, _ in frames]
    lines = ["ffconcat version 1.0"]
    last_source = None
    for index in range(frame_count):
        source_index = bisect.bisect_right(timestamps, index / fps) - 1
        source = frames[max(0, source_index)][1]
        lines.extend([
            "file " + concat_quote(source),
            f"option framerate {fps}",
            f"duration {1 / fps:.12f}",
        ])
        last_source = source
    # The concat demuxer needs a following entry to honor the last duration.
    # -frames:v excludes this sentinel from the final CFR output.
    lines.extend(["file " + concat_quote(last_source), f"option framerate {fps}"])
    path.write_text("\n".join(lines) + "\n")


def write_click_ring(path):
    size = 64
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            distance = math.hypot(x - 31.5, y - 31.5)
            alpha = 210 if 18 <= distance <= 21 else 0
            row.extend((52, 112, 255, alpha))
        rows.append(row)

    def chunk(kind, data):
        checksum = zlib.crc32(kind + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", checksum)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(b"".join(rows)))
        + chunk(b"IEND", b"")
    )


def click_events(capture, width, height, duration):
    clicks = []
    for event in capture.get("events", []):
        point = event.get("point")
        if not isinstance(point, list) or len(point) != 2:
            continue
        x, y = map(float, point)
        timestamp = float(event["time"])
        finite = all(map(math.isfinite, (x, y, timestamp)))
        in_frame = 0 <= x < width and 0 <= y < height
        in_clip = 0 <= timestamp < duration
        if finite and in_frame and in_clip:
            clicks.append((x, y, timestamp))
    return clicks


def click_filter(clicks):
    labels = "".join(f"[ring{index}]" for index in range(len(clicks)))
    filters = [f"[1:v]format=rgba,split={len(clicks)}{labels}"]
    previous = "0:v"
    for index, (x, y, timestamp) in enumerate(clicks):
        output = f"marked{index}"
        filters.append(
            f"[{previous}][ring{index}]overlay=x={x - 32:.3f}:y={y - 32:.3f}"
            f":enable='between(t,{timestamp:.6f},{timestamp + 0.4:.6f})'[{output}]"
        )
        previous = output
    return ";".join(filters), previous


def encode(directory, output_dir, ffmpeg, ffprobe, fps, show_clicks):
    capture, duration, frame_count, frames = load_capture(directory, fps)
    source_stream = inspect_media(ffprobe, frames[0][1])["streams"][0]
    width, height = source_stream["width"], source_stream["height"]
    if width % 2 or height % 2:
        raise ValueError("H.264 yuv420p requires even source dimensions.")
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / (directory.name + ".mp4")
    clicks = click_events(capture, width, height, duration) if show_clicks else []

    with tempfile.TemporaryDirectory(prefix="dock-capture-encode-") as temporary:
        temporary = Path(temporary)
        concat = temporary / "frames.ffconcat"
        write_concat(concat, frames, frame_count, fps)
        command = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-safe", "0", "-f", "concat", "-i", str(concat),
        ]
        if clicks:
            ring = temporary / "click-ring.png"
            write_click_ring(ring)
            graph, output_label = click_filter(clicks)
            command.extend([
                "-loop", "1", "-framerate", str(fps), "-i", str(ring),
                "-filter_complex", graph, "-map", f"[{output_label}]",
            ])
        else:
            command.extend(["-map", "0:v:0"])
        command.extend([
            "-an", "-r", str(fps), "-fps_mode", "cfr", "-frames:v", str(frame_count),
            "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", str(output),
        ])
        try:
            run(command)
        except subprocess.CalledProcessError as error:
            raise ValueError(error.stderr.strip()) from error

    probe = inspect_media(ffprobe, output, count_frames=True)
    stream = probe["streams"][0]
    actual_frames = int(stream["nb_read_frames"])
    actual_duration = float(probe["format"]["duration"])
    actual_fps = Fraction(stream["avg_frame_rate"])
    if actual_frames != frame_count or abs(actual_duration - duration) > 0.001:
        raise ValueError(f"Unexpected output timing for {output.name}: {actual_frames} frames, {actual_duration}s.")
    if actual_fps != fps or (stream["width"], stream["height"]) != (width, height):
        raise ValueError(f"Unexpected output frame rate or dimensions for {output.name}.")
    report = {
        "file": str(output), "width": width, "height": height,
        "fps": fps, "frames": actual_frames, "duration": actual_duration,
        "sourceFrames": len(capture["frames"]), "clickRings": len(clicks),
    }
    print(json.dumps(report, ensure_ascii=False))


def make_contacts(clips, output, ffmpeg, ffprobe):
    """Make one review sheet with 1s, 5s and 9s samples for each clip."""
    from PIL import Image, ImageDraw, ImageFont

    font_path = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
    font = ImageFont.truetype(str(font_path), 18)
    sheet = Image.new("RGB", (1440, 300 * len(clips)), "#eef0f5")
    draw = ImageDraw.Draw(sheet)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="dock-capture-contacts-") as temporary:
        temporary = Path(temporary)
        for row, clip in enumerate(clips):
            probe = inspect_media(ffprobe, clip)
            duration = float(probe["format"]["duration"])
            fps = float(Fraction(probe["streams"][0]["avg_frame_rate"]))
            times = [min(time, max(0, duration - 1 / fps)) for time in (1, 5, 9)]
            for column, time in enumerate(times):
                frame = temporary / f"{row}-{column}.png"
                run([
                    ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                    "-ss", str(time), "-i", str(clip), "-vf", "scale=480:270",
                    "-frames:v", "1", str(frame),
                ])
                x, y = column * 480, row * 300
                draw.text((x + 10, y + 6), f"{clip.stem}   {time:g}s", fill="#202633", font=font)
                with Image.open(frame) as source:
                    sheet.paste(source, (x, y + 30))
    sheet.save(output, quality=92)
    print(json.dumps({"contacts": str(output), "clips": len(clips), "sampleSeconds": [1, 5, 9]}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("names", nargs="*", help="Capture directory names. Omit to encode every capture.json under --raw-dir.")
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_OUTPUT / "raw")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT / "clips")
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--ffmpeg", default=None)
    parser.add_argument("--ffprobe", default=None)
    parser.add_argument("--contacts", action="store_true", help="Only create contacts.jpg from encoded clips, sampling 1s, 5s and 9s.")
    parser.add_argument(
        "--show-pointer", "--click-rings", dest="show_clicks", action="store_true",
        help="Show a brief ring at recorded click coordinates. No inferred cursor paths.",
    )
    args = parser.parse_args()
    if not 1 <= args.fps <= 120:
        parser.error("--fps must be between 1 and 120.")
    raw_dir = args.raw_dir.resolve()
    output_dir = args.output_dir.resolve()
    ffmpeg = args.ffmpeg or executable("ffmpeg")
    ffprobe = args.ffprobe or executable("ffprobe")
    if args.contacts:
        clips = [output_dir / (name + ".mp4") for name in args.names]
        if not args.names:
            clips = sorted(output_dir.glob("*.mp4"))
        if not clips or any(not clip.is_file() for clip in clips):
            parser.error("Contact sheet input clips are missing.")
        make_contacts(clips, output_dir / "contacts.jpg", ffmpeg, ffprobe)
        return
    if args.names:
        directories = [raw_dir / name for name in args.names]
    else:
        directories = sorted(path.parent for path in raw_dir.glob("*/capture.json"))
    if not directories:
        parser.error("No capture.json files found.")
    try:
        for directory in directories:
            if directory.parent != raw_dir:
                raise ValueError("Capture names must be direct children of --raw-dir.")
            encode(directory, output_dir, ffmpeg, ffprobe, args.fps, args.show_clicks)
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Capture encoding failed: {error}\n")


if __name__ == "__main__":
    main()
