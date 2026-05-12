ALTER TABLE "push_approvals" ADD COLUMN IF NOT EXISTS "cedar_variants" jsonb;--> statement-breakpoint
ALTER TABLE "push_approvals" ADD COLUMN IF NOT EXISTS "recommended_scope" text;
