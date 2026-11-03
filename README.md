# Chromium Tab Maintainer

**本地标签页自动整理：Git 项目去重、过期清理、排序、恢复和实时进度。**

[中文说明](README.zh-CN.md) · [Download v1.0.0](https://github.com/Beants/chromium-tab-maintainer/releases/tag/v1.0.0) · [Privacy](PRIVACY.md) · [MIT](LICENSE)

A local-first Manifest V3 extension for Chromium browsers. No server, telemetry, API key, or LLM. The settings UI is currently Chinese.

## Features

- **One Git tab per repository per window.** Keep the most recently visited page for each GitHub/GitLab repository. Nested GitLab namespaces and self-hosted Git aliases are supported; different hosts and windows remain separate.
- **Hourly cleanup.** URL containment deduplication, 24-hour same-host consolidation, recognized temporary-page cleanup, and configurable seven-day expiry.
- **Immediate disposable-page cleanup.** Discarded tabs, recognized error pages, the Baidu homepage, and built-in New Tab pages do not wait seven days.
- **Project/site sorting.** Keep related tabs together. Existing tab groups and split views preserve their window's order.
- **Manual one-shot mode.** Run while automatic maintenance is paused, without the automatic idle/30-second wait. This does not enable automatic maintenance.
- **Visible progress.** A sticky top toolbar shows the current stage, processed counts, confirmed closes/moves and failures; Pause remains available.
- **Local recovery.** Reopen individual URLs or batches from a 30-day journal. Restored pages receive a 24-hour cleanup cooldown.

## Install

1. Download and unzip the [release archive](https://github.com/Beants/chromium-tab-maintainer/releases/latest), or clone this repository.
2. Open your browser's extensions page (`chrome://extensions`, `edge://extensions`, or its equivalent), enable Developer mode and choose **Load unpacked**.
3. Select the unzipped folder containing `manifest.json`, or the repository's `extension/` folder.
4. Click the extension icon to open settings. Installation starts **paused**.
5. Preview the rules, verify isolation using disposable tabs in two windows, then select **窗口隔离测试已完成**. Enable automatic maintenance if desired, or click **立即整理一次** for one manual run.

Maintenance examines windows in the current browser profile independently. It is **not restricted to the settings page's window**. Active and pinned tabs, known unsaved edits, playback/capture signals, allowlisted hosts, groups/split views, unknown live-page safety and restore cooldowns remain protected. Protection can temporarily leave more than one tab for a repository.

## Browser compatibility

Targets Chrome 121+ and Chromium browsers exposing the same Manifest V3 APIs. The minimum follows [`tabs.Tab.lastAccessed`](https://developer.chrome.com/docs/extensions/reference/api/tabs); newer split-view fields are optional. The core implementation was exercised in Ego Lite during development. This sanitized public build has automated coverage; separate live acceptance in Chrome, Edge and Brave remains pending; loading successfully is not a guarantee that a browser-specific workspace maps one-to-one to Chrome windows.

The released code uses `chrome.tabs.windowId` for isolation. In a browser with workspaces/Spaces, verify that mapping before enabling effects. Web Store publication, Firefox and Safari are outside this release.

## Rules and settings

The defaults contain GitHub/GitLab aliases and no private project rules or allowlist entries. Add a self-hosted Git server in **站点别名组** using exact hostnames:

```json
[{"key":"git","label":"Git","hosts":["github.com","gitlab.com","git.example.com"]}]
```

Project patterns affect sorting. The allowlist accepts exact hostnames. See [中文规则说明](README.zh-CN.md#整理规则) for the cleanup boundaries and [architecture](docs/architecture.md) for the implementation.

URL matching intentionally ignores query parameters named exactly `id` and wholly numeric path segments, then applies bidirectional URL containment. **Different numbered items can therefore be deduplicated.** Other query parameters and fragments remain significant. Git repository grouping uses its own repository identity instead of the generic host/URL merge.

Recognized temporary sites are explicit rules in `extension/temporary.js`; arbitrary business pages are not guessed. Unknown pages still follow the configured expiry policy. Automatic cleanup waits for browser idle and navigation/interaction stability. Manual mode bypasses those automation waits, but keeps isolation verification and page protections.

## Privacy and recovery limits

The extension reads tab metadata and locally compares form/media state to detect protection signals. Only safety booleans and timestamps leave the page probe; form values are not transmitted to the background controller. URLs, titles, rules and recovery records stay in browser-local storage, which is not encrypted by this extension. URLs may contain sensitive query parameters or fragments. There is no outbound service or analytics. See [PRIVACY.md](PRIVACY.md).

Recovery reopens the original URL; it does not restore form contents, scroll position or arbitrary application state. Detection of unsaved edits and screen sharing is best effort. If recovery is uncertain, maintenance pauses until reviewed and explicitly re-enabled.

## Develop

Node.js 22.13+ and `zip` are required; there are no runtime dependencies.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run coverage
npm run check:public
npm audit --audit-level=low
npm run package
```

The installable archive is `dist/chromium-tab-maintainer.zip`. Public-source checks inspect tracked files, so stage new source files before running `check:public`. CI runs lint, types, tests/coverage, dependency audit, public-source checks and packaging. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Beants.
