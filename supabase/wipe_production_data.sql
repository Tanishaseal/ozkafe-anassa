-- ═════════════════════════════════════════════════════════════════════
-- OZKAFE ANASSA — PRODUCTION CLEAN WIPE SCRIPT
-- Execute in Supabase SQL Editor prior to official public launch.
-- Wipes all customer test orders, sales stats, and audit records.
-- Preserves menu items, categories, and cafe configuration settings.
-- ═════════════════════════════════════════════════════════════════════

-- 1. Truncate orders and audit trails
TRUNCATE TABLE IF EXISTS orders CASCADE;
TRUNCATE TABLE IF EXISTS audit_logs CASCADE;

-- 2. Ensure all menu items are marked available for live service
UPDATE menu_items SET is_available = true WHERE is_available = false;

-- 3. Verify clean tables (both should return 0 rows)
SELECT 'orders_count' AS metric, count(*) AS val FROM orders
UNION ALL
SELECT 'audit_logs_count' AS metric, count(*) AS val FROM audit_logs;

