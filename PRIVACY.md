# Privacy

This extension has no server, analytics, advertising, LLM integration or outbound reporting endpoint.

## Local data

The background controller reads tab URLs, titles, window membership, browser access times and protection metadata. It stores settings, identity-scoped timestamps and a 30-day close/recovery journal in `chrome.storage.local`; its browser-session marker uses `chrome.storage.session`. Live operation progress contains counters only and stays in memory.

A page probe compares input/textarea/select defaults and current values locally, checks editable elements and media state, and sends only safety booleans plus timestamps to the extension. It does not send form values, document text or screenshots. Sensitive values may still be present in **tab URLs**: the extension preserves the original query string and fragment so recovery can reopen the URL. Local storage is not encrypted by this extension and is not uploaded or synced by its code.

Restoring a page navigates to its original address; the website can make its normal network requests. This is separate from extension telemetry, which does not exist. Removing the extension clears its extension-local data according to browser behavior.

## Permissions

| Permission | Purpose |
| --- | --- |
| `tabs` | Read tab metadata and close, move or restore tabs. |
| `storage` | Keep settings and local recovery data. |
| `alarms` | Hourly maintenance and delayed sorting. |
| `idle` | Check automatic-run idle state. |
| `scripting` | Refresh local page-protection signals. |
| HTTP/HTTPS host access | Run the safety probe in ordinary web pages. |

No `tabCapture`, browsing-history API, cookies, downloads or remote-service permission is requested. Tab metadata and original URL recovery still require broad access to open pages. Browser internal pages are protected except the explicitly recognized built-in New Tab URLs.

## Limits

Unsaved-content and capture detection is best effort. Journal recovery reopens an address; it cannot recreate arbitrary application memory, forms or scroll positions. Data is available to the local browser/profile and is subject to the host's storage controls.
