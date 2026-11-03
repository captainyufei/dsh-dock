# DeepSeek Dock · 模拟功能演示 / Simulated feature demo

这段 45 秒动效使用 HTML、CSS、SVG 和 GSAP 重建交互，用于说明插件的工作方式。画面中的项目、会话、文件和视频全部是示例内容；不是实机录屏，也不代表真实机器上的帧率或响应时间。

This 45-second animation reconstructs the interactions in HTML, CSS, SVG, and GSAP. All projects, chats, files, and video content are fictional examples. It is not a screen recording or a performance benchmark.

目标版本为 **DeepSeek Dock 0.1.1**。插件目前仅在 **macOS / DeepSeek Harness 0.2.1-rc.5** 实测；模拟画面不扩大这一兼容范围。中文和全英文版本使用相同的轻量背景音乐，均无旁白。

The target release is **DeepSeek Dock 0.1.1**. The plugin has only been verified on **macOS / DeepSeek Harness 0.2.1-rc.5**. The simulation does not imply wider compatibility. Both versions use the same light background music without voiceover. The English version localizes all visible UI labels, sample conversations, file names, captions, and the end card—not just the subtitles.

## 展示内容 / Sequence

| 时间 / Time | 功能 / Feature |
| --- | --- |
| 0–5.4 s | Codex 风格整体布局，收起会话列表后 Dock 常驻 / Codex-inspired layout; Dock stays fixed |
| 5.4–13.3 s | 打开自定义面板、添加设置入口、拖动图标排序 / Open Customize Dock, add Settings, drag icons to reorder |
| 13.3–21.2 s | 两个工作区的会话汇总置顶，去重，取消后归位 / Pin from two workspaces, deduplicate, unpin to restore |
| 21.2–29.5 s | 草稿不新增会话，点击发送后只新增一条 / Draft keeps four chats; Send adds exactly one |
| 29.5–32.7 s | 一个开关恢复已有文件和工具标签 / One toggle restores existing files and tools |
| 32.7–42 s | 原生文件标签里播放、拖动视频进度、关闭抽屉 / Play and seek in the native file tab, then close the drawer |
| 42–45 s | MP4 功能回顾；GIF 回到首帧 / MP4 recap; GIF replay returns to the opening frame |

## 复现 / Reproduce

需要 Node.js、Python 3，以及 HyperFrames 支持的 Chrome / FFmpeg 运行环境。CLI 固定为 **HyperFrames 0.8.226**；字体和 GSAP 使用本目录的本地文件。

Use Node.js, Python 3, and a Chrome / FFmpeg environment supported by HyperFrames. The CLI is pinned to **HyperFrames 0.8.226**. The font and GSAP runtime are bundled locally.

From this `demo/` directory:

```sh
npm run build:zh
npm run check -- --json
npm run build:en
npm run check -- --json
npm run render
```

`npm run render` produces `../assets/readme/demo.mp4` (Chinese UI, bilingual captions) and `../assets/readme/demo.en.mp4` (fully English), then restores the editable project to Chinese. Both outputs are 1920 × 1080, 30 fps, 45 seconds, H.264 / yuv420p. Chrome, OS font rendering, and encoder versions can change the final bytes while preserving the authored timeline.

检查关键帧 / Inspect key frames:

```sh
npx --yes hyperframes@0.8.226 snapshot --at 0,2.6,7.5,8.9,17.8,20.5,24.5,26.5,31,35,38,43.5
```

`poster.png` and `poster.en.png` use the 31 s notes-drawer frame. The community gallery uses 2.6 s, 7.5 s, 17.8 s, and 38 s. `render-film.py` rebuilds both movies and these images from isolated language projects, runs a full HyperFrames check before rendering, then restores the editable default to Chinese. The visible simulation/version stamp is preserved.

For a persistent local preview:

```sh
npx --yes hyperframes@0.8.226 preview --background
npx --yes hyperframes@0.8.226 preview --status
npx --yes hyperframes@0.8.226 preview --stop
```

