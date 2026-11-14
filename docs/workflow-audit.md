# Workflow audit and deployment handoff — 13 November 2026

The layouts, CSS, artwork and navigation design were preserved. Changes address selection, persistence, synchronization, authentication and billing behavior.

## Confirmed production findings

Read-only checks of `https://anassa.ozkafe.in/api/health` reported `in-memory-fallback` and `supabaseConnected: false`, despite reporting an overall healthy status. Separate Vercel functions therefore cannot reliably share orders, settings or receipt edits. Local JSON files cannot provide production persistence on Vercel.

The supplied Supabase project is reachable. It contains 77 menu items and 8 categories. It is missing `menu_items.stock` and the order payment columns `is_paid`, `paid_at` and `settled_by`. Session, table-key, customer-flat and geolocation columns already exist. Production rows were not modified during these checks.

## Fixes

| Area | Finding and repair |
| --- | --- |
| Food search | Search returned a category-relative index but selection read the full menu array. The first food result selected espresso. Selection now uses the item's global ID lookup, resets its size, and preserves the selected ID during menu refresh. |
| Kitchen polling | An order-dependent fetch callback restarted its own effect after every successful fetch. Removed the dependency cycle and verified bounded request counts in a real browser. |
| Persistence | Configured database failures now propagate instead of reporting local-memory success. Missing storage on Vercel fails closed. Local development JSON is not read or written in database mode. |
| Menu edits | Reading fewer than 76 dishes previously triggered automatic seed restoration. Reads no longer write seed data. Edits and deletion load the actual database item rather than assuming it exists in the current process. |
| Orders and stock | `place_order` saves the order, allocates its receipt number, and decrements stock in one transaction. Concurrent duplicate requests share an idempotency key; stock cannot be sold twice. Reads no longer renumber receipts. |
| Customer submission | Cart clearing, celebration and success tracking occur after server confirmation. Uncertain retries retain their idempotency key; reconciliation uses that key rather than comparing masked phone numbers. |
| Status and payment | Customer queries include cancellation/deletion and recent completed records. Empty successful responses no longer retain phantom active orders. All database responses map payment, deletion and idempotency fields consistently. |
| Admin edits | Receipts are fetched from the database rather than stale process-local data. Missing orders return 404. A failed edit reopens the existing editor and clears its false success message. |
| Cross-instance updates | Database reads bypass per-process caches. SSE checks shared database revisions and closes before the function duration limit; cancellation releases resources. Independent polling remains enabled. |
| Staff/authentication | Removed the unconditional `1234` bypass after PIN changes. Restricted credential resets and PIN changes, omitted PINs from profile responses, and restricted the privileged Supabase proxy. Public server-rendered props no longer include PINs or geofence bypass codes. |
| OTP | Cryptographic codes, database-backed single-use verification with attempt limits, role binding, no production previews/logged codes, and no false delivery success when SMTP fails. Delivery is email; there is no SMS transport. |
| Customer isolation | Orders require a signed session. Knowing a phone number, order ID, or arbitrary session query no longer grants another customer's orders. QR URL reloads reuse an existing signed session. |
| Settings and operations | Partial settings updates merge transactionally. Inventory and staff shifts persist in Supabase. Table shrinking removes surplus database tables. Admin daily totals use India midnight. |
| Billing | Existing size multipliers now apply consistently to the customer display/cart and server calculation. Receipt/custom-bill tax calculations preserve two decimal places. |
| Diagnostics | Health reports missing/unreachable production storage as unhealthy. Read retries are bounded; uncertain writes are not automatically replayed by the fetch wrapper. |

## Verification

Final isolated run: all four test suites passed (PostgreSQL, API, three-browser-screen flow, and two production server instances). TypeScript and production build passed. Source/tooling lint: 0 errors, 18 warnings. Asset inventory: 255 files, 191 decoded images, 76 resolved initial-menu image references. Screenshots and execution logs are in ignored `scratch/`.

`npm test` explicitly overrides database URLs and credentials to use an isolated local PostgreSQL engine and two production-mode Next.js processes. It does not use keys from local environment files for mutations.

- TypeScript and production build.
- SQL migration execution and rerun, duplicate order submissions, simultaneous last-stock attempts, rollback, unique receipt numbering, partial settings updates, single-use OTP and anonymous database denial.
- API tests for login, authorization, cross-customer isolation, status changes, settlement, receipt editing, menu add/edit/delete, table resizing, settings, staff shifts and PIN replacement.
- Actual Chromium customer, kitchen and admin screens: search for Corn & Cheese Sandwich, submit that exact dish, advance kitchen buttons, observe customer updates, reload the tracker, confirm ledger entry and payment, and check for browser exceptions.
- Two separate Next processes sharing the test PostgreSQL adapter: duplicate submission, shared stock, status updates, receipt edits, settlement, soft deletion and menu deletion.
- Source lint and image/file inventory.

The test adapter implements the application's PostgREST operations against PostgreSQL; it is not the hosted Supabase gateway. It does not reproduce Vercel routing, cold starts, provider latency or external email delivery.

## Required deployment steps

1. Import the ignored `.env.vercel.local` file into the Vercel project's **Production** environment. It includes the supplied keys, `NEXT_PUBLIC_APP_URL`, and a newly generated `SESSION_SECRET`. The extra supplied Supabase key types are included for convenience; this server uses `SUPABASE_SERVICE_ROLE_KEY`.
2. Apply `supabase/migrations/20261113_workflow.sql` in the existing Supabase project's SQL Editor. It adds missing columns, transactional functions, and database access restrictions. It preserves existing orders/menu rows; do not run the wipe script or reseed the existing 77-item menu.
3. Deploy the fixed code. Importing variables alone does not update a running deployment. Staff will need to sign in again because the session secret changes.
4. Verify `/api/health` reports `supabase`, `supabaseConnected: true`, and `healthy`. Place an identifiable test order from a mobile device, confirm the exact item in the kitchen, advance its status, edit its receipt in admin, and settle it. Confirm all three screens agree after refresh.
5. Rotate the keys that were pasted into the chat and replace the corresponding Vercel values.

Existing orders held only in running Vercel memory are not automatically migrated into Supabase. Preserve any required current ledger/export before switching storage. No production migration, Vercel settings update or deployment was performed by this audit.

## Remaining verification limits

- The fixed deployment has not yet been exercised on the live domain; it requires the migration and redeploy above.
- Actual SMTP delivery, physical geofencing, mobile contact-picker permissions and a physical thermal printer need their real environment/devices.
- Inventory restocks and whole staff-profile configuration writes are durable but are not transactional across simultaneous edits to the same record. This is separate from the transactionally protected customer order/stock path.
- The in-process rate limiter is a per-instance abuse guard, not a distributed authentication lockout.
- Admin/history API queries retain their existing 500/1000-record limits. Large-ledger pagination requires a separate UI/data contract change.
- This is targeted practical coverage of the workflows above, not a claim that every possible input or infrastructure failure was tested.

## References

- Installed Next.js route-handler and Playwright guides in `node_modules/next/dist/docs/`.
- [Vercel function runtimes and filesystem](https://vercel.com/docs/functions/runtimes).
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).
- [Supabase database functions](https://supabase.com/docs/guides/database/functions).

See `file-inventory.md` for the project-owned file inventory and asset checks.
