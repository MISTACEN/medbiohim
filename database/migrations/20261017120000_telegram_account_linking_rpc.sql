-- Secure Telegram account-link RPCs. Tables are private; no direct client table grants.
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_account_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS telegram_account_link_tokens_user_created_idx
  ON public.telegram_account_link_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS telegram_account_link_tokens_expiry_idx
  ON public.telegram_account_link_tokens(expires_at) WHERE consumed_at IS NULL;
CREATE TABLE IF NOT EXISTS public.telegram_accounts (
  telegram_user_id bigint PRIMARY KEY CHECK (telegram_user_id > 0),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  username text,
  first_name text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_account_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telegram_account_link_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.telegram_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telegram_account_link_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telegram_accounts TO service_role;

CREATE OR REPLACE FUNCTION public.create_my_telegram_link_token(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_count integer; v_exp timestamptz := now()+interval '10 minutes';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
  SELECT count(*) INTO v_count FROM public.telegram_account_link_tokens
   WHERE user_id=v_uid AND created_at>now()-interval '15 minutes';
  IF v_count>=5 THEN RETURN jsonb_build_object('status','rate_limited'); END IF;
  INSERT INTO public.telegram_account_link_tokens(user_id,token_hash,expires_at) VALUES(v_uid,p_token_hash,v_exp);
  RETURN jsonb_build_object('status','created','expires_at',v_exp);
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_telegram_account()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_account jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  SELECT jsonb_build_object('username',username,'first_name',first_name,'linked_at',linked_at)
    INTO v_account FROM public.telegram_accounts WHERE user_id=v_uid LIMIT 1;
  RETURN jsonb_build_object('status','ok','linked',v_account IS NOT NULL,'account',v_account);
END; $$;

CREATE OR REPLACE FUNCTION public.unlink_my_telegram_account()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_count integer;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  DELETE FROM public.telegram_accounts WHERE user_id=v_uid;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('status','ok','unlinked',v_count>0);
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_telegram_account_link(
  p_token_hash text, p_telegram_user_id bigint, p_username text DEFAULT NULL, p_first_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_link record; v_tid bigint; v_uid uuid; v_count integer;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_telegram_user_id IS NULL OR p_telegram_user_id<=0
    THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT id,user_id INTO v_link FROM public.telegram_account_link_tokens
   WHERE token_hash=p_token_hash AND consumed_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT telegram_user_id INTO v_tid FROM public.telegram_accounts WHERE user_id=v_link.user_id LIMIT 1;
  SELECT user_id INTO v_uid FROM public.telegram_accounts WHERE telegram_user_id=p_telegram_user_id LIMIT 1;
  IF (v_tid IS NOT NULL AND v_tid<>p_telegram_user_id) OR (v_uid IS NOT NULL AND v_uid<>v_link.user_id)
    THEN RETURN jsonb_build_object('status','already_linked'); END IF;
  BEGIN
    INSERT INTO public.telegram_accounts(telegram_user_id,user_id,username,first_name)
    VALUES(p_telegram_user_id,v_link.user_id,left(nullif(trim(p_username),''),64),left(nullif(trim(p_first_name),''),128))
    ON CONFLICT(telegram_user_id) DO UPDATE SET username=EXCLUDED.username,first_name=EXCLUDED.first_name,updated_at=now()
    WHERE public.telegram_accounts.user_id=EXCLUDED.user_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count<>1 THEN RETURN jsonb_build_object('status','already_linked'); END IF;
  EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('status','already_linked');
  END;
  UPDATE public.telegram_account_link_tokens SET consumed_at=now() WHERE id=v_link.id AND consumed_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'Could not consume Telegram link token'; END IF;
  RETURN jsonb_build_object('status','linked');
END; $$;

REVOKE ALL ON FUNCTION public.create_my_telegram_link_token(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_my_telegram_account() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.unlink_my_telegram_account() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.confirm_telegram_account_link(text,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_telegram_link_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_telegram_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_my_telegram_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_telegram_account_link(text,bigint,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
