# Admin deletion repair — 14 November 2026

The reported behavior was clarified: the first Delete action should remove the order row. Previously, the admin page deliberately kept a cancelled row with repeated deletion labels and a second Purge button.

The admin ledger now excludes deleted orders on every fetch, including after reload. Confirmed deletions remove the row, close its receipt/editor, and prevent older polling responses from putting it back. Deleted orders remain stored as cancellations so the customer's tracker can explain what happened. Existing kitchen active-order filtering excludes them. Admin total-order counts also exclude deleted records.

Deletion waits for both a successful HTTP response and `success: true`. Pending buttons are disabled, failures appear visibly, and failed requests do not remove the row or announce success. Removed the redundant deleted-row badges and Purge control. The order API and legacy admin deletion routes share one response helper, return 404 for missing orders, and return 400 for missing IDs. A missing ID in the admin deletion route no longer falls through to resetting cafe settings. Storage mutations check that a row was actually affected.

Regression coverage extends the existing isolated PostgreSQL/API/browser suite with missing-order responses, missing-ID validation, unauthorized deletion, permanent deletion, an HTTP-200 unsuccessful deletion, first-click row removal, customer cancellation notices, active kitchen exclusion, and admin reload persistence. Existing tests cover menu add/edit/delete, stock, order creation, kitchen statuses, payment, receipts, sessions, settings, tables, and two independent server processes.

Tests use a local PostgreSQL adapter and isolated credentials. They do not mutate the live cafe. Hosted Supabase/Vercel behavior and physical-device integrations require verification in their deployment environment; the earlier deployment prerequisites remain documented in `workflow-audit.md`.

Validation completed: TypeScript, production build, PostgreSQL tests, API workflow, three-screen Chromium workflow, and two-server synchronization all passed. Targeted lint completed with zero errors and nine existing warnings. The build retains two warnings about local fallback filesystem tracing. Browser selectors were corrected during verification; the final workflow run passed against the unchanged verified build. No deployment was performed.
