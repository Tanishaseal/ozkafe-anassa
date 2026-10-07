-- ══════════════════════════════════════════════════════════════
-- OZKAFE ANASSA — SUPABASE PRODUCTION DATABASE SCHEMA
-- Free Tier PostgreSQL + Realtime Publications
-- Fully Compatible with Vercel Serverless & Next.js 16
-- ══════════════════════════════════════════════════════════════

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  emoji TEXT NOT NULL,
  hero_label TEXT DEFAULT '',
  icon_svg TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  name TEXT NOT NULL,
  subheading TEXT,
  "desc" TEXT DEFAULT '',
  price NUMERIC(10, 2) NOT NULL,
  image_url TEXT NOT NULL,
  is_veg BOOLEAN DEFAULT TRUE,
  is_available BOOLEAN DEFAULT TRUE,
  sizes JSONB DEFAULT '["Regular"]'::JSONB,
  size_price_multiplier JSONB,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tables & QR Security
CREATE TABLE IF NOT EXISTS tables (
  table_number INT PRIMARY KEY,
  label TEXT NOT NULL,
  secret_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Orders Table (With Geofence Coordinates & Session Isolation)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  table_number TEXT NOT NULL,
  table_key TEXT,
  session_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_flat TEXT,
  items JSONB NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL,
  tax_amount NUMERIC(10, 2) NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  special_instructions TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'preparing', 'ready', 'served', 'cancelled')),
  customer_lat NUMERIC(10, 6),
  customer_lng NUMERIC(10, 6),
  distance_meters NUMERIC(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ultra-fast querying on Vercel Serverless
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_table_number ON orders(table_number);

-- 6. Cafe Settings Table (Live Configuration Center)
CREATE TABLE IF NOT EXISTS cafe_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Audit Logs Table (Server-side tracking for security & database mutations)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- 8. Enable Supabase Realtime Publication for Live Kitchen and Order Tracking
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE cafe_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;

-- 9. Row Level Security (RLS) - Permissive Server Proxy Access
-- Next.js server acts as the secure proxy, protecting credentials from browser exposure
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories all access" ON categories;
CREATE POLICY "Categories all access" ON categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Menu items all access" ON menu_items;
CREATE POLICY "Menu items all access" ON menu_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Tables all access" ON tables;
CREATE POLICY "Tables all access" ON tables FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Orders all access" ON orders;
CREATE POLICY "Orders all access" ON orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Cafe settings all access" ON cafe_settings;
CREATE POLICY "Cafe settings all access" ON cafe_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Audit logs all access" ON audit_logs;
CREATE POLICY "Audit logs all access" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

-- 10. Initial Seed Data: Default Table 0 (Static Takeaway) and Table 1 (Dine-In)
INSERT INTO tables (table_number, label, secret_key, is_active)
VALUES
  (0, 'Takeaway & In-Flat Delivery', 'takeaway-permanent-key-anassa', true),
  (1, 'Table 1', 'oz-anassa-tbl-1-live', true)
ON CONFLICT (table_number) DO NOTHING;

-- 11. Initial Seed Data: Cafe Settings
INSERT INTO cafe_settings (key, value)
VALUES
  ('main_config', '{
    "cafeName": "OZKAFE",
    "tagline": "At Anassa · Kolkata",
    "address": "Beside JW Marriott, EM Bypass, Kolkata · 100% Pure Veg",
    "contactPhone": "+91 98300 00000",
    "currencySymbol": "₹",
    "gstPercent": 5,
    "isOpen": true,
    "closedMessage": "Our kitchen is currently closed. We reopen fresh tomorrow morning at 10:00 AM!",
    "adminPin": "1234",
    "kitchenPin": "1234",
    "geofencingEnabled": false,
    "cafeLatitude": 22.5448,
    "cafeLongitude": 88.4000,
    "geofenceRadiusMeters": 150,
    "allowTakeawayWithoutGeofence": false,
    "geofenceDevMode": false,
    "geofenceTestBypassCode": "ANASSA-DEV-PASS",
    "tableKeyValidationStrict": true,
    "tableSessionTimeoutMinutes": 120,
    "urlCleansingEnabled": true,
    "sessionIsolationEnabled": true,
    "requireCustomerPhone": true,
    "requireCustomerName": true,
    "allowCustomerFlatInput": true,
    "minOrderAmount": 0,
    "maxItemsPerOrder": 25,
    "orderCooldownSeconds": 10,
    "kitchenSoundEnabled": true,
    "autoAcceptOrders": false,
    "warningTimeMinutes": 10,
    "dangerTimeMinutes": 15,
    "allowOrderCancellation": true
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 12. Initial Seed Data: Categories
INSERT INTO categories (id, title, subtitle, emoji, hero_label, sort_order)
VALUES
  ('hot-coffee', 'Hot Coffee', 'Handcrafted Espresso & In-House Roasted Brews', '☕', 'IN-HOUSE ROASTED', 1),
  ('iced-caffeine', 'Iced Caffeine', 'Chilled Refreshers, Iced Lattes & Shaken Espresso', '🧊', 'COLD & CRISP', 2),
  ('cold-brew', 'Cold Brew', '16-Hour Slow Steeped Dutch Cold Extracts', '⏳', '18-HOUR STEEP', 3),
  ('premium-tea', 'Artisan Tea', 'Single-Estate Whole Leaf Teas & Herbal Infusions', '🫖', 'A CUP OF WELLBEING', 4),
  ('shakes-spritzers', 'Shake & Spritzer', 'Artisanal Frappes, Smoothies & Sparkling Botanicals', '🍹', 'COOL SIPS', 5),
  ('sandwiches-appetizers', 'Food & Bites', 'Gourmet Sourdough Paninis, Croissants & Light Bites', '🥪', '100% PURE VEG', 6),
  ('combo-meals', 'Combos', 'Chef Curated Pairings with Fresh Brews & Bites', '✨', 'HAPPY COMBOS', 7),
  ('bakery-desserts', 'Bakery & Cakes', 'Handmade French Patisserie, Tea Cakes & Desserts', '🧁', 'FRESHLY BAKED', 8)
ON CONFLICT (id) DO NOTHING;

-- 13. Initial Seed Data: Sample Starters for Menu Items
INSERT INTO menu_items (id, category_id, category_name, name, subheading, "desc", price, image_url, is_veg, is_available, sizes, sort_order)
VALUES
  ('hc-1', 'hot-coffee', 'Hot Coffee', 'Single Espresso', 'BLACK COFFEES', 'Pure, concentrated coffee extracted under high pressure with thick golden crema.', 89.00, '/images/single_espresso.png', true, true, '["Single Shot", "Double Shot"]'::jsonb, 1),
  ('hc-3', 'hot-coffee', 'Hot Coffee', 'Americano', 'BLACK COFFEES', 'Rich espresso poured over hot water preserving subtle aromatic floral notes.', 109.00, '/images/americano.png', true, true, '["Regular", "Large"]'::jsonb, 2),
  ('hc-5', 'hot-coffee', 'Hot Coffee', 'Cappuccino', 'WHITE COFFEES', 'Equal parts dark espresso, warm steamed milk, and velvety thick foam dusted with cocoa.', 129.00, '/images/cappuccino.png', true, true, '["Regular", "Large"]'::jsonb, 3),
  ('ic-1', 'iced-caffeine', 'Iced Caffeine', 'Berrylicious Mocka Coffee', 'ICED COFFEES', 'Layers of chilled espresso, forest berry coulis, dark mocha, and cold milk foam.', 189.00, '/images/berrylicious_mocka_coffee_highres.png', true, true, '["Regular", "Large"]'::jsonb, 4),
  ('ic-5', 'iced-caffeine', 'Iced Caffeine', 'Affogato', 'ICED COFFEES', 'A decadent scoop of Madagascan vanilla bean gelato drowned in a piping hot double espresso.', 199.00, '/images/affogato_highres.png', true, true, '["Regular"]'::jsonb, 5),
  ('cb-1', 'cold-brew', 'Cold Brew', 'Classic Cold Brew', 'SIGNATURE COLD BREWS', 'Bold, intense, less acidic coffee slow steeped for 18 hours using 100% specialty single-origin beans.', 139.00, '/images/classic_cold_brew_cb-1.png', true, true, '["On the Rocks", "With Milk"]'::jsonb, 6),
  ('tea-1', 'premium-tea', 'Artisan Tea', 'Darjeeling Tea', 'TIMELESS', 'The "Champagne of Teas" harvested from Himalayan high-altitude estates with delicate muscatel aroma.', 69.00, '/images/darjeeling_tea_tea-1.png', true, true, '["Pot for 1", "Pot for 2"]'::jsonb, 7),
  ('tea-2', 'premium-tea', 'Artisan Tea', 'Cutting Chai', 'TIMELESS', 'A symphony of freshly crushed green cardamom, ginger, and Assam tea boiled in rich milk.', 49.00, '/images/cutting_chai_tea-2.png', true, true, '["Regular"]'::jsonb, 8),
  ('ss-1', 'shakes-spritzers', 'Shake & Spritzer', 'Classic Mojito', 'MOCKTAILS', 'Muddled fresh mint leaves, cane sugar syrup, lime wedges, and sparkling cold soda.', 129.00, '/images/classic_mojito_ss-1.png', true, true, '["Regular"]'::jsonb, 9)
ON CONFLICT (id) DO NOTHING;
