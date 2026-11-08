# DeepSeek Dock 0.2.0 feature media

The Chinese and English 45-second GIF/MP4 editions share one seekable HyperFrames composition and demonstrate the current application Dock, All Apps, pinning/reordering, global search, completion history, Back/Forward and existing video tools. See [STORYBOARD.md](STORYBOARD.md) and [SPEC.md](SPEC.md).

All UI, chats, project names, completions and video imagery are fictional examples based on the current product labels and behavior. The visible simulation/version stamp stays on screen. This is not a live recording, compatibility test, task-speed claim or model-response demonstration. The earlier pin/draft interaction beats were replaced by 0.2.0 workflows; those features remain described in the main README.

## Rebuild

Requires Node.js, Python 3 with Pillow and fonttools[brotli], Chrome supported by the pinned HyperFrames 0.8.226, and FFmpeg. The local font, GSAP and music assets are bundled.

```sh
npm run build
npm run check
npm run render
npm run render:preview
python3 verify-media.py
```

`render-film.py` generates isolated language projects, checks them, renders 1920 × 1080 / 30 fps / 45-second H.264 films and review stills, then restores the editable default to Chinese. Posters use 6.9 s; the gallery uses 2.2, 6.9, 15.5, 22.3 and 38.6 s.

`render-preview.py` builds isolated silent loop compositions, checks and renders PNG sequences, then encodes 1200 × 675 / 15 fps GIFs using one 256-color palette per language. It verifies infinite looping, matching first/last composited pixels, duration and size under 5 MB. The final replay card hides only the illustrative reset.

Render caches, temporary PNG frames and diagnostics stay in ignored `.preview-work/` and `.hyperframes/`. `verification.json`, `preview-verification.json` and `REVIEW.md` record final files and the actual review scope; generated files alone are not visual acceptance.

## Source and licenses

- Font: a subset of [Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc), with printable ASCII and all Chinese glyphs used in both editions. [SIL OFL 1.1](assets/fonts/OFL.txt). The full upstream font is not bundled.
- `assets/gsap.min.js`: the existing locally bundled GSAP runtime; see the repository [third-party notices](../THIRD_PARTY_NOTICES.md).
- `assets/audio/dock-bgm.mp3`: existing original instrumental excerpt shared by both films; provenance and editing settings are preserved in [audio/README.md](assets/audio/README.md). No new generated music or voiceover is used.
- Product symbols reuse the established line-icon geometry and current control names. They are drawn as illustrative HTML/SVG, not private desktop captures.

HyperFrames Studio is available through `npx hyperframes@0.8.226 preview --background`. The same editable project can be opened in the HyperFrames desktop app.
