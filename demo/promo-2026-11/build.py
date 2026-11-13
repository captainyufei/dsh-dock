"""Build the recording-based HyperFrames promo from manifest.json."""

import argparse
import hashlib
import html
import json
import math
from pathlib import Path
import shutil
import subprocess

BASE = Path(__file__).resolve().parent


def run(command):
    subprocess.run(command, check=True)


def probe_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def prepare_font(text, source):
    from fontTools import subset
    from fontTools.ttLib import TTFont

    destination = BASE / "assets/fonts/promo-sans.woff2"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source:
        options = subset.Options()
        options.flavor = "woff2"
        font = subset.load_font(str(source), options)
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(text=text + "".join(chr(code) for code in range(32, 127)))
        subsetter.subset(font)
        subset.save_font(font, str(destination), options)
    elif not destination.is_file():
        shutil.copy2(BASE.parent / "assets/fonts/demo-sans.woff2", destination)
    shutil.copy2(BASE.parent / "assets/fonts/OFL.txt", destination.parent / "OFL.txt")
    coverage = set(TTFont(destination).getBestCmap())
    missing = sorted({ord(character) for character in text if not character.isspace()} - coverage)
    return {
        "file": "assets/fonts/promo-sans.woff2",
        "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        "missingCharacters": "".join(chr(code) for code in missing),
        "allVisibleCharactersCovered": not missing,
    }


STYLE = """
@font-face { font-family: PromoSans; src: url('assets/fonts/promo-sans.woff2'); }
* { box-sizing: border-box; }
#root { position: absolute; inset: 0; color: #17212e; background: #f3f5f8; font-family: PromoSans, Arial, sans-serif; }
.chapter-title { position: absolute; top: 39px; left: 192px; margin: 0; font-size: 44px; font-weight: 600; line-height: 1.3; letter-spacing: -0.5px; }
.chapter-description { position: absolute; top: 105px; left: 192px; margin: 0; font-size: 28px; line-height: 1.35; color: #526174; }
.product { position: absolute; right: 192px; top: 58px; font-size: 28px; color: #526174; }
.recording-label { position: absolute; right: 192px; top: 107px; font-size: 28px; color: #637185; }
.screen { position: absolute; left: 192px; top: 162px; width: 1536px; height: 864px; border: 1px solid #dce2eb; border-radius: 16px; box-shadow: 0 12px 28px #17212e14; overflow: hidden; background: #fff; }
.screen video { display: block; width: 100%; height: 100%; object-fit: contain; }
.end-lockup { position: absolute; left: 192px; top: 360px; width: 1536px; }
.end-title { margin: 0; color: #365ff0; font-size: 106px; font-weight: 600; line-height: 1.2; letter-spacing: -3px; }
.end-description { margin: 36px 0 0; font-size: 37px; line-height: 1.5; }
.destination { margin: 45px 0 0; color: #526174; font-size: 29px; }
.edition { position: absolute; left: 192px; bottom: 108px; color: #526174; font-size: 28px; }
"""


def scene_document(scene_id, markup, motion, duration):
    return (
        f'<template><style>{STYLE}</style><div id="root" data-composition-id="{scene_id}" '
        f'data-width="1920" data-height="1080" data-duration="{duration}">{markup}</div>'
        f'<script>const tl = gsap.timeline({{paused: true}});{motion}'
        f'window.__timelines=window.__timelines||{{}};window.__timelines["{scene_id}"] = tl;</script></template>\n'
    )


def card_scene(scene_id, content, product, version):
    title = html.escape(content["title"])
    description = html.escape(content["description"])
    destination = content.get("destination")
    destination_markup = f'<p class="destination">{html.escape(destination)}</p>' if destination else ""
    markup = (
        '<div class="end-lockup">'
        f'<h1 class="end-title">{title}</h1>'
        f'<p class="end-description">{description}</p>{destination_markup}</div>'
        f'<div class="edition">{html.escape(product)} · {html.escape(version)}</div>'
    )
    motion = (
        "tl.fromTo('.end-lockup', {y: 16, opacity: 0}, "
        "{y: 0, opacity: 1, duration: 0.4, ease: 'power2.out'}, 0);"
    )
    return scene_document(scene_id, markup, motion, content["durationSeconds"])


