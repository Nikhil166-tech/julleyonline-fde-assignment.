-- Enforce organization-level membership uniqueness for NULL tenant_id
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_org_admin_membership" 
ON "memberships"("user_id", "org_id") 
WHERE "tenant_id" IS NULL;
