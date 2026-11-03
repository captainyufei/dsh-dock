# Review · DeepSeek Dock 0.1.1

The film now demonstrates the complete workflow instead of stretching the earlier 14-second loop. A single 45-second action timeline drives both language editions and both delivery formats. The first frame shows a complete workspace; the GIF returns to precisely that state after a short replay card. The replay reset is editorial, not an undo/delete action in the product.

## Review and corrections

- Reviewed stage frames at 0, 2.6, 7.5, 8.9, 12, 17.8, 20.5, 24.5, 26.5, 31, 35, 38 and the closing/replay boundary in Chinese and English.
- Added the actual customizer, optional Settings selection, and a visible Dock reorder. Settings moves into the selected list before the dialog closes. Shortened the explanatory line to fit its reading time while keeping the panel geometry fixed.
- Added chats from two workspaces to the global pinned area. The source rows disappear; unpin restores the proper workspace row. No duplicate chat is shown.
- Replaced the old typing-only home sequence with a full draft/Send sequence: four chats stay four while typing, then exactly one new row appears at Send. The sample displays a user message and a waiting state; it does not pretend a model replied.
- Moved the draft-state note below the composer; corrected selection backgrounds so only the active workspace chat is highlighted.
- Added existing file tabs, play/pause, a visible 0:02 → 0:20 seek, and drawer close/restore motion.
- Expanded the bundled Noto font subset for every new visible Chinese/Latin glyph, including punctuation; retained the original OFL.
- Overlap annotations apply only to deliberately opaque modals/closing cards and sliding/clipped panels. They are not a global layout-check bypass.

## Measured versus observed

`verification.json` and `preview-verification.json` contain the current hashes, dimensions, frame counts, durations, decoder results, check summaries and audio metadata. First/last GIF equality is measured on composited pixels. Language text is checked for unintended Chinese in English. Encoded key frames are inspected separately from source snapshots.

The BGM is unchanged and is present in both MP4s. Its level and duration are measured technically; no human listening claim is made. The soundtrack is intentionally absent from GIF.

A second agent checked the proposed behavior against current plugin source and reviewed the feature frames. This is still an illustrative animation, not live application acceptance or a performance benchmark. Current compatibility evidence remains macOS / DeepSeek Harness 0.2.1-rc.5.

## Warnings retained and limits

- HyperFrames flags two timeline-at-zero hidden states. Both already have explicit CSS initial states; the opening image and first/last equality are inspected and measured.
- Desktop interface text is intentionally below the mobile-video typography floor. The larger benefit captions carry the story; README text repeats the features for small screens. The customizer is the densest shot and would benefit from a separate close-up tutorial if finer UI reading becomes necessary.
- GIF is silent by design. The closing-line detector sees the opening chat reappear briefly near the end; that is the same state repeated continuously across the loop, not new information requiring a new full reading interval.
- The final GIF uses a global 256-color palette with no dithering. This preserves flat UI surfaces and readable letters at a smaller size; it is not intended as a color-perfect UI asset source.
