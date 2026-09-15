-- Reconcile group membership schema with the backend repositories.
-- Memberships are active by default; existing rows remain active.
ALTER TABLE public.group_memberships
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_group_memberships_user_active
  ON public.group_memberships (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_group_memberships_group_active
  ON public.group_memberships (group_id, is_active);
