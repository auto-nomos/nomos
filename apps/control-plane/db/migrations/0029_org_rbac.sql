-- Org-level RBAC foundation:
--   * widen membership_role enum (agent_manager / policy_author / auditor)
--   * customers.display_name + slug (human-friendly tenant surface)
--   * api_keys.role (per-key least-privilege binding)
--   * org_invites table (email-invite + accept flow)
--   * backfill: every user gets an owner membership; every customer has >= 1 owner

ALTER TYPE "public"."membership_role" ADD VALUE IF NOT EXISTS 'agent_manager';--> statement-breakpoint
ALTER TYPE "public"."membership_role" ADD VALUE IF NOT EXISTS 'policy_author';--> statement-breakpoint
ALTER TYPE "public"."membership_role" ADD VALUE IF NOT EXISTS 'auditor';--> statement-breakpoint

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "display_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "slug" text;--> statement-breakpoint

UPDATE "customers" SET "display_name" = "name" WHERE "display_name" IS NULL;--> statement-breakpoint

UPDATE "customers"
SET "slug" = regexp_replace(lower(coalesce("display_name", "name", 'org')), '[^a-z0-9]+', '-', 'g') || '-' || substr("id"::text, 1, 6)
WHERE "slug" IS NULL;--> statement-breakpoint

ALTER TABLE "customers" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "customers_slug_idx" ON "customers" USING btree ("slug");--> statement-breakpoint

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "role" "membership_role" DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "org_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" "membership_role" NOT NULL,
  "token_hash" text NOT NULL,
  "invited_by" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "org_invites_token_idx" ON "org_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_invites_customer_idx" ON "org_invites" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_invites_email_idx" ON "org_invites" USING btree ("email");--> statement-breakpoint

-- Backfill: every user without a membership gets a customer + owner membership.
-- Idempotent: the LEFT JOIN filter skips users who already have one.
DO $$
DECLARE
  u RECORD;
  new_customer_id uuid;
  slug_text text;
  domain text;
  head text;
BEGIN
  FOR u IN
    SELECT usr.id, usr.email
    FROM "user" usr
    LEFT JOIN "memberships" m ON m.user_id = usr.id
    WHERE m.id IS NULL
  LOOP
    domain := split_part(u.email, '@', 2);
    head := split_part(domain, '.', 1);
    IF head IS NULL OR head = '' THEN head := 'org'; END IF;
    new_customer_id := gen_random_uuid();
    slug_text := regexp_replace(lower(head), '[^a-z0-9]+', '-', 'g') || '-' || substr(new_customer_id::text, 1, 6);
    INSERT INTO "customers" ("id", "name", "display_name", "slug")
      VALUES (new_customer_id, head, head, slug_text);
    INSERT INTO "memberships" ("user_id", "customer_id", "role")
      VALUES (u.id, new_customer_id, 'owner');
  END LOOP;
END $$;--> statement-breakpoint

-- Every customer must have >= 1 owner: promote oldest membership when missing.
WITH ownerless AS (
  SELECT c.id AS customer_id
  FROM "customers" c
  LEFT JOIN "memberships" m ON m.customer_id = c.id AND m.role = 'owner'
  WHERE m.id IS NULL
), promote AS (
  SELECT DISTINCT ON (m.customer_id) m.id
  FROM "memberships" m
  JOIN ownerless o ON o.customer_id = m.customer_id
  ORDER BY m.customer_id, m.created_at ASC
)
UPDATE "memberships" SET "role" = 'owner' WHERE id IN (SELECT id FROM promote);
