CREATE TYPE "public"."agent_mode" AS ENUM('static', 'dynamic');--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "mode" "agent_mode" DEFAULT 'static' NOT NULL;