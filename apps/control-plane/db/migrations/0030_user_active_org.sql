-- 0030 — Persistent active organization per user.
--
-- The dashboard previously relied on a non-HttpOnly x-cb-org cookie to track
-- which org the user is currently viewing. That works for hot-switching but
-- fails for first-load after invite-accept: the cookie is browser-local, so
-- accept-invite couldn't reliably steer the next page render into the joined
-- org. Worse, the fallback in context.ts (first owner-role membership) means
-- an invited admin always lands in their own auto-created org.
--
-- This migration adds users.active_customer_id. Acceptance and the org-
-- switcher both write to it; context.ts reads it after the cookie and before
-- the owner-role fallback.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS active_customer_id UUID
  REFERENCES customers(id) ON DELETE SET NULL;

-- Backfill: pick the first membership row (created_at asc) for each user so
-- existing accounts have a sensible default. Same ordering context.ts uses
-- when no preference exists.
UPDATE "user" u
SET active_customer_id = m.customer_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, customer_id
  FROM memberships
  ORDER BY user_id, created_at ASC
) m
WHERE u.id = m.user_id AND u.active_customer_id IS NULL;
