-- Apply after schema.sql, before deploying the application changes.
-- No orders or menu items are deleted by this migration.
BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS settled_by text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS stock integer DEFAULT 10;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_unique ON public.orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Preserve the legacy stock map once, then use menu_items.stock exclusively.
UPDATE public.menu_items m SET stock = greatest(0, (s.value ->> m.id)::integer)
FROM public.cafe_settings s WHERE s.key = 'menu_stock_inventory'
AND jsonb_typeof(s.value -> m.id) = 'number';
DELETE FROM public.cafe_settings WHERE key = 'menu_stock_inventory';

CREATE TABLE IF NOT EXISTS public.order_counter (id boolean PRIMARY KEY DEFAULT true CHECK(id), value bigint NOT NULL);
INSERT INTO public.order_counter(id, value)
SELECT true, coalesce(max(substring(order_number FROM '^oz-anassa-([0-9]+)$')::bigint), 0) FROM public.orders
ON CONFLICT(id) DO UPDATE SET value = greatest(order_counter.value, excluded.value);

CREATE OR REPLACE FUNCTION public.place_order(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  existing public.orders;
  saved public.orders;
  line record;
  sequence_number bigint;
  remaining integer;
  available boolean;
  request_key text := nullif(payload->>'idempotency_key', '');
BEGIN
  -- The counter row serializes number allocation and duplicate checks across instances.
  SELECT value INTO sequence_number FROM public.order_counter WHERE id = true FOR UPDATE;
  IF request_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.orders WHERE idempotency_key = request_key;
    IF FOUND THEN
      IF existing.session_id IS DISTINCT FROM payload->>'session_id' OR existing.items <> payload->'items' THEN
        RAISE EXCEPTION 'Idempotency key belongs to a different order';
      END IF;
      RETURN to_jsonb(existing);
    END IF;
  END IF;
  IF jsonb_typeof(payload->'items') <> 'array' OR jsonb_array_length(payload->'items') = 0 THEN
    RAISE EXCEPTION 'Order requires items';
  END IF;
  FOR line IN
    SELECT entry->>'id' AS id, sum((entry->>'quantity')::integer)::integer AS qty
    FROM jsonb_array_elements(payload->'items') entry
    WHERE NOT coalesce((entry->>'isAddon')::boolean, false)
    GROUP BY entry->>'id' ORDER BY entry->>'id'
  LOOP
    SELECT stock, is_available INTO remaining, available FROM public.menu_items WHERE id = line.id FOR UPDATE;
    IF payload->>'session_id' IS NOT NULL AND (NOT FOUND OR NOT available OR remaining < line.qty) THEN
      RAISE EXCEPTION 'Insufficient stock for item %', line.id;
    END IF;
    IF FOUND THEN
      UPDATE public.menu_items SET stock = greatest(0, stock - line.qty),
        is_available = is_available AND stock - line.qty > 0, updated_at = now() WHERE id = line.id;
    END IF;
  END LOOP;
  sequence_number := sequence_number + 1;
  UPDATE public.order_counter SET value = sequence_number WHERE id = true;
  INSERT INTO public.orders (
    id, order_number, table_number, table_key, session_id, customer_name, customer_phone, customer_flat,
    items, subtotal, tax_amount, total, special_instructions, status, customer_lat, customer_lng,
    distance_meters, is_paid, paid_at, settled_by, created_at, updated_at, idempotency_key
  ) VALUES (
    payload->>'id', 'oz-anassa-' || sequence_number, payload->>'table_number', payload->>'table_key', payload->>'session_id',
    coalesce(payload->>'customer_name', ''), coalesce(payload->>'customer_phone', ''), payload->>'customer_flat',
    payload->'items', (payload->>'subtotal')::numeric, (payload->>'tax_amount')::numeric, (payload->>'total')::numeric,
    payload->>'special_instructions', payload->>'status', (payload->>'customer_lat')::numeric, (payload->>'customer_lng')::numeric,
    (payload->>'distance_meters')::numeric, coalesce((payload->>'is_paid')::boolean, false), (payload->>'paid_at')::timestamptz,
    payload->>'settled_by', (payload->>'created_at')::timestamptz, now(), request_key
  ) RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.place_order(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb) TO service_role;
ALTER TABLE public.order_counter ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.order_counter TO service_role;

-- The browser communicates through authenticated Next.js routes. An anonymous
-- Supabase key must not bypass those routes to read or mutate the database.
DO $$ DECLARE policy record; BEGIN
  FOR policy IN SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('categories','menu_items','tables','orders','cafe_settings','audit_logs')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', policy.policyname, policy.schemaname, policy.tablename);
  END LOOP;
END $$;
REVOKE ALL ON public.categories, public.menu_items, public.tables, public.orders, public.cafe_settings, public.audit_logs FROM anon, authenticated;
GRANT ALL ON public.categories, public.menu_items, public.tables, public.orders, public.cafe_settings, public.audit_logs TO service_role;
CREATE OR REPLACE FUNCTION public.verify_staff_otp(challenge_key text, input_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE challenge jsonb;
BEGIN
  SELECT value INTO challenge FROM public.cafe_settings WHERE key = challenge_key FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF (challenge->>'exp')::bigint < extract(epoch FROM now()) * 1000 OR (challenge->>'attempts')::int >= 5 THEN
    DELETE FROM public.cafe_settings WHERE key = challenge_key;
    RETURN false;
  END IF;
  IF challenge->>'hash' = input_hash THEN
    DELETE FROM public.cafe_settings WHERE key = challenge_key;
    RETURN true;
  END IF;
  UPDATE public.cafe_settings SET value = jsonb_set(challenge, '{attempts}', to_jsonb((challenge->>'attempts')::int + 1)) WHERE key = challenge_key;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_staff_otp(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_otp(text,text) TO service_role;

-- Merge settings inside a transaction, so simultaneous partial edits don't erase each other.
CREATE OR REPLACE FUNCTION public.patch_cafe_config(config_key text, defaults jsonb, patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  INSERT INTO public.cafe_settings(key,value) VALUES(config_key, defaults || patch)
  ON CONFLICT(key) DO UPDATE SET value = cafe_settings.value || patch, updated_at = now()
  RETURNING value INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.patch_cafe_config(text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patch_cafe_config(text,jsonb,jsonb) TO service_role;
COMMIT;
