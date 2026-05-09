ALTER TABLE "oauth_connections" ADD COLUMN "refresh_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD COLUMN "encrypted_access_token" text;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD COLUMN "access_token_nonce" text;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD COLUMN "access_token_expires_at" timestamp with time zone;