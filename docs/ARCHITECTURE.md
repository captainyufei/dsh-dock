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
| Video object URLs and pending reads | Temporary preview lifecycle |
| Video position | Same tab and unchanged resource version; no restart guarantee |

置顶只改变展示位置，不改变工作区归属。首页提交在宿主确认接受后才清稿；不明确的结果不会自动重复提交。

Pinning changes where the chat is displayed, not its workspace membership. Home submissions clear the draft only after the host confirms acceptance. Uncertain results are not retried automatically.

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

在仓库根目录执行 `npm ci`、`npm run check`。`scripts/build.mjs` 将 `src/` 中的客户端代码及样式构建为 `dist/client.js`，并复制服务端入口、locale 与图标到 `dist/`。`npm run build:client` 可单独更新这些产物；直接调用构建脚本时，其路径解析不依赖当前工作目录。没有安装期构建钩子，普通安装直接使用已提交的 `dist/`。宿主适配以 `0.2.1-rc.5` 为验证基准；升级宿主后应重新验证注册接口、布局及工具预览。

Run `npm ci` and `npm run check` at the repository root. `scripts/build.mjs` bundles client code and styles into `dist/client.js` and copies the server entries, locales, and icon into `dist/`. Use `npm run build:client` for a standalone rebuild. The build script resolves paths relative to itself; installation has no build hooks and uses the committed `dist/` files. Host integration was verified against `0.2.1-rc.5`; recheck service registration, layout, and previews after host upgrades.

演示视频是独立文档资产，不随插件运行，不为业务代码引入动效制作依赖。

The demonstration video is a separate documentation asset. It is not part of the plugin runtime and does not introduce animation-production dependencies into the plugin.