The generator `build-demo.py`, shared action source `timeline.js`, and `translations.en.json` are the source of truth. `python3 build-demo.py --lang zh|en` selects the language while sharing one 45-second timeline. It writes `index.html`, `compositions/ui-demo.html`, and `text.txt`. Update the generator, then rebuild; avoid editing the generated HTML directly. The timeline is deterministic and uses no real accounts, files, model calls, or network content.

## 授权 / Credits

- Project-authored composition, original geometric motion sample, and SVG graphics: repository MIT license.
- `assets/gsap.min.js`: GSAP 3.15.0, copyright 2026 GreenSock, [GSAP Standard License](https://gsap.com/standard-license). Its original copyright header is retained; it is not relicensed as MIT.
- `assets/fonts/demo-sans.woff2`: a subset of [Noto Sans SC](https://github.com/notofonts/noto-cjk), copyright 2014–2021 Adobe, with Reserved Font Name “Source”; [SIL Open Font License 1.1](assets/fonts/OFL.txt). The Chinese and Latin characters used in this release were checked against its character map.
- HyperFrames CLI: external build tool, pinned in `package.json`; its runtime package and cache are not vendored.

Review findings and final artifact metadata are recorded in `verification.json`. Small native UI labels are intentionally smaller than the mobile-video text recommendation; the feature captions remain larger. The bundled Noto subset includes all printable ASCII and the Chinese text used in this release. The rendered output and key frames were visually reviewed.

## 背景音乐 / Background music

Both language versions place `assets/audio/dock-bgm.mp3` on the root timeline at 0–45 seconds with `data-volume="1"`. The file already includes a 1.2-second fade-in and a fade-out from 42.5–45 seconds. Do not add a second fade or reduce its gain again. It was generated for this project using ChatCut / Mureka 9; see the adjacent audio metadata and repository third-party notices for provenance and terms. The supplied track measures approximately −21.55 LUFS integrated, −6.14 dBTP true peak, and 3.4 LU loudness range. Audio measurements are technical checks, not a claim of human listening.

## README 自动循环预览 / Autoplay README previews

`../assets/readme/preview.gif` and `preview.en.gif` are **45-second**, **1200 × 675**, **15 fps** loops. They cover the full sequence above, not a slowed-down short loop. The initial frame is a complete example chat. The final replay card briefly covers the illustrative reset, then the exact opening image returns before looping. All English UI text, examples and captions are localized.

GIF has no audio. Click the README preview for the corresponding 45-second MP4 with background music. The GIF and movie use the same `timeline.js`; only the closing/replay treatment differs. The animation is illustrative, not a benchmark of application smoothness or model response timing.

Additional requirements: **FFmpeg**, **Python 3 with Pillow** (`python3 -m pip install Pillow`). Final metadata and visible-glyph validation additionally use `fonttools[brotli]` (`python3 -m pip install 'fonttools[brotli]'`). HyperFrames is pinned to 0.8.226.

```sh
npm run render:preview
# Only English:
python3 render-preview.py --lang en
# Re-encode already rendered lossless frames:
python3 render-preview.py --lang en --encode-only --colors 256 --dither none --width 1200 --fps 15
```

`build-preview.py` calls `build-demo.py --loop --output ...`, producing isolated projects in ignored `.preview-work/<language>/` with no audio track. `render-preview.py` checks each composition, renders lossless PNG frames, builds one global palette, and encodes infinite looping with rectangle differencing and no dithering. It requires a 44–45 second duration, identical first/last composited pixels, and size below 5 MB per language. This release is 45.000 seconds and under 3 MB each. Build cache and diagnostics stay outside public source.

`verification.json` and `preview-verification.json` record current output hashes, encoding metadata, check results and review scope. `REVIEW.md` describes corrections and remaining limitations. Generating GIFs does not overwrite the separately rendered MP4s or posters.

After rendering both formats, run `python3 verify-media.py` to regenerate the compact verification files with current hashes, full decoder checks, GIF boundary comparison, visible-font coverage, and technical audio measurements.
