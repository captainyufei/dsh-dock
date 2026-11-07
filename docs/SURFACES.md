# Shared window surface

On macOS with Harness `0.2.2-rc.1`, the Dock owns the outer window surface. Global pages fill a shared content box beneath the title bar; they must not paint over window controls or supply their own window-sized layout.

## Ownership

- The center frame's `::after` owns the 1px sidebar/content divider, from 44px below the window top to the 8px bottom inset. Its `z-index:10` keeps it above page headers and sticky composers; `pointer-events:none` preserves sidebar resizing and clicks. It disappears with the sidebar and keeps the existing dark-theme color.
- `shell.overlay` keeps the existing window chrome mounted across page changes.
- The host's direct `[data-global-panel]` wrapper owns the real page bounds: 44px top, 8px trailing/bottom edge, 15px corner radius.
- Inside that box, `--dsh-frame-top-clearance` is `0px` because the outer box has already consumed the title-bar space. A plugin should still read that host variable with a `0px` fallback, so it also works without the Dock.
- The native conversation view has no `data-global-panel`. Its real MainPanel box is identified by the direct `main` slot and receives 8px trailing/bottom margins, with no top margin. This shrinks the scroll/composer area so sticky input and footer backgrounds cannot cover the outer gutter; the title row and tabs retain their original vertical positions. The trailing margin and corner disappear when the right tool panel is open so both surfaces join.
- Collapsing the left sidebar rounds the content's leading corners. Opening the right tool panel joins the center surface to the existing right-panel surface.
- The native narrow-window drawer adds its own MainPanel padding. This wrapper's padding is reset to zero to avoid applying the clearance twice.

## Title-bar interaction

Conversation-header group containers are native drag regions, including the empty gaps between their controls. Actual buttons, links, tabs, focusable elements, and editable controls remain `no-drag` so their native actions continue to work. Header text is not selectable; inputs and editable fields retain text selection.

The conversation title retains its native keyboard/context-menu trigger and therefore remains `no-drag`. Its horizontal label padding is removed to reduce the inactive-looking area around that trigger. Do not describe the whole title or badge row as draggable: dragging belongs to the gaps, while the interactive labels and controls keep their actions.

Local investigation on Electron `44.7.0` found another source of blocked header gaps: screenshot buttons and their images, already scrolled out of view and clipped by the conversation scrollport, still contributed overlapping `no-drag` rectangles at their unclipped coordinates. The DOM hit target was the visible header, but the native drag region was excluded by those offscreen controls. Raising the header's z-index or removing its mask did not resolve this case; this observation does not establish a general Electron version regression.

The Dock therefore sets `-webkit-app-region:initial!important` on `[data-cgpt-window-center] [data-conversation-scroll]` and every descendant. This scrollport contains the conversation's native views and composer, and never owns window dragging. Resetting its subtree removes the unnecessary native exclusion rectangles without changing pointer events or click handlers. Use the tested `initial` keyword: it computed to the unregistered `none` state in the client; a literal `none` declaration did not override the observed `no-drag` state in the local experiment.

The sibling conversation header and menus/dialogs portaled to `body` remain outside this reset and keep the host's drag rules. A future interactive popup that must extend from a conversation view over the title bar should use a portal outside the scrollport rather than depend on an inline fixed element's native region. Keep this workaround scoped to the marked center conversation scrollport; do not clear drag regions across the whole application or reorder the window drag strip over genuine header controls.

## Page styling

Use `width:100%`, `height:100%`, and `min-height:0` within the host-provided container. Put scrolling inside the page. Avoid `100vh` for embedded panels and avoid fixing panel roots against the viewport.

Use the host's `--dsw-alias-bg-base`, label, border, and interaction tokens for neutral surfaces. Preserve semantic colors for warnings, unread counts, connection states, and charts.

The Dock currently supplies two explicit neutral-color adapters in `src/rail.css`:

- `.dc-app` (`dsh-chat`): common page/sidebar/text/border colors and no decorative dot grid; message direction, presence, unread counts, and warning colors stay owned by the chat plugin.
- `.lc-ov-page` (`dsh-context`): page canvas follows the shared surface; cards and chart colors stay owned by the context plugin.

These adapters apply only inside the Dock's marked global content box. They do not change another plugin's files, and disabling the Dock removes its stylesheet. New global pages inherit the outer box automatically; a plugin with hardcoded internal colors may need its own small token adapter. Iframes and shadow roots are not automatically recolored.

## Compatibility and verification

Harness `0.2.1-rc.5` has no `data-global-panel` wrapper. It retains the previous Dock styling; the new shared content-box behavior was verified on `0.2.2-rc.1` only. Do not infer compatibility with later host releases from this selector alone.

For acceptance, check Home, Plugins, Tasks, Chat, Context Insights, light/dark themes, sidebar collapse, the native right panel, and a Home modal. In a native conversation, verify the 8px bottom gutter at the end of a long chat and with an expanded composer, and confirm that tabs and title controls remain in place. Test dragging from header gaps separately from clicking the title/menu, badges, and buttons, including after large images have scrolled partly and fully above the visible message area. Verify that visible message controls, image previews, and portaled menus still work. CSS drag-region declarations alone do not establish measured window movement. Also check native drawer mode at a narrow window size before claiming that viewport state has been visually validated.
