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

Public repository creation, independent final review, initial hosted CI and release download verification are recorded after publication.
