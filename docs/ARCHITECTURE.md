# 技术说明 / Technical notes

这些说明对应 DeepSeek Dock（`@captainyufei/dsh-dock`）的公开版本。面向使用者的功能与限制见 [中文 README](../README.zh-CN.md) / [English README](../README.md)。

## 接入方式 / Integration

```text
DeepSeek Harness
  ├─ Native layout, chat, workspace and tool services
  │    └─ src/client-entry.js → Dock / pins / home draft / window chrome
  └─ Authenticated connection + file-system provider
       └─ src/index.js → src/video-route.js → native document preview
```

插件通过宿主注册槽位和服务接入，不替换主程序。React、原生菜单、会话操作、文件／终端／浏览器及工具标签由宿主提供。卸载时恢复自身布局标记并清理监听与挂载节点。

The plugin registers with host slots and services instead of replacing the application. React, menus, chat actions, file/terminal/browser tools, and tool tabs are provided by the host. Disposal removes the plugin's markers, listeners, and mounts.

## 目录结构 / Repository layout

```text
src/                  Source modules, styles, and locale JSON
tests/                Behavior and lifecycle tests
scripts/              Build and install-package verification
dist/                 Committed runtime: client, server, locales, icon
assets/               Source icon and README illustrations/media
demo/                 Rebuildable simulated video project
docs/                 Architecture, migration, release notes
screenshots.json      Community gallery manifest, paths relative to this root
package.json          Package identity, exports, host compatibility
cordis.patch.yml      Host bundle activation
```

`src/` 保持原有模块间的相对引用。`dist/` 是宿主实际加载的完整预构建目录，随源码提交；安装入口仍是包含 `package.json` 和 `cordis.patch.yml` 的仓库根目录。`screenshots.json` 列出展示图片，路径相对清单文件。

Relative imports stay within `src/`. Harness loads the committed runtime through the package's `dist/` exports. Install the repository root, which contains `package.json` and `cordis.patch.yml`, rather than the `src/` or `dist/` directory. Gallery paths in `screenshots.json` are relative to that manifest.

## 状态归属 / State ownership

| State | Owner |
|---|---|
| Chats, workspaces, pin state, tool tabs | Harness |
| Dock selection/order, home draft text and options | Plugin local preferences |
| Unsent attachment objects | In-memory draft; reselect after refresh |
| Main-page and Session navigation history | In-memory per window; up to 80 visits, reset on reload/disposal |
| Video object URLs and pending reads | Temporary preview lifecycle |
| Video position | Same tab and unchanged resource version; no restart guarantee |

置顶只改变展示位置，不改变工作区归属。首页提交在宿主确认接受后才清稿；不明确的结果不会自动重复提交。

Pinning changes where the chat is displayed, not its workspace membership. Home submissions clear the draft only after the host confirms acceptance. Uncertain results are not retried automatically.

## 会话右键菜单 / Session context menus

Harness `0.2.2-rc.1` 的内置会话操作由 `contextMenus` 服务提供，旧 `sidebar.workspaces.session.menu.item` 仅保留扩展项。插件每次右键时通过可选的 `ctx.get('contextMenus')` 检测服务，捕获目标会话后调用宿主菜单；权限、第三方菜单项、弹窗及焦点恢复仍由宿主处理。旧宿主缺少此服务时，继续使用原来的槽位镜像，不增加新包的强制依赖。关闭或卸载时仅关闭插件自己打开且仍然活跃的那一次菜单，不能按会话 ID 关闭其他入口的菜单。

On Harness `0.2.2-rc.1`, built-in Session actions belong to `contextMenus`; the legacy Slot retains extension contributions only. Each gesture optionally looks up the service with `ctx.get('contextMenus')` and opens the native menu for the captured Session. Older hosts retain the Slot-based fallback without a new required package. Cleanup compares the exact active target object so it cannot close another trigger's menu for the same Session.

## 应用 Dock / Application Dock

`app-dock-model.js` 将已注册的侧栏页面入口与 `main` 页面键取交集，作为真实可打开的应用目录。固定顺序仍使用原 Dock 偏好；所有固定应用都可显示在可滚动图标区，不受旧六项容量限制。当前页面用选中标记表示；窗口内最近使用记录最多五项，未固定的最近应用放在分隔线后。移除图标只改展示偏好，不停用或卸载插件。

