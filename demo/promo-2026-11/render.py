"""Render the HyperFrames film and export one clear UI GIF per chapter."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

BASE = Path(__file__).resolve().parent


def run_logged(command, destination):
    with destination.open("w") as log:
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)


def render(args):
    manifest = json.loads((BASE / "manifest.json").read_text())
    schedule = json.loads((BASE / "schedule.json").read_text())
    build = json.loads((BASE / "build-report.json").read_text())
    if build["manifestSha256"] != hashlib.sha256((BASE / "manifest.json").read_bytes()).hexdigest():
        raise ValueError("The manifest changed. Run build.py before rendering.")
    if build["compositionOnly"]:
        raise ValueError("Run build.py with all recordings before rendering.")
    if not build["font"]["allVisibleCharactersCovered"]:
        raise ValueError("Build a complete font subset with --font-source before rendering.")
    output = (BASE / manifest["outputDirectory"]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    cli = ["npx", "--yes", f"hyperframes@{manifest['hyperframesVersion']}"]
    film = output / f"deepseek-dock-{manifest['version']}.mp4"
    if not args.gifs_only:
        run_logged(cli + ["check", str(BASE), "--json"], output / "check.log")
        run_logged(
            cli + [
                "render", str(BASE), "--output", str(film), "--fps", str(manifest["fps"]),
                "--quality", "delivery", "--workers", "2", "--skill", "hyperframes", "--json",
            ],
            output / "render.log",
        )
    if not film.is_file():
        raise FileNotFoundError(f"Film is missing: {film}")
    exported = []
    for number, chapter in enumerate(manifest["chapters"], start=1):
        recording = BASE / "assets/clips" / f"{chapter['id']}.mp4"
        gif = output / f"{number:02d}-{chapter['id']}.gif"
        config = manifest["gif"]
        filters = (
            f"[0:v]fps={config['fps']},scale={config['width']}:-1:flags=lanczos,split[frames][sample];"
            f"[sample]palettegen=max_colors={config['colors']}:stats_mode=diff[palette];"
            "[frames][palette]paletteuse=dither=none:diff_mode=rectangle[gif]"
        )
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-i", str(recording),
            "-t", str(chapter["durationSeconds"]),
            "-filter_complex", filters, "-map", "[gif]", "-an", "-loop", "0", str(gif),
        ], check=True)
        exported.append({
            "id": chapter["id"], "title": chapter["title"], "file": gif.name,
            "description": chapter["description"], "source": str(recording.relative_to(BASE)),
            "durationSeconds": chapter["durationSeconds"],
            "bytes": gif.stat().st_size, "sha256": hashlib.sha256(gif.read_bytes()).hexdigest(),
        })
    (output / "exports.json").write_text(json.dumps({
        "version": manifest["version"], "film": film.name,
        "durationSeconds": schedule["durationSeconds"], "gifs": exported,
    }, ensure_ascii=False, indent=2) + "\n")
    subprocess.run([sys.executable, str(BASE / "verify.py")], check=True)
    print(film)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gifs-only", action="store_true", help="Re-export GIFs from an existing film.")
    render(parser.parse_args())
