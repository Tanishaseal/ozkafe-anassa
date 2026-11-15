BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0
  CHECK (discount_percent >= 0 AND discount_percent <= 100);
NOTIFY pgrst, 'reload schema';
COMMIT;