def chapter_scene(chapter, product, recording_label):
    scene_id = chapter["id"]
    duration = chapter["durationSeconds"]
    markup = (
        f'<h2 class="chapter-title">{html.escape(chapter["title"])}</h2>'
        f'<p class="chapter-description">{html.escape(chapter["description"])}</p>'
        f'<div class="product">{html.escape(product)}</div>'
        f'<div class="recording-label">{html.escape(recording_label)}</div>'
        '<div class="screen">'
        f'<video id="recording-{scene_id}" class="clip" src="assets/clips/{scene_id}.mp4" '
        f'data-start="0" data-duration="{duration}" data-track-index="0" muted playsinline preload="auto"></video>'
        '</div>'
    )
    return scene_document(scene_id, markup, "", duration)


def normalize_clip(chapter, destination):
    source = (BASE / chapter["source"]).resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Recording is missing: {source}")
    original_duration = probe_duration(source)
    start = chapter.get("sourceStartSeconds", 0)
    end = chapter.get("sourceEndSeconds")
    if end is None:
        end = original_duration
    if not 0 <= start < end <= original_duration + 0.04:
        raise ValueError(f"Invalid source interval for {chapter['id']}: {start}–{end}")
    source_duration = end - start
    target_duration = chapter["durationSeconds"]
    speed = max(1, source_duration / target_duration)
    filters = (
        f"trim=start={start}:end={end},setpts=(PTS-STARTPTS)/{speed},"
        "scale=1280:720:force_original_aspect_ratio=decrease:flags=lanczos,"
        "pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,"
        f"fps=30,tpad=stop_mode=clone:stop_duration={target_duration},trim=duration={target_duration}"
    )
    run([
        "ffmpeg", "-v", "error", "-y", "-i", str(source), "-vf", filters,
        "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "14",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(destination),
    ])
    return {
        "id": chapter["id"],
        "source": chapter["source"],
        "sourceStartSeconds": start,
        "sourceEndSeconds": end,
        "sourceDurationSeconds": source_duration,
        "durationSeconds": target_duration,
        "playbackSpeed": speed,
        "tailHoldSeconds": max(0, target_duration - source_duration),
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    }


def prepare_music(config, duration, destination):
    source = (BASE / config["source"]).resolve()
    start = config["coreStartSeconds"]
    end = min(config["coreEndSeconds"], probe_duration(source))
    crossfade = config["crossfadeSeconds"]
    length = end - start
    if length <= crossfade:
        raise ValueError("The reusable music interval must exceed its crossfade.")
    repeats = max(1, math.ceil((duration - crossfade) / (length - crossfade)))
    filters = [f"[0:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[core]"]
    if repeats == 1:
        last = "core"
    else:
        branches = "".join(f"[part{index}]" for index in range(repeats))
        filters.append(f"[core]asplit={repeats}{branches}")
        last = "part0"
        for index in range(1, repeats):
            joined = f"joined{index}"
            filters.append(
                f"[{last}][part{index}]acrossfade=d={crossfade}:c1=tri:c2=tri[{joined}]"
            )
            last = joined
    fade_out = config["fadeOutSeconds"]
    filters.append(
        f"[{last}]atrim=duration={duration},asetpts=PTS-STARTPTS,"
        f"volume={config['volume']},afade=t=in:st=0:d={config['fadeInSeconds']},"
        f"afade=t=out:st={duration-fade_out}:d={fade_out}[music]"
    )
    run([
        "ffmpeg", "-v", "error", "-y", "-i", str(source),
        "-filter_complex", ";".join(filters), "-map", "[music]",
        "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(destination),
    ])


