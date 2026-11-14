# Ozkafe Anassa

Next.js 16 customer ordering, kitchen preparation/billing, and admin management.

- `/`: customer menu and live order tracker
- `/kitchen`: preparation, receipts and settlement
- `/admin`: menu, orders, configuration, staff and reporting
- `/qr`: printable customer QR

See [the workflow audit](docs/workflow-audit.md) for confirmed bugs, repairs, practical tests and deployment requirements, and [the file inventory](docs/file-inventory.md) for project assets.

## Development

Run `npm ci`, then `npm run dev`. Read the installed Next.js guides referenced by AGENTS.md before changing Next.js code.

For a single-process local demonstration only, leaving Supabase unconfigured uses the local store. This is not durable hosting storage and is forbidden on Vercel. Configured Supabase errors are returned rather than silently falling back to memory.

## Existing production deployment

1. Import the ignored `.env.vercel.local` into Vercel's Production environment. Required values: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, and `NEXT_PUBLIC_APP_URL`.
2. Run [the workflow migration](supabase/migrations/20261113_workflow.sql) in Supabase SQL Editor before deploying this code. It adds missing stock/payment columns and transactional functions without deleting the existing menu or orders.
3. Deploy the source changes. Confirm `/api/health` reports a connected Supabase database. Staff must sign in again when the session secret changes.

For a new empty database only, run `supabase/schema.sql`, then `supabase/seed_76_menu_items.sql`, then the migration. Do not reseed or run the wipe script against an existing live database as part of this repair.

Never commit environment files or expose service-role/secret keys with a `NEXT_PUBLIC_` prefix. The database key types supplied in the local import file are included for convenience; the application uses the service-role key server-side. SMTP settings are required for real email OTP delivery. No SMS service is implemented.

## Verification

- `npm test`: type checking, production build, isolated PostgreSQL migration/concurrency tests, real browser workflow and two-instance synchronization tests.
- `npm run test:database`: transaction/migration tests only.
- `npm run lint`: lint application and verification scripts.
- `node scripts/audit-files.cjs`: inventory and asset-integrity check.

The test runner explicitly overrides database settings so local production credentials are not used for mutations. It needs ports 3101, 3102 and 3200 free. Browser tests use installed Chrome on Windows; set `TEST_CHROME_PATH` to another compatible Chromium executable. Existing Google Fonts need network access during the build. Test outputs are written to ignored `scratch/`.

Hosted Vercel/Supabase behavior, external SMTP, physical geolocation and thermal printing still require checks in their actual environment. See the audit for exact verification limits.
