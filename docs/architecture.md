# Architecture

- `policy.js`: pure defaults, URL/repository identity, protection checks, cleanup plans and desired order.
- `temporary.js`: deterministic recognized temporary/disposable pages.
- `engine.js`: serialized operations, cancellation epochs, durable journal-before-delete, final identity/protection rechecks, restore cooldowns and read-only progress.
- `runtime.js`: Chrome APIs, page safety state, alarms, trusted settings commands and request-scoped in-memory progress.
- `page-state.js`: isolated page probe; sends booleans/timestamps, not form values.
- `options.*`: Chinese settings, sticky controls, progress polling, preview and local recovery UI.

Window identity is `chrome.tabs.windowId`, carried internally as `spaceId` for compatibility with browsers exposing workspaces. Plans never merge or move across windows. Unknown live page state fails closed. Explicitly discarded/unloaded pages can use the no-document branch, but known edit/media/capture vetoes remain effective.

Automatic runs require enabled settings, verified isolation, idle and stability. Manual requests can bypass those automation waits; they still capture cancellation before queueing/sampling and retain page protections. Recovery uncertainty is a separate durable safety hold.

Progress observers receive detached counts. They cannot throw through the effect path, contain no page identity, and do not enter persistent storage. Settings poll by request ID without waiting behind effects. A failed response retrieves a matching terminal frame so already-confirmed results are not lost.
