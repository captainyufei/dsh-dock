# Contributing / 贡献指南

Bug reports and focused fixes are welcome. Please include the Harness version, operating system, DeepSeek Dock version, steps to reproduce, and expected/actual behavior. Use sample data and remove private chat content from screenshots.

欢迎提交问题和小范围修复。请附宿主版本、系统、插件版本、复现步骤和预期/实际表现；截图请使用示例数据或隐藏私人内容。

## Local checks

```sh
npm ci
npm run check
```

The runtime shares Harness's React. Do not bundle a second React copy, patch the host application, or replace native chat/workspace storage. Preserve native permission checks and confirmation flows.

For UI changes, check the real client at the declared host version: expanded/collapsed navigation, existing tool restoration, keyboard input, and disposal. Automated tests and simulated videos are useful evidence but do not replace on-device acceptance.

Changes involving drafts, pin state, media access, or migration should have tests for their failure and cleanup paths. Keep new dependencies justified and third-party attribution intact.

For documentation, keep Chinese and English behavior claims aligned. State what was actually tested; avoid expanding platform or codec claims without evidence. Follow the [version policy](docs/RELEASING.md) and note user-visible changes in [CHANGELOG](CHANGELOG.md).

Source modules and styles live in `src/`, tests in `tests/`, and build/package checks in `scripts/`. `npm run build:client` rebuilds all runtime files in `dist/`, including the browser bundle, server entries, locales, and icon. Commit the updated `dist/` with source changes so installation from GitHub does not require a build. Do not edit generated files directly.

源码与样式位于 `src/`，测试位于 `tests/`，构建与包检查脚本位于 `scripts/`。修改源码后使用 `npm run build:client` 更新并一同提交 `dist/`；不要直接编辑构建产物。模块职责及目录结构见[架构说明](docs/ARCHITECTURE.md)。
