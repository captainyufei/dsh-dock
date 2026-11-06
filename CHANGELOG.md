# Changelog / 更新记录

Versions describe public DeepSeek Dock releases. Development changes are collected before a release; published packages are not overwritten. See [versioning](docs/RELEASING.md).

## 0.1.2 — 2026-11-06

- Fix installation and startup refusal after the Harness `0.2.2-rc.1` update. Explicitly support `0.2.1-rc.5 || 0.2.2-rc.1` and keep the optional UI primitive peer range aligned.
- Bind the official voice component's complete observable hook surface, including the new plugin-navigation hook, so Home renders the microphone on `0.2.2-rc.1`.
- Check supported and unsupported host versions, plus lockfile consistency, in the regression suite.
- Update bilingual installation and compatibility instructions.

修复升级 Harness `0.2.2-rc.1` 后因宿主版本声明过窄导致的安装和启动拦截；保留旧版支持，增加版本范围回归检查并同步双语说明。

- Keep the native running indicator visible in global pinned chats and update it as the host starts or finishes a run.
- Replace the crossed-out unpin glyph with a compact filled pin and a native hover tooltip.

置顶会话同步显示宿主运行标志，开始和结束运行时即时更新；取消置顶改用简洁实心图钉与原生悬停提示。

## 0.1.1 — 2026-11-03

- Use `0.1.1` for the current public package, without a prerelease suffix; retain the tested macOS / Harness `0.2.1-rc.5` scope.
- Present the five core features consistently: a persistent customizable left Dock, Codex-inspired UI, cross-workspace pinned chats, a home that creates chats only on send, and video previews in the right file panel.

- Make English the default repository README, with entirely English main-page copy and a dedicated Simplified Chinese translation.
- Separate UI installation and web-profile CLI installation, with localized installation screenshots and secondary details in collapsible sections.
- Use the repository URL for the latest `main` code by default; keep the fixed tag and ZIP as reproducible alternatives and explain that installed copies require reinstallation to update.
- Separate source modules, tests, build tooling, and runtime bundles into `src/`, `tests/`, `scripts/`, and `dist/`.
- Document the verified GitHub-tag installation flow, explicit activation, local ZIP fallback, third-party updates, and troubleshooting in both languages.
- Add a fully English 45-second demo, including interface labels, example content, captions, and its own poster.
- Add the same low-volume instrumental soundtrack to both language editions, with gentle fades.
- Expand both silent README GIFs to a 45-second feature walkthrough, including Dock customization, pinning, draft submission, and video playback; retain the music-backed MP4 editions and static previews.
- Explain the README's benefits through five everyday workflows instead of grouped feature slogans.
- Declare the community screenshot gallery in the repository-root `screenshots.json`.

当前版本统一为 `0.1.1`，去掉预发布后缀，已验证的平台与宿主范围不变。中英文 README 围绕左侧常驻可自定义 Dock、Codex 风格 UI、跨工作区置顶、发送才建会话的草稿首页和右侧视频预览说明功能。GIF 延长为 45 秒，完整展示自定义入口、置顶归位、草稿发送和视频播放；同步更新带音乐的双语 MP4 与静态图。此前未发版的仓库整理、英文主页、安装说明和音乐演示一并纳入本版。默认从仓库取得 `main` 代码；已安装副本仍需重新安装才能更新。旧版标签与历史记录保持不变。

## 0.1.0-beta.1 — 2026-11-01

First public beta of **DeepSeek Dock** under the package identity `@captainyufei/dsh-dock`.

- Persistent, customizable Dock with native navigation and local ordering preferences.
- Global pinned chats without duplicate workspace rows, plus native chat context menus.
- Draft-first Home: creating a chat is deferred until send.
- Consistent outer frame and a single toggle that restores existing tool tabs.
- Video playback in native file previews, with hidden-preview pause and same-tab position restoration.
- Installable source layout, prebuilt client, bilingual documentation, and a simulated feature demo.
- Compatibility target: macOS with Harness `0.2.1-rc.5`.

首次公开测试版：常驻可定制 Dock、跨工作区置顶、原生会话右键菜单、独立首页草稿、统一外框/工具切换和侧边视频播放。整理了可安装源码结构、预构建客户端、中英文说明与模拟演示。

This release derives from the locally developed `@local/chatgpt-rail` 2.7.1 baseline. That numbering belongs to a separate local package; it is not an earlier public DeepSeek Dock release. Existing users should follow the [migration guide](docs/MIGRATION.md).

新版本线从 0.x 开始，旧 2.7.1 是本地开发包的历史编号，升级方式见[迁移说明](docs/MIGRATION.md)。
