ALTER TABLE "envelopes" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "envelopes" ADD COLUMN "is_standing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "envelopes_standing_idx" ON "envelopes" USING btree ("customer_id","agent_id","is_standing");