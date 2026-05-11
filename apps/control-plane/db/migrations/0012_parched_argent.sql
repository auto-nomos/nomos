ALTER TABLE "agents" ADD COLUMN "connection_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "connection_approved_by" uuid;