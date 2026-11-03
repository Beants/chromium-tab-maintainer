# Contributing

Use Node.js 22.13+ and the public npm registry. Runtime code has no third-party dependencies; development dependencies are pinned in the lockfile.

Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run coverage`, `npm run check:public`, `npm audit --audit-level=low` and `npm run package` before opening a pull request. New runtime behavior needs regression tests, JSDoc types, and line/function/branch coverage of at least 80% overall.

Keep policy computation pure in `extension/policy.js`; browser effects and the durable close journal belong in `engine.js`, and Chrome event/message integration belongs in `runtime.js`. Do not put browser effects in progress callbacks or bypass the cancellation/protection checks to improve progress display.

For live tests, use disposable pages and keep maintenance disabled for real user pages. Do not attach private URLs, browser exports, screenshots with personal history, tokens or internal registries to issues or commits. Use `example.com`/`.test` fixtures.

Feature specs belong in `docs/superpowers/specs/` and plans in `docs/superpowers/plans/`. Specs contain problem, success metrics, user stories, acceptance criteria, non-goals and constraints. Keep these current with behavior. Execution and review use different people/roles; at most two code/test review rounds before escalation.

The project uses the MIT license. Report security-sensitive findings privately as described in [SECURITY.md](SECURITY.md).

The development toolchain pins ESLint 10.14.0 and overrides minimatch to 11.0.1 to address [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Keep that override until the dependency graph naturally requires a patched version; re-run audit and all checks when changing it.
