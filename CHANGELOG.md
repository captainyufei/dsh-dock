# Changelog / 更新记录

Versions describe public DeepSeek Dock releases. Development changes are collected before a release; published packages are not overwritten. See [versioning](docs/RELEASING.md).

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
