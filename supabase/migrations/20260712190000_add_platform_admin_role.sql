-- Add platform-level admin role. Must be committed before it can be
-- referenced by name in policies/functions (Postgres restriction on
-- using a new enum value within the same transaction it was added in).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';