The application overview provides search, pinned/recent filters and real native page launch. This is an application launcher, not an OS process/window manager: current Harness renders only the selected main page, and a page's local React state may unmount on switching. The Dock does not claim background running, minimization, independent windows or full page-state restoration. Backend-only plugins remain in the native plugin manager.

`app-dock-host.js` appends one owned presentation seat beside the mounted native contributions. The original sidebar icon components stay mounted (including Home's layout lifecycle); CSS only hides their duplicate navigation presentation. `app-icons.js` reads existing SVG/IMG artwork into safe display images. It never reinvokes a plugin's component, injector or store. Unknown images fall back to a plain initial. Sanitized SVG images use a currentColor mask, while the Plugins and Tasks symbols retain the previous rail artwork. Package metadata cannot be reliably mapped to page contributions through minified `registrant`, so the Dock does not guess installed package identities or invent launch targets.

## 窗口导航 / Window navigation

macOS 左上角按「返回、前进、原生侧栏开关」排列。Harness 当前没有全局页面历史接口；`window-navigation-model.js` 观察 `layout.panelInfo`、`uiWorkspace.selection` 和会话目录，在插件内记录访问，再通过原生 `layout.selectPanel` / `uiWorkspace.openSession` 恢复目标。旧宿主没有 selection observable 时，使用会话的 `retainedBy.mainView` 兼容读取。模型不创建或保留会话，不替换宿主方法，不使用浏览器历史。

Navigation records global main panels and existing Sessions, not page-internal tabs, scroll offsets, embedded browser history, or right-tool layout changes. Synchronous Host selection/panel notifications are batched into one visit. New visits discard the forward branch; deleted/archived Sessions and unregistered panels are skipped. Empty history disables the corresponding button. Host navigation errors remain visible without advancing the history cursor. Unloading the chrome disposes all subscriptions and discards its in-memory history.

## 会话提醒 / Session notifications

`notification-model.js` combines pending approval/question/plan-review state with committed `turn/end` events from passive `remote.session.events` (`page` fallback). A stopped/running flag is only a signal to re-read history, never evidence of successful completion. Each visible root chat keeps its latest real result, event sequence, completion timestamp and a 180-character answer excerpt. Cancelled, errored, blocked and interrupted turns retain their own outcome; fork backfill ends are ignored. Blank, archived, removed and subagent chats are excluded.

A versioned localStorage record stores the start boundary and up to 200 per-session results plus independent acknowledgement. Historical completions before first activation are shown as read unless the Host still explicitly reports unread; earlier viewed/unviewed status cannot be reconstructed. Completions after activation become unread even for the current main conversation, and survive reload. Opening the inbox does not acknowledge anything. Successful selection navigates through `uiWorkspace.openSession`, acknowledges only the selected result sequence, and leaves the feed open. Newer results arriving during navigation remain unread; failed navigation never clears them. Mark-all-read does not dismiss pending native interactions. Storage failures remain visible.

Initial history reads cover all visible roots, newest first, with concurrency three. Session/status changes trigger targeted refreshes. A 30-second passive reconciliation retries recent chats, failed reads and every older task still waiting for its committed end record, covering reconnect and running/end write races. A confirmed Host legacy-log migration refusal is reported separately and excluded from periodic error retries; opening the inbox or a later catalog change can retry it. Other failures remain visible and retryable. No model request, Session activation, task mutation or production test event is used. Observers, timers and requests are disposed with the plugin.

The Home badge and sidebar bell use the same unread/pending count, independent of the number of read history entries. The bell toggles an owned sidebar feed below New Chat, with priority and recent-result groups. Native workspace/ pinned content stays mounted but hidden while the feed is open, preserving its state. Escape restores focus to the bell; collapsing the sidebar closes the feed. Conversation (Host activePanelId === null) shares the Home navigation highlight; real panel IDs and navigation history are unchanged.

## 全局搜索 / Global search

`global-search-model.js` 在打开期间订阅宿主会话与工作区目录。标题、工作区和操作在本地匹配；聊天正文使用原生 `sessions.search(query, AbortSignal)`，180ms 防抖、500字符上限。关闭或换词会取消旧请求，结果再次与可见、非空、未归档会话目录取交集。错误显示在浮层内，不清空可用的标题结果。搜索不创建或 retain 会话；工作区选择只修改首页草稿的 workspaceId，再打开首页。

The permanent `shell.overlay` contribution renders the Host Modal with grouped results and categories. Native focus trapping, Escape, backdrop dismissal and focus restoration are retained. Arrow keys and Enter select results, with IME composition guarded. Theme colors use Host tokens; unsupported global file/document catalogs are not advertised.

If the Host reports that its session-query index is disabled, the palette removes the Text category, keeps local title/workspace search and explains the limitation without internal exception details. It does not retry that unavailable API until the plugin reloads or change the Host's indexing configuration. The current local `0.2.2-rc.1` deployment has this index disabled; body-search behavior is covered with API fixtures, not live content results.

`global-search-entry.js` captures the marked sidebar search click before the inline filter opens. Desktop shortcuts are dispatched outside DOM keydown, so Harness `0.2.2-rc.1` needs a capability-detected adapter over the existing `shortcuts.registry.commands.get('session.search').resolve`. The adapter preserves native resolution, user bindings and catalog metadata, replacing only a handled run. This is a version-sensitive internal API, not a public override contract. Missing/read-only capability leaves native keyboard behavior intact while the mouse palette works. Cleanup restores only its own resolver, respects later owners and handles command-object replacement.

## 视频路径 / Media path

插件在认证连接内注册 `/api/chatgpt-rail/media`，沿用宿主文件系统 provider 的访问权限。读取支持 GET、HEAD 和单段 Range；分块读取可取消，遵守背压，并检查文件版本变化。

The authenticated media route uses the host file-system provider's access rules. GET, HEAD, and single-range requests are supported. Chunked reads handle cancellation, backpressure, and file version changes.

- **HTTP(S) browser:** Range-capable media URL.
- **Current Desktop:** custom-protocol seeking limitations require a complete temporary Blob before playback.
- **Budget:** 256 MiB for reserved/in-flight and retained media bytes across the desktop source pool; not an RSS or decoder-memory cap.
- **Cleanup:** hiding or unmounting the preview cancels reads, pauses the element, clears its source, and revokes the object URL.
- **Fallback:** unsupported codecs or files beyond the budget keep the host's external-open option.

不会改写、转码或上传原视频，也没有额外本地媒体服务器。视频控件由浏览器提供，焦点样式只统一颜色与圆角，保留原生焦点显示时机和键盘可用性。

The plugin does not rewrite, transcode, or upload the video and does not start an extra local media server. Controls remain browser-native. The focus styling changes only color and rounding, retaining native timing and keyboard access.

## 构建与兼容 / Build and compatibility

在仓库根目录执行 `npm ci`、`npm run check`。`scripts/build.mjs` 将 `src/` 中的客户端代码及样式构建为 `dist/client.js`，并复制服务端入口、locale 与图标到 `dist/`。`npm run build:client` 可单独更新这些产物；直接调用构建脚本时，其路径解析不依赖当前工作目录。没有安装期构建钩子，普通安装直接使用已提交的 `dist/`。宿主适配保留 `0.2.1-rc.5` 功能基线，并完成 `0.2.2-rc.1` 的加载与交互升级验收；升级宿主后应重新验证注册接口、布局及工具预览。

Run `npm ci` and `npm run check` at the repository root. `scripts/build.mjs` bundles client code and styles into `dist/client.js` and copies the server entries, locales, and icon into `dist/`. Use `npm run build:client` for a standalone rebuild. The build script resolves paths relative to itself; installation has no build hooks and uses the committed `dist/` files. Host integration retains the `0.2.1-rc.5` feature baseline and adds loading and interaction upgrade checks on `0.2.2-rc.1`; recheck service registration, layout, and previews after host upgrades.

演示视频是独立文档资产，不随插件运行，不为业务代码引入动效制作依赖。

The demonstration video is a separate documentation asset. It is not part of the plugin runtime and does not introduce animation-production dependencies into the plugin.
