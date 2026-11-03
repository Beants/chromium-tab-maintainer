# Open Source Release Implementation Plan

**Goal:** Publish a sanitized, installable Chromium extension with a clean public history.

**Architecture:** Copy a reviewed source allowlist into an independent repository, use public default Git aliases and fictional test domains, rebuild the development lockfile against the public registry, document actual behavior and limitations, then publish only that reviewed repository and its allowlisted package.

**Tech Stack:** Existing Manifest V3 JavaScript/JSDoc, Node.js 22+, npm, GitHub Actions and GitHub Releases.

## Global Constraints

No private history or artifacts; no new runtime dependency/permission; all gates and coverage ≥80%; independently review before public creation/push; code review ≤2 rounds.

- [x] Export source/tests/scripts only; replace personal fixtures and remove company-only defaults/classifiers.
- [x] Add MIT, bilingual README, privacy/security/contributor docs, public-source checks and pinned CI workflow.
- [x] Install from public registry, pass lint/types/tests/coverage/audit/package, inspect the archive and independent review.
- [x] Create the owner's public repository, push clean main, publish v1.0.0 ZIP and verify CI/anonymous access.
- [x] Record aggregate validation and final repository/release identity, preserving the separate local deployment.
