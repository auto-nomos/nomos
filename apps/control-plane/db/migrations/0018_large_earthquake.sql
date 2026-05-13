ALTER TABLE "push_approvals" ADD COLUMN IF NOT EXISTS "resource_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_approvals_pending_dedup_idx" ON "push_approvals" USING btree ("customer_id","agent_id","command","resource_hash") WHERE state = 'pending';
