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

The macOS leading controls are Back, Forward, then the existing native sidebar toggle. The navigation seat is a direct frame child; the two arrows use 28px buttons with 6px gaps, starting at 88px after the traffic-light area (12px in fullscreen). CSS positions the native toggle at the third slot without cloning or reparenting Host-owned React nodes. The collapsed sidebar's native opener uses the same slot, while the title reserves 192px of leading clearance (116px in fullscreen). Only the buttons are `no-drag`; the shared seat does not introduce a wide drag exclusion.

In native narrow drawer mode, opening the modal drawer makes the sibling navigation seat inert and hides the outside opener. The drawer's original toggle and focus lifecycle stay owned by the Host. Full-width expanded/collapsed navigation was visually and behaviorally checked on `0.2.2-rc.1`; the new leading controls' narrow-drawer/fullscreen placement has not yet been visually accepted.

Conversation-header group containers are native drag regions, including the empty gaps between their controls. Actual buttons, links, tabs, focusable elements, and editable controls remain `no-drag` so their native actions continue to work. Header text is not selectable; inputs and editable fields retain text selection.

The conversation title retains its native keyboard/context-menu trigger and therefore remains `no-drag`. Its horizontal label padding is removed to reduce the inactive-looking area around that trigger. Do not describe the whole title or badge row as draggable: dragging belongs to the gaps, while the interactive labels and controls keep their actions.

Local investigation on Electron `44.7.0` found another source of blocked header gaps: screenshot buttons and their images, already scrolled out of view and clipped by the conversation scrollport, still contributed overlapping `no-drag` rectangles at their unclipped coordinates. The DOM hit target was the visible header, but the native drag region was excluded by those offscreen controls. Raising the header's z-index or removing its mask did not resolve this case; this observation does not establish a general Electron version regression.

The Dock therefore sets `-webkit-app-region:initial!important` on `[data-cgpt-window-center] [data-conversation-scroll]` and every descendant. This scrollport contains the conversation's native views and composer, and never owns window dragging. Resetting its subtree removes the unnecessary native exclusion rectangles without changing pointer events or click handlers. Use the tested `initial` keyword: it computed to the unregistered `none` state in the client; a literal `none` declaration did not override the observed `no-drag` state in the local experiment.

The sibling conversation header and menus/dialogs portaled to `body` remain outside this reset and keep the host's drag rules. A future interactive popup that must extend from a conversation view over the title bar should use a portal outside the scrollport rather than depend on an inline fixed element's native region. Keep this workaround scoped to the marked center conversation scrollport; do not clear drag regions across the whole application or reorder the window drag strip over genuine header controls.

## Sidebar motion

`wireRailGeometry` owns the frame markers and track variables for the lifetime of the sidebar contribution. `wireRailLayout` can refresh labels and native-node markers when the Host changes icon size without disposing that geometry. Previously the Host's 150ms collapse settle rerender removed and reinstalled the track override, interrupting the 300ms grid transition. Opening also briefly exposed the Host's 280px default before restoring the preferred width.

For a normal window, only the outer grid track changes width. The inner sidebar keeps `--cgpt-rail-content-width` at its final expanded width and disables its separate width transition; the native column clips it. This avoids rewrapping text throughout the slide. Collapsing preserves padding and layout while workspace/new-chat controls fade and then become visibility-hidden; the Dock and account controls remain available. Reduced-motion preferences disable the fade. The drawer retains the Host's overlay geometry and width.

Width memory reads the native target during actual divider dragging, not `ResizeObserver` measurements of an animated root. Before restoring the expanded width, the adapter installs the final track target, then calls the Host. Its own CSS-variable writes do not start another geometry update.

## Page styling

Dock reorder accepts releases on both pinned buttons and their intervening gaps. The drop marker is a separate neutral straight line in the gap; it never paints a colored rounded icon border. Release, cancellation, Escape, lost capture, blur and disposal clear drag markers and transient listeners. Keyboard focus uses an inset neutral outline so the narrow scrollport cannot clip its sides; pointer focus does not draw the keyboard ring.

The application Dock keeps the existing 52px leading rail and shared page frame. Its owned presentation seat stays mounted while the workspace sidebar collapses. Fixed application icons scroll within the available height; recent unpinned applications follow a divider, and the application overview button remains reachable below the list. Existing native system actions retain their own controls. Dock artwork follows the previous monochrome line-icon style: 36px hit targets, 20px symbols, and a flat gray hover/current-page background. Sanitized SVG artwork is used as a currentColor mask so it follows the existing light/dark rail palette; the application overview uses the same plain symbols.

The application overview is a native Modal, and application menus use native Menu primitives. They remain outside page clipping and preserve the Host's focus and Escape behavior. Native sidebar icon components are kept mounted but their duplicate presentation is hidden; only the Dock-owned buttons are excluded from native navigation marking. The active marker means the currently selected page, not a background process.

Use `width:100%`, `height:100%`, and `min-height:0` within the host-provided container. Put scrolling inside the page. Avoid `100vh` for embedded panels and avoid fixing panel roots against the viewport.

Use the host's `--dsw-alias-bg-base`, label, border, and interaction tokens for neutral surfaces. Preserve semantic colors for warnings, unread counts, connection states, and charts.

The Dock currently supplies two explicit neutral-color adapters in `src/rail.css`:

- `.dc-app` (`dsh-chat`): common page/sidebar/text/border colors and no decorative dot grid; message direction, presence, unread counts, and warning colors stay owned by the chat plugin.
- `.lc-ov-page` (`dsh-context`): page canvas follows the shared surface; cards and chart colors stay owned by the context plugin.

These adapters apply only inside the Dock's marked global content box. They do not change another plugin's files, and disabling the Dock removes its stylesheet. New global pages inherit the outer box automatically; a plugin with hardcoded internal colors may need its own small token adapter. Iframes and shadow roots are not automatically recolored.

## Compatibility and verification

Harness `0.2.1-rc.5` has no `data-global-panel` wrapper. It retains the previous Dock styling; the new shared content-box behavior was verified on `0.2.2-rc.1` only. Do not infer compatibility with later host releases from this selector alone.

For acceptance, check Home, Plugins, Tasks, Chat, Context Insights, light/dark themes, sidebar collapse, the native right panel, and a Home modal. In a native conversation, verify the 8px bottom gutter at the end of a long chat and with an expanded composer, and confirm that tabs and title controls remain in place. Test dragging from header gaps separately from clicking the title/menu, badges, and buttons, including after large images have scrolled partly and fully above the visible message area. Verify that visible message controls, image previews, and portaled menus still work. CSS drag-region declarations alone do not establish measured window movement. Also check native drawer mode at a narrow window size before claiming that viewport state has been visually validated.

## Notification details

The bell is an owned sibling in the sidebar root, outside the Host brand button. It shares the search button's 53px top offset and 28px hit target, with a 4px gap to its left. Only the bell and feed own pointer/no-drag hit regions; their full-size seat is inert, so it cannot block title-bar dragging. The owned feed begins below New Chat at 136px and replaces the visible workspace region without reparenting React nodes; the header search remains usable. It uses the existing light/dark sidebar palette, title/excerpt rows and priority/recent groups. Escape closes and restores bell focus; collapsing closes the feed. The Home badge is 7px at the symbol's upper-right, the bell badge is 5px and row unread markers are 6px. All use the same model acknowledgement state. Disposal restores the previous mode attribute and removes only owned DOM, observers and subscriptions.
