-- Passkey unification: Better-Auth passkey plugin table + user.passkey_enrolled_at
-- gate column + backfill from legacy webauthn_credentials.
--
-- `webauthn_credentials` is retained for one release cycle so we can roll
-- back. A follow-up migration drops it once step-up reads exclusively from
-- the new `passkey` table.

CREATE TABLE IF NOT EXISTS "passkey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"device_type" text DEFAULT 'singleDevice' NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passkey_user_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "passkey_credential_id_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "passkey_enrolled_at" timestamp with time zone;--> statement-breakpoint

-- Backfill legacy step-up credentials into passkey table so existing users
-- don't need to re-enroll. Deduped by (user_id, credential_id) — if a row
-- with the same credential_id already exists we skip it.
INSERT INTO "passkey" (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, transports, created_at)
SELECT
	w.id,
	w.name,
	w.public_key,
	w.user_id,
	w.credential_id,
	w.counter,
	'singleDevice'::text AS device_type,
	false AS backed_up,
	w.transports,
	w.created_at
FROM "webauthn_credentials" w
WHERE NOT EXISTS (
	SELECT 1 FROM "passkey" p WHERE p.credential_id = w.credential_id
);--> statement-breakpoint

-- Users with at least one credential are considered enrolled — they don't
-- get bounced through /onboarding/enroll-passkey on next sign-in.
UPDATE "user" SET "passkey_enrolled_at" = now()
WHERE "passkey_enrolled_at" IS NULL
	AND EXISTS (SELECT 1 FROM "passkey" p WHERE p.user_id = "user".id);
