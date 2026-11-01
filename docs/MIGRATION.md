# 从本地旧版迁移 / Migrating from the local build

| Identity | Local development build | Public beta |
|---|---|---|
| Display name | ChatGPT 风格图标栏 / DeepSeek 工作台 | DeepSeek Dock |
| Package | `@local/chatgpt-rail` | `@captainyufei/dsh-dock` |
| Version line | Up to `2.7.1` | Starts at `0.1.0-beta.1` |

这是两个不同的包身份。新编号不代表功能退回，也不能依赖旧包的自动更新跨包迁移。

These are different package identities. The new version number does not remove existing features, and the old package's automatic update mechanism cannot switch identities for you.

## 迁移步骤 / Steps

1. 在原窗口完成或保留未发送内容；附件仅存在内存中，重新加载后需重新选择。保存旧插件目录，便于回退。
2. 在 Harness 插件页停用旧 `@local/chatgpt-rail`，确认没有旧版在其他位置重复启用。
3. 按 [README](../README.zh-CN.md#安装) 安装 DeepSeek Dock，只启用新版。不要让两套布局同时运行。
4. 按宿主提示重新加载或重启，再检查 Dock 顺序、草稿文字、置顶会话和右侧工具。
5. 确认新版正常后，可从宿主插件页移除旧包；不用删除任何会话或工作区。

1. Preserve unsent work and keep the old plugin directory for rollback. Attachments live in memory and must be selected again after reload.
2. Disable `@local/chatgpt-rail` in Harness and check for duplicate enabled copies.
3. Follow the [README](../README.md#install) to install DeepSeek Dock. Enable only the new package so two layouts do not run together.
4. Reload or restart when prompted; check Dock order, draft text, pins, and existing tools.
5. After validating the new build, remove the old package through Harness if desired. Do not delete chats or workspaces.

## 保留哪些数据 / Data retained

- Chats, workspaces, native pin state, and tool tabs belong to Harness; this plugin does not move them into a new store.
- Draft text/options and Dock preferences keep their existing local storage keys. The identity change does not intentionally reset them.
- Preferences belong to the same browser/desktop profile. Moving to a new profile or clearing its local data does not migrate preferences automatically.
- Unsent attachment objects and temporary media are not persistent backups.

会话、工作区、置顶和工具标签由宿主管理；草稿与 Dock 偏好沿用现有存储键。保留键名不等于跨浏览器或跨 profile 同步，也不替代迁移后的实际检查。

## 回退 / Rollback

停用 DeepSeek Dock 后重新启用保存的旧版；不要同时启用。旧版本的兼容性仍以它原来支持的宿主版本为准。

Disable DeepSeek Dock before re-enabling the saved old package. Do not enable both. The old package still requires the host version it originally supported.
