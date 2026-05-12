ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "last_user_agent" text;
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "last_host" text;
