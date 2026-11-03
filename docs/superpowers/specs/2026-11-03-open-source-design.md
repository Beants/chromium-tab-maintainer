# Public Chromium release

Baseline: a new, independent `main` repository; no private development history is imported.

## Problem Statement

Publish a usable local Chromium extension with reproducible checks and documentation, without personal defaults, browsing data or internal infrastructure references.

## Success Metrics

- Zero private hostnames, credentials, browser exports or private development artifacts in tracked files, Git history and the installable archive.
- Lint, types, tests and public-source checks pass; runtime line/function/branch coverage each ≥80%.
- Dependency audit has zero findings at the configured low-severity gate.
- Public GitHub repository and a versioned installable release are readable without authentication; initial CI passes.

## User Stories

As a user, I can install the released ZIP and understand scope, protections and recovery limits.
As a contributor, I can reproduce checks without internal registries or private accounts.
As the maintainer, I can publish this source without disclosing personal browsing configuration.

## Acceptance Criteria

- [x] Fresh public history, public Git defaults and no personal project/allowlist rules.
- [x] Company-specific page classifiers removed, generic core behavior preserved and tested.
- [x] MIT license, installation instructions, privacy, security and contributor documentation included.
- [x] Public npm lockfile and immutable official CI action references.
- [x] Mechanical public-source checks and a reviewed installable archive.
- [x] Independent review has no unresolved blocker; code/test review ≤2 rounds.
- [x] Public repository, versioned release asset and CI verified.

## Non-Goals

Web Store submission, a hosted service, LLM behavior, importing private history and claiming unperformed browser acceptance.

## Constraints

Use current MV3 permissions and no runtime dependencies. Chrome 121+ is the API baseline; workspace mapping requires live verification. Preserve existing local deployment separately. Keep spec, plan and validation evidence in version control.
