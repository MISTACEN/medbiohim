CREATE TABLE IF NOT EXISTS public.progress_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_type text NOT NULL CHECK (object_type IN ('subject','module','topic','material','question','test','ticket','trainer','homework')),
  object_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed','needs_review')),
  percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  score numeric,
  max_score numeric,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, object_type, object_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_ledger_user_activity
  ON public.progress_ledger (user_id, last_activity_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_progress_ledger_user_object
  ON public.progress_ledger (user_id, object_type, object_id);

ALTER TABLE public.progress_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS progress_ledger_select_own ON public.progress_ledger;
DROP POLICY IF EXISTS progress_ledger_insert_own ON public.progress_ledger;
DROP POLICY IF EXISTS progress_ledger_update_own ON public.progress_ledger;

CREATE POLICY progress_ledger_select_own
  ON public.progress_ledger FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY progress_ledger_insert_own
  ON public.progress_ledger FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY progress_ledger_update_own
  ON public.progress_ledger FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
