BEGIN;

-- The initial migration pass briefly introduced parallel RPC names. The established
-- histology_training_* RPCs already implement the same owner-scoped lifecycle with
-- the shared sanitizer and exact answer normalization; keep one public contract.
DROP FUNCTION IF EXISTS public.list_histology_trainings(text);
DROP FUNCTION IF EXISTS public.create_histology_training(jsonb,text,integer,boolean,text,text,text[],boolean);
DROP FUNCTION IF EXISTS public.get_histology_training(uuid);
DROP FUNCTION IF EXISTS public.save_histology_training_answer(uuid,integer,text,boolean);
DROP FUNCTION IF EXISTS public.complete_histology_training(uuid);
DROP FUNCTION IF EXISTS public.cancel_histology_training(uuid);

NOTIFY pgrst, 'reload schema';
COMMIT;
