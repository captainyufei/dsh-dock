# Harness compatibility and update delivery / 兼容性与更新交付

## 维护决定

Dock `0.2.2` 使用有上界的准入范围 `0.2.1-rc.5 || >=0.2.2-rc.1 <0.2.3-0`。`compatibility.json` 单独记录已完成相应验收的 Host 基线，验收范围沿用各次发布说明。新候选版即使允许加载，也会在维护核查中作为待验证版本提示。

这次升级的起点是 Dock `0.2.0` 只允许 `0.2.1-rc.5 || 0.2.2-rc.1`，而当前 Host 为 `0.2.2-rc.2`。同时，旧安装来源是固定 TGZ，缺少原生版本更新入口。

| 证据 | 类型 | 结果与适用范围 |
|---|---|---|
| 当前应用及旧安装包清单 | artifact | 确认 `rc.2` 被旧范围拦截 |
| Host rc.2 发布说明与真实 UI | artifact / observed | 导航和会话共用滚动容器，菜单采用 CSS anchor 定位 |
| 新版浏览器验收 | observed | 展开、折叠、1440/800/480 px 宽度、草稿保留、应用与全局搜索、间隙拖动、菜单、通知，以及最终 TGZ 的停用清理和重新启用通过 |
| 包与回归检查 | observed | TGZ 安装于独立 profile，确认实际加载包的 `0.2.2` 版本、运行组件及客户端内容一致 |
| 后续 `0.2.2` 候选版 | missing | 随版本发布补充验收记录 |

[Host 兼容规则](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.2/docs/upgrade-guide/v0.2.1-alpha.3/plugin-engines-dsh/guide.md) [Host rc.2 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.2)

## 本次适配

`rail-layout.js` 通过公开的 `sidebar` 槽位定位完整侧栏。它兼容直接导航结构和新增滚动容器，折叠时沿用结构判断，因为 Host 会移除 `data-sidebar-scrollport`。通知、置顶展示与 Dock 背景事件复用这个适配层。新滚动结构中的置顶区域保留自身高度，长会话列表在工作区区域滚动。停用会恢复插件拥有的标记和监听。

自定义菜单同时提供新版 `anchorPoint` 和此前的 `getAnchorRect`。原生 Menu 处理视口边界和键盘交互。新侧栏的搜索入口保留在原生工作区工具栏中。

后续继续优先使用原生服务和槽位。对可选功能增加能力判断和独立清理，逐步缩小 DOM/CSS 依赖。Home 的创建、提交和附件继续由 Host 控制器处理，发送结果不明确时保留草稿并等待用户处理。

## 发现上游更新

```sh
npm run check:compatibility -- --upstream --report artifacts/host-compatibility.json
npm run check:compatibility -- --host 0.2.2-rc.2 --profile /absolute/path/to/profile
```

核查读取官方 GitHub 最近 100 个 releases，选择 SemVer 最高的已发布 `dsh-v` 版本，包含 RC。它核对准入范围、`compatibility.json` 的验收记录，以及显式指定 profile 内本包的实际版本和来源。报告省略原始来源 URL 的查询参数及其他插件信息。

退出码 `0` 表示声明允许且存在所需验收记录，`1` 表示范围、包身份或验收记录需要处理，`2` 表示参数、读取或网络失败。每次核查引用已保存的验收记录，真实 Host 测试由对应发布执行。

`.github/workflows/compatibility.yml` 计划每 4 小时运行完整检查和上游核查，也支持手动指定 Host 版本。失败保留 JSON，Actions 通知遵循维护者的 GitHub 设置。GitHub 调度可能延迟。范围内的新 RC 会因缺少验收记录触发失败，维护者验证后再更新记录。

## 分发和升级

Host rc.2 原生更新支持自己名称下的 registry 依赖，以及固定完整 40 位提交的 Git 依赖。Git 的版本发现通过插件索引提供。TGZ、本地目录、分支或标签来源通过插件管理器或官方 CLI 安装同名新包，并核对保存的依赖和锁文件。

正式 registry 分发使用同名 npm 包。npm 发布需要对应 scope 的账号授权，GitHub Release 提供固定版本 TGZ、ZIP 和校验值。Git 来源可使用发布提交的完整 SHA，以满足 Host 的 Git 更新来源要求。

[Host 原生更新与恢复机制](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.2/packages/boot/plugin-manager/README.md)

宝玉的共享插件查询 npm 版本，提供侧栏标签和更新面板，再调用 Host 安装接口。Dock 可以复用这种提醒交互，安装和恢复继续调用 Host。插件被拒绝加载时，需要通过 Host 管理页和分发渠道提供恢复入口。

[宝玉更新器](https://github.com/JimLiu/baoyu-design/blob/v2.15.2/dsh-plugins/dsh-claude-artifacts/lib/index.js)

## 补丁发布

1. 核查新 Host，阅读对应变更，在隔离 profile 复现并修复受影响的适配层。
2. 更新补丁版本、CHANGELOG、锁文件和验收记录，运行 `npm run prepare:release`。
3. 检查最终安装包，确认加载、相关功能、停用清理及升级前后的偏好保留。
4. 推送源码和对应的 `v*` 标签。Release 工作流生成草稿，上传版本 TGZ、稳定名称 TGZ、ZIP 和 SHA-256，再下载校验。
5. 发布已验证的版本，核对正式安装来源，从旧版执行同名升级并确认运行版本。

保留原发布包以便恢复。原生更新失败时会尝试恢复旧包，最终恢复结果取决于来源的可达性。源码变更、Host 接口变化或真实升级失败时，重新检查相应的兼容判断和验收范围。

English guidance is available in the release policy and changelog. Admission covers the bounded 0.2.2 line. Validation evidence is recorded per Host version, and scheduled checks also flag newly published candidates inside that range.
