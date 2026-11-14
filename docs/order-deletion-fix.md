# Admin deletion repair — 14 November 2026

## Deployment packaging follow-up

The Vercel log for `27a8741` completed compilation, TypeScript and output
generation, then stopped at deployment. It also warned that the configurable
local backup reads traced the entire project. Locally, the orders API trace
included 414 files totalling approximately 324 MiB, including 191 public images
and six test files. Ignoring the runtime filesystem reads reduced it to 122
files and approximately 2 MiB before the additional runtime-data exclusion.
This verifies a packaging defect; the supplied Vercel log alone does not prove
the final platform error was a size limit.

Runtime backup filesystem accesses now use Turbopack ignore annotations.
Explicit tracing exclusions prevent the static backup path, environment files
and scratch artifacts from being bundled. Supabase behavior and UI remain
unchanged. `tests/build-output.test.cjs` checks every app server trace for
accidentally bundled public assets, tests, environment files and local data.
Final validation passed: production build without tracing warnings, TypeScript,
bundle-content checks, database tests, three-panel browser/API workflow,
cross-instance synchronization, legacy-schema regression, and targeted lint.
The final orders API trace contains 121 files totalling approximately 2 MiB.

## Production follow-up

Read-only Supabase API checks confirmed that production lacked `is_deleted`,
`deleted_by`, `deleted_at`, payment fields, stock, the idempotency key, and the
workflow RPCs. The migration had not been applied. A connectivity-only health
check concealed this mismatch. After the owner applied the migration, all
required fields and all three RPCs were verified through the production API.

Order updates now retry only explicit missing-metadata-column rejections using
the existing legacy instruction markers. Other database failures still propagate.
Receipt edits preserve those markers; creation and updates share the same marker
serializer. Removed a duplicate local persistence call and duplicate import.
The health endpoint checks required schema fields as well as connectivity.
No UI files or styles were changed in this follow-up.

Final local validation passed: TypeScript, production build, PostgreSQL migration,
API workflow, three-screen Chromium workflow, two-server synchronization, and a
new regression that drops the production-missing metadata columns and verifies
deletion, payment, notes, customer cancellation and kitchen exclusion. Full lint:
zero errors, 18 existing warnings. Build: two existing filesystem tracing warnings.

GitHub's Vercel check for `aadc741` reported deployment failure; the latest
recorded production deployment was `f883330`. A synthetic zero-value, settled
live test order did not acquire the new deletion flag under that deployment;
the test order was removed afterward. Pushing code is not proof of deployment:
the Vercel check and live behavior must also be verified.

The reported behavior was clarified: the first Delete action should remove the order row. Previously, the admin page deliberately kept a cancelled row with repeated deletion labels and a second Purge button.

The admin ledger now excludes deleted orders on every fetch, including after reload. Confirmed deletions remove the row, close its receipt/editor, and prevent older polling responses from putting it back. Deleted orders remain stored as cancellations so the customer's tracker can explain what happened. Existing kitchen active-order filtering excludes them. Admin total-order counts also exclude deleted records.

Deletion waits for both a successful HTTP response and `success: true`. Pending buttons are disabled, failures appear visibly, and failed requests do not remove the row or announce success. Removed the redundant deleted-row badges and Purge control. The order API and legacy admin deletion routes share one response helper, return 404 for missing orders, and return 400 for missing IDs. A missing ID in the admin deletion route no longer falls through to resetting cafe settings. Storage mutations check that a row was actually affected.

Regression coverage extends the existing isolated PostgreSQL/API/browser suite with missing-order responses, missing-ID validation, unauthorized deletion, permanent deletion, an HTTP-200 unsuccessful deletion, first-click row removal, customer cancellation notices, active kitchen exclusion, and admin reload persistence. Existing tests cover menu add/edit/delete, stock, order creation, kitchen statuses, payment, receipts, sessions, settings, tables, and two independent server processes.

Tests use a local PostgreSQL adapter and isolated credentials. They do not mutate the live cafe. Hosted Supabase/Vercel behavior and physical-device integrations require verification in their deployment environment; the earlier deployment prerequisites remain documented in `workflow-audit.md`.

Validation completed: TypeScript, production build, PostgreSQL tests, API workflow, three-screen Chromium workflow, and two-server synchronization all passed. Targeted lint completed with zero errors and nine existing warnings. The build retains two warnings about local fallback filesystem tracing. Browser selectors were corrected during verification; the final workflow run passed against the unchanged verified build. No deployment was performed.
