# Public release verification

Release candidate: 1.0.0, prepared 2026-11-03. This repository starts with a clean public history.

| Check | Result |
| --- | --- |
| Tests | 136 passed, zero failures |
| ESLint / syntax / manifest | Passed |
| Strict JSDoc type checking | Passed |
| Runtime coverage | Lines 93.43%, functions 87.24%, branches 88.86%; each ≥80% |
| Dependency audit | Zero findings at low-severity gate |
| Public-source check | Passed across the tracked source tree |
| Installable archive | 11 allowlisted runtime/license files, all scanned |

The lockfile uses only the public npm registry. ESLint 10.14.0 with minimatch 11.0.1 addresses GHSA-g3hv-75wg-m249; runtime dependencies remain empty. CI actions use immutable commits from official repositories. The archive includes the MIT notice.

No original commit history, browsing export, private task notes, private screenshots or private project configuration are included. Git fixtures use reserved example/test hosts; defaults contain only GitHub and GitLab, with empty personal project/allowlist lists. This is automated and source/package verification of the sanitized build, not a new live acceptance claim for every Chromium browser.

## Published result

- Public repository: [Beants/chromium-tab-maintainer](https://github.com/Beants/chromium-tab-maintainer), default branch `main`, MIT license recognized.
- Source release: [v1.0.0](https://github.com/Beants/chromium-tab-maintainer/releases/tag/v1.0.0), source commit `8cc2f9b4ee0b84715ae38080f901559771153500`.
- Hosted validation: [initial CI](https://github.com/Beants/chromium-tab-maintainer/actions/runs/41596454904) passed all steps, including public-source checks, audit and packaging.
- Independent publication review approved the sanitized source and archive with no unresolved blocker before repository creation/push.
- Anonymous repository HTTP access returned 200. Anonymous release download succeeded and matched the local archive SHA-256.
- Installable ZIP: `chromium-tab-maintainer.zip`, 25,705 bytes, 11 allowlisted runtime/license files.
- ZIP SHA-256: `3368d8b2e6855125030f40c06739fe04e5dc0bc5b1af195a40fcdda41d1ae7f0`. A checksum file is attached to the release.
- Private vulnerability reporting is enabled. All commits use the maintainer's GitHub noreply address.

The release is a GitHub source/ZIP release, not a Chrome Web Store listing. Publication did not replace an existing user's locally installed extension or configuration.
