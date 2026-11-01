# DeepSeek Dock · 模拟功能演示 / Simulated feature demo

这段 45 秒动效使用 HTML、CSS、SVG 和 GSAP 重建交互，用于说明插件的工作方式。画面中的项目、会话、文件和视频全部是示例内容；不是实机录屏，也不代表真实机器上的帧率或响应时间。

This 45-second animation reconstructs the interactions in HTML, CSS, SVG, and GSAP. All projects, chats, files, and video content are fictional examples. It is not a screen recording or a performance benchmark.

目标版本为 **DeepSeek Dock 0.1.0-beta.1**。插件目前仅在 **macOS / DeepSeek Harness 0.2.1-rc.5** 实测；模拟画面不扩大这一兼容范围。中文和全英文版本使用相同的轻量背景音乐，均无旁白。

The target release is **DeepSeek Dock 0.1.0-beta.1**. The plugin has only been verified on **macOS / DeepSeek Harness 0.2.1-rc.5**. The simulation does not imply wider compatibility. Both versions use the same light background music without voiceover. The English version localizes all visible UI labels, sample conversations, file names, captions, and the end card—not just the subtitles.

## 展示内容 / Sequence

| 时间 / Time | 功能 / Feature |
| --- | --- |
| 0–7.5 s | 会话列表收起后，Dock 继续常驻 / Dock remains visible when the workspace list is collapsed |
| 7.5–14.5 s | 自定义常用入口及拖动排序 / Customize and reorder Dock entries |
| 14.5–21.5 s | 跨工作区置顶，取消后回到原分组 / Global pinned chats; unpin to restore the workspace row |
| 21.5–29 s | 同一开关打开、收起和恢复已有工具 / Open, close, and restore existing tools with one toggle |
| 29–38.5 s | 对话旁播放视频并拖动进度 / Play and seek a video beside the conversation |
| 38.5–42 s | 先写草稿，发送时才创建会话 / Draft first; create the conversation when sending |
| 42–45 s | 名称、版本和功能回顾 / Product name, version, and feature recap |

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
npx --yes hyperframes@0.8.226 snapshot --at 0,4.8,10.8,17.8,23.5,31,39.5,43.5
```

`poster.png` and `poster.en.png` use the 23.5 s frame from their respective language, showing the complete workspace and notes drawer. Run `npm run build:zh` or `npm run build:en` before taking language-specific snapshots. Gallery images use 4.8 s, 10.8 s, 17.8 s, and 31 s. Keep the visible “模拟演示 / SIMULATED DEMO” stamp when exporting them.

For a persistent local preview:

```sh
npx --yes hyperframes@0.8.226 preview --background
npx --yes hyperframes@0.8.226 preview --status
npx --yes hyperframes@0.8.226 preview --stop
```

The generator `build-demo.py` and `translations.en.json` are the source of truth. `python3 build-demo.py --lang zh|en` selects the language while sharing one 45-second timeline. It writes `index.html`, `compositions/ui-demo.html`, and `text.txt`. Update the generator, then rebuild; avoid editing the generated HTML directly. The timeline is deterministic and uses no real accounts, files, model calls, or network content.

## 授权 / Credits

- Project-authored composition, original geometric motion sample, and SVG graphics: repository MIT license.
- `assets/gsap.min.js`: GSAP 3.15.0, copyright 2026 GreenSock, [GSAP Standard License](https://gsap.com/standard-license). Its original copyright header is retained; it is not relicensed as MIT.
- `assets/fonts/demo-sans.woff2`: a subset of [Noto Sans SC](https://github.com/notofonts/noto-cjk), copyright 2014–2021 Adobe, with Reserved Font Name “Source”; [SIL Open Font License 1.1](assets/fonts/OFL.txt). The Chinese and Latin characters used in this release were checked against its character map.
- HyperFrames CLI: external build tool, pinned in `package.json`; its runtime package and cache are not vendored.

Review findings and final artifact metadata are recorded in `verification.json`. Small native UI labels are intentionally smaller than the mobile-video text recommendation; the feature captions remain larger. The bundled Noto subset includes all printable ASCII and the Chinese text used in this release. The rendered output and key frames were visually reviewed.

## 背景音乐 / Background music

Both language versions place `assets/audio/dock-bgm.mp3` on the root timeline at 0–45 seconds with `data-volume="1"`. The file already includes a 1.2-second fade-in and a fade-out from 42.5–45 seconds. Do not add a second fade or reduce its gain again. It was generated for this project using ChatCut / Mureka 9; see the adjacent audio metadata and repository third-party notices for provenance and terms. The supplied track measures approximately −21.55 LUFS integrated, −6.14 dBTP true peak, and 3.4 LU loudness range. Audio measurements are technical checks, not a claim of human listening.
