"""Verify exported dimensions, timing, decode, font coverage and GIF budgets."""

from fractions import Fraction
import hashlib
import json
from pathlib import Path
import subprocess

from PIL import Image

BASE = Path(__file__).resolve().parent


def probe(path):
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path),
    ], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def file_info(path):
    subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(path), "-f", "null", "-"], check=True)
    return {"file": path.name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def verify():
    manifest = json.loads((BASE / "manifest.json").read_text())
    schedule = json.loads((BASE / "schedule.json").read_text())
    build = json.loads((BASE / "build-report.json").read_text())
    output = (BASE / manifest["outputDirectory"]).resolve()
    film = output / f"deepseek-dock-{manifest['version']}.mp4"
    media = probe(film)
    video = next(stream for stream in media["streams"] if stream["codec_type"] == "video")
    audio = next(stream for stream in media["streams"] if stream["codec_type"] == "audio")
    duration = float(media["format"]["duration"])
    assert (video["width"], video["height"]) == (manifest["width"], manifest["height"]), "Film dimensions differ."
    assert float(Fraction(video["avg_frame_rate"])) == manifest["fps"], "Film frame rate differs."
    assert abs(duration - schedule["durationSeconds"]) <= 0.1, "Film duration differs."
    assert audio["channels"] == 2, "The film needs stereo music."
    assert build["font"]["allVisibleCharactersCovered"], "Some visible copy is missing from the font."
    film_report = {**file_info(film), "durationSeconds": duration, "width": video["width"], "height": video["height"]}
    gifs = []
    for number, chapter in enumerate(manifest["chapters"], start=1):
        path = output / f"{number:02d}-{chapter['id']}.gif"
        with Image.open(path) as image:
            assert image.size == (manifest["gif"]["width"], round(manifest["gif"]["width"] * 9 / 16)), f"GIF dimensions differ for {path.name}."
            assert image.info.get("loop") == 0, f"GIF must loop for {path.name}."
            assert image.n_frames > 1, f"GIF is static for {path.name}."
            total_ms = 0
            for index in range(image.n_frames):
                image.seek(index)
                total_ms += image.info["duration"]
            assert abs(total_ms / 1000 - chapter["durationSeconds"]) < 0.1, f"GIF duration differs for {path.name}."
            assert image.n_frames <= chapter["durationSeconds"] * manifest["gif"]["fps"] + 1, f"GIF has too many frames for {path.name}."
            frames = image.n_frames
        gifs.append({
            **file_info(path), "durationSeconds": total_ms / 1000, "frames": frames,
            "withinTargetSize": path.stat().st_size <= manifest["gif"]["targetMaximumBytes"],
        })
    report = {"passed": True, "film": film_report, "gifs": gifs, "font": build["font"]}
    (output / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    verify()
