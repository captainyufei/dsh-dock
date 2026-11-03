# Production specification · 0.1.1

- Shared story: 45 seconds, `timeline.js`; one paused seekable timeline, no timers or randomness.
- MP4: 1920 × 1080, 30 fps, H.264 / yuv420p, 45 seconds, original stereo BGM at unity gain.
- GIF: 1200 × 675, 15 fps, 675 frames, 45 seconds, infinite loop (`loop=0`), 256-color global palette, no dithering. Target each file under 5 MB.
- Ground #edf1f7; flat macOS window #f2f3f3; white panels; ink #202428; blue accent #3c65e8. No glass, tilt, glow, stock imagery or performance metrics.
- Window 1700 × 775 with 22 px radius; header 42 px, simulation/version stamp 22 px; Chinese stage captions 33 px, English 24 px; English-only captions 33 px.
- Panels: power3.inOut, 0.65 s. Cursor: power2.inOut, 0.45 s. Click: 0.08 s compress + 0.12 s restore. No bounce.
- Five capabilities must be visibly demonstrated: persistent/customizable Dock, Codex-inspired layout, two-workspace global pins with deduplication, draft-to-send creation, native file-tab video playback/seek.
- Customize uses actual source labels and an explicitly added optional Settings entry. Reordering is performed on the Dock icons, not by dragging rows inside the modal.
- Initial chats: four. Typing a home draft: four. After Send: five. No model response is simulated.
- Video art is an original geometric motion sample, not private footage. Toolbar labels and sample paths contain no personal data.
- Both languages use the bundled DemoSans font, expanded for all new Chinese glyphs and printable ASCII. Upstream font remains SIL OFL 1.1.
- GIF and MP4 share every action until the replay/closing card. GIF editorial reset occurs behind that card; first and last composited frames must be byte-equivalent in RGB.
- Review moments: 0, 2.6, 7.5, 8.9, 12, 17.8, 20.5, 24.5, 26.5, 31, 35, 38, 42.5, 44.933 seconds.
- Poster: 31 s notes drawer; gallery: 2.6 s collapsed Dock, 7.5 s customizer, 17.8 s two pinned workspaces, 38 s video seek.
- Simulation stamp stays visible in every functional scene. Current tested compatibility remains macOS / DeepSeek Harness 0.2.1-rc.5; this is not live runtime or performance evidence.
