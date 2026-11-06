# 版本与发布 / Versioning and releases

The source of truth is `package.json.version`. Release tags use `v<version>` and must agree with the package metadata and changelog.

以 `package.json.version` 为唯一版本源；标签、安装包和 CHANGELOG 必须一致。

## Version policy

| Change | Example |
|---|---|
| Work in progress | Git commits; no release for each UI adjustment |
| Optional pre-release testing | `0.2.0-beta.1` → `0.2.0-beta.2` |
| Current public version line | `0.1.2` |
| Compatible fixes | `0.1.1` → `0.1.2` |
| New capability | `0.1.1` → `0.2.0` |
| Breaking change before 1.0 | Increment the minor version and provide migration notes |
| Stable behavior, configuration, and upgrade commitments | `1.0.0` |
| Breaking a public commitment after 1.0 | Increment the major version |

`0.1.2` remains early-stage `0.x` software. Its explicit host range is `0.2.1-rc.5 || 0.2.2-rc.1` on macOS; it does not automatically admit later release candidates. The compatibility matrix is checked alongside the package and lockfile metadata. The pre-1.0 minor/patch distinction above is this project's maintenance convention. Version numbers are not decimals: `0.9.0` can be followed by `0.10.0`. See [Semantic Versioning](https://semver.org/).

日常改动先累计为提交；常规兼容修复按 `0.1.1` → `0.1.2` 递增，不需要 beta 后缀。只有需要预发布测试时，才使用可选的 beta 序号。发布后的包不可覆盖，修正后发行新版本。普通文档修改无需单独发布运行包。

## Before publishing

1. Update the version and changelog; synchronize the lockfile's root package version.
2. Run `npm ci` and `npm run check`. Inspect and commit the rebuilt `dist/` runtime and package identity. CI verifies that a clean rebuild does not change `dist/`.
3. Review `npm pack --dry-run`, then pack the exact files to distribute. Keep personal data, caches, development dependencies, and unrelated history out of the archive.
4. Install that artifact in a clean Harness profile at the declared supported version. Check Home, conversation, tasks, plugins, Dock collapse, pins, drafts, tools, and video playback.
5. Verify disable/uninstall cleanup and the old-local-package migration path. Check keyboard access, IME handling, and reduced motion.
6. Confirm bilingual documentation, asset links, known limits, license, and third-party notices. A simulated demo is not installation or performance evidence.
7. Create the matching tag and release. Record the artifact hash; download and verify the final hosted artifact.

Before expanding `engines.dsh`, test each new baseline. Some UI integration uses host DOM structure, so a successful package install alone does not prove layout compatibility.

发布前必须使用最终安装包验证，而不仅是在原开发目录验证。测试与安装应记录实际结果；未测平台或功能不写成已支持。

## Distribution

The current `main` branch and future releases contain the complete prebuilt runtime in `dist/`, with package exports pointing there. The historical `v0.1.0-beta.1` tag is unchanged and keeps its runtime files at the repository root. For either layout, install from the repository root so Harness can read `package.json` and `cordis.patch.yml`; no install/prepare build hooks are needed. Source modules, tests, demo assets, and development scripts are excluded from the runtime `.tgz`.

A runtime `.tgz` can be attached to a release after it is validated. Keep `dsh-dock.tgz` stable if documentation uses a `latest/download/dsh-dock.tgz` URL; use a tag-pinned URL for versioned filenames.

The npm package identity is prepared for future distribution, but the package is not published to npm. Verify ownership of the target npm scope before publishing. When npm distribution is enabled, configure the actual repository and workflow using [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

Community listing is separate from code publication. Submit the real repository and an accurate description under `ui` to [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md). The current contribution rules require a working `dsh.bundle`, the `dsh-plugin` topic, and a repository at least one day old; review is not automatic.

发布 GitHub 不等于已被社区收录。提交前再次核对社区的当前规则，公开 npm 包也不是收录前提。
