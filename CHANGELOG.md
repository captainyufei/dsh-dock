# Changelog / 更新记录

Versions describe public DeepSeek Dock releases. Development changes are collected before a release; published packages are not overwritten. See [versioning](docs/RELEASING.md).

## Unreleased — Repository, documentation, and demos / 仓库、文档与演示

- Make English the default repository README, with entirely English main-page copy and a dedicated Simplified Chinese translation.
- Separate UI installation and web-profile CLI installation, with localized installation screenshots and secondary details in collapsible sections.
- Use the repository URL for the latest `main` code by default; keep the fixed tag and ZIP as reproducible alternatives and explain that installed copies require reinstallation to update.
- Separate source modules, tests, build tooling, and runtime bundles into `src/`, `tests/`, `scripts/`, and `dist/`.
- Document the verified GitHub-tag installation flow, explicit activation, local ZIP fallback, third-party updates, and troubleshooting in both languages.
- Add a fully English 45-second demo, including interface labels, example content, captions, and its own poster.
- Add the same low-volume instrumental soundtrack to both language editions, with gentle fades.
- Explain the README's benefits through five everyday workflows instead of grouped feature slogans.

新增全英文宣传片；中英文演示加入轻量背景音乐；用切换页面、查找会话、恢复工具、核对视频和整理草稿五个场景说明用途。实测固定 Git 版本的安装与启用；补充 ZIP 备用方式、更新及排错步骤。英文主页正文清除中文；安装分为界面与 web profile CLI 两个入口，增加对应语言截图。默认使用仓库地址取得 `main` 最新代码；固定标签与 ZIP 保留为可复现备用，并说明这不是最新稳定发布、已安装副本不会自动更新。源码、测试、构建工具与运行产物分别整理到 `src/`、`tests/`、`scripts/`、`dist/`。插件版本和已有标签不变。

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
