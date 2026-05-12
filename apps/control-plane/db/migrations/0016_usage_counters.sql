CREATE TABLE IF NOT EXISTS "usage_counters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "period_start" timestamp with time zone NOT NULL,
  "mint_count" integer NOT NULL DEFAULT 0,
  "proxy_count" integer NOT NULL DEFAULT 0,
  "last_at" timestamp with time zone NOT NULL DEFAULT now(),
  "stripe_meter_pending" integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS "usage_counters_customer_period_idx"
  ON "usage_counters" ("customer_id", "period_start");
