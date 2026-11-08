# DeepSeek Dock 0.2.0 media specification

- 45 seconds, 1920 × 1080, 30 fps MP4, H.264/yuv420p, quiet existing instrumental soundtrack.
- GIF: 1200 × 675, 15 fps, 675 frames before any identical-frame coalescing, 45 seconds, infinite loop, 256-color global palette, no dithering, under 5 MB per language.
- Light neutral ground #edf1f7, flat macOS window #f2f3f3, white sheets, ink #202428, semantic blue for real unread/selected UI. No glass, tilt, decorative gradients, fake speed metrics or new app-icon color blocks.
- Same 1700 × 775 window and readable 33 px primary captions. Native UI labels are contextual and retain their density. Chinese edition keeps English supporting captions; English edition localizes all visible UI.
- Current layout: Back, Forward and sidebar toggle near traffic lights; monochrome application Dock; bell left of search; separate neutral gap insertion line.
- Header clearance: the fixed leading controls end at window x=225. The title moves independently by 155 px to x=260, preserving at least 35 px throughout collapse and reopen; content still travels 310 px.
- Modal All Apps includes search, All/Pinned/Recent filters and 6 fictional installed-page entries. Backend-only plugins are not rendered as applications.
- Search demonstrates titles/workspaces. Never imply that the current deployment has the Host body index enabled.
- Inbox demonstrates one fictional completion, matching Home/bell/row unread dots, and acknowledgement without deleting history. No task duration or live model output is claimed.
- File drawer restores existing tabs; the geometric video is original illustrative artwork.
- Panel moves: power3.inOut, 0.6–0.65 seconds; cursor power2.inOut, 0.45 seconds; click compress/rebound, no click rings. No perpetual floating/breathing.
- Loop reset is covered by the closing card. First/last composited GIF frames must be identical.
- Review: 0, 0.95, 1.2, 1.45, 1.6, 2.2, 3.1, 3.32, 3.5, 3.75, 6.9, 10.2, 15.5, 22.3, 25, 30.8, 34.2, 38.6, 42.5, 44.933 seconds, plus transition strips and the loop seam. Inspect the encoded Chinese and English GIF/MP4 headers at 2.2 and 3.32 seconds.
- Poster: 6.9 s All Apps. Gallery: collapsed Dock, All Apps, global search, inbox and video seek.
- Visible version 0.2.0; the on-device evidence is macOS/Harness 0.2.2-rc.1. This media is explanatory, not additional runtime compatibility or performance proof.