def build(args):
    manifest = json.loads((BASE / "manifest.json").read_text())
    assets = BASE / "assets"
    compositions = BASE / "compositions"
    (assets / "clips").mkdir(parents=True, exist_ok=True)
    compositions.mkdir(parents=True, exist_ok=True)
    shutil.copy2(BASE.parent / "assets/gsap.min.js", assets / "gsap.min.js")
    visible_text = [manifest["product"], manifest["version"], manifest["recordingLabel"]]
    hosts = []
    schedule = []
    start = 0
    scene_items = [{"id": "intro", **manifest["intro"]}, *manifest["chapters"], {"id": "outro", **manifest["outro"]}]
    if len({scene["id"] for scene in scene_items}) != len(scene_items):
        raise ValueError("Every chapter must have a unique id, excluding intro and outro.")
    for scene in scene_items:
        scene_id = scene["id"]
        duration = scene["durationSeconds"]
        if duration <= 0:
            raise ValueError(f"Duration must be positive for {scene_id}")
        visible_text.extend([scene["title"], scene["description"], scene.get("destination", "")])
        if scene_id in {"intro", "outro"}:
            document = card_scene(scene_id, scene, manifest["product"], manifest["version"])
        else:
            document = chapter_scene(scene, manifest["product"], manifest["recordingLabel"])
        (compositions / f"{scene_id}.html").write_text(document)
        hosts.append(
            f'<div id="{scene_id}" class="clip" data-composition-id="{scene_id}" '
            f'data-composition-src="compositions/{scene_id}.html" data-start="{start}" '
            f'data-duration="{duration}" data-track-index="0" data-track-kind="graphics" '
            'data-width="1920" data-height="1080"></div>'
        )
        schedule.append({"id": scene_id, "startSeconds": start, "durationSeconds": duration})
        start += duration
    font_report = prepare_font("\n".join(visible_text), args.font_source)
    root = f'''<!doctype html>
<html lang="{manifest['language']}"><head><meta charset="utf-8">
<meta name="viewport" content="width=1920,height=1080"><title>DeepSeek Dock 功能演示</title>
<script src="assets/gsap.min.js"></script>
<style>html,body{{margin:0;width:1920px;height:1080px;overflow:hidden;background:#f3f5f8}}#root{{position:relative;width:1920px;height:1080px}}.clip{{position:absolute;inset:0}}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="{start}" data-width="1920" data-height="1080" data-fps="30">
{''.join(hosts)}
<audio id="promo-music" class="clip" src="assets/promo-music.wav" data-start="0" data-duration="{start}" data-track-index="1" data-track-kind="audio" data-volume="1" preload="auto"></audio>
</div><script>const tl = gsap.timeline({{paused:true}});window.__timelines=window.__timelines||{{}};window.__timelines.main=tl;</script></body></html>
'''
    (BASE / "index.html").write_text(root)
    write_json(BASE / "meta.json", {"id": "deepseek-dock-promo-" + manifest["version"].replace(".", "-"), "name": "DeepSeek Dock 功能演示"})
    write_json(BASE / "schedule.json", {"durationSeconds": start, "scenes": schedule})
    recordings = []
    report = {
        "version": manifest["version"], "durationSeconds": start, "compositionOnly": True,
        "manifestSha256": hashlib.sha256((BASE / "manifest.json").read_bytes()).hexdigest(),
        "font": font_report, "recordings": recordings,
    }
    # An interrupted build remains visibly incomplete until every asset succeeds.
    write_json(BASE / "build-report.json", report)
    if not args.composition_only:
        for chapter in manifest["chapters"]:
            recordings.append(normalize_clip(chapter, assets / "clips" / f"{chapter['id']}.mp4"))
        prepare_music(manifest["music"], start, assets / "promo-music.wav")
    report["compositionOnly"] = args.composition_only
    write_json(BASE / "build-report.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--composition-only", action="store_true", help="Write the editable composition before recordings arrive.")
    parser.add_argument("--font-source", type=Path, help="Full OFL Noto Sans SC font to subset for all visible copy.")
    build(parser.parse_args())
