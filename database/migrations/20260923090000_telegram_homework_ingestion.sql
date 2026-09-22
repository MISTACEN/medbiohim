-- MEDBIOHIM Telegram ingestion foundation.
-- Telegram is an independent ingestion source; auth linking is separate.

CREATE TABLE IF NOT EXISTS public.telegram_bot_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id bigint NOT NULL UNIQUE,
  telegram_chat_type text NOT NULL DEFAULT 'group',
  telegram_title text,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id bigint NOT NULL,
  telegram_message_id bigint NOT NULL,
  telegram_user_id bigint,
  reply_to_message_id bigint,
  message_text text,
  caption text,
  telegram_date timestamptz,
  classification text,
  classification_confidence numeric(5,4),
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processing','processed','ignored','failed')),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (telegram_chat_id, telegram_message_id)
);

CREATE TABLE IF NOT EXISTS public.telegram_homework_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_message_id uuid NOT NULL REFERENCES public.telegram_messages(id) ON DELETE CASCADE,
  homework_id uuid NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'source',
  confidence numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_message_id, homework_id)
);

CREATE TABLE IF NOT EXISTS public.homework_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  telegram_message_id uuid REFERENCES public.telegram_messages(id) ON DELETE SET NULL,
  attachment_type text NOT NULL DEFAULT 'file',
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (homework_id, file_id)
);

CREATE INDEX IF NOT EXISTS telegram_bot_chats_group_id_idx
  ON public.telegram_bot_chats(group_id);
CREATE INDEX IF NOT EXISTS telegram_messages_chat_date_idx
  ON public.telegram_messages(telegram_chat_id, telegram_date);
CREATE INDEX IF NOT EXISTS telegram_messages_status_idx
  ON public.telegram_messages(processing_status);
CREATE INDEX IF NOT EXISTS telegram_homework_links_homework_idx
  ON public.telegram_homework_links(homework_id);
CREATE INDEX IF NOT EXISTS homework_attachments_homework_idx
  ON public.homework_attachments(homework_id);

ALTER TABLE public.telegram_bot_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_homework_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_bot_chats_read_authenticated ON public.telegram_bot_chats;
CREATE POLICY telegram_bot_chats_read_authenticated
  ON public.telegram_bot_chats FOR SELECT TO authenticated
  USING (
    group_id IS NULL OR EXISTS (
      SELECT 1 FROM public.group_memberships gm
      WHERE gm.group_id = telegram_bot_chats.group_id
        AND gm.user_id = (SELECT auth.uid())
        AND gm.is_active = true
    )
  );

DROP POLICY IF EXISTS telegram_messages_read_group ON public.telegram_messages;
CREATE POLICY telegram_messages_read_group
  ON public.telegram_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.telegram_bot_chats c
      JOIN public.group_memberships gm ON gm.group_id = c.group_id
      WHERE c.telegram_chat_id = telegram_messages.telegram_chat_id
        AND gm.user_id = (SELECT auth.uid())
        AND gm.is_active = true
    )
  );

DROP POLICY IF EXISTS telegram_homework_links_read_group ON public.telegram_homework_links;
CREATE POLICY telegram_homework_links_read_group
  ON public.telegram_homework_links FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.homeworks h
      JOIN public.group_memberships gm ON gm.group_id = h.group_id
      WHERE h.id = telegram_homework_links.homework_id
        AND gm.user_id = (SELECT auth.uid())
        AND gm.is_active = true
    )
  );

DROP POLICY IF EXISTS homework_attachments_read_group ON public.homework_attachments;
CREATE POLICY homework_attachments_read_group
  ON public.homework_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.homeworks h
      LEFT JOIN public.group_memberships gm ON gm.group_id = h.group_id
      WHERE h.id = homework_attachments.homework_id
        AND (h.group_id IS NULL OR (gm.user_id = (SELECT auth.uid()) AND gm.is_active = true))
  )
);

GRANT SELECT ON public.telegram_bot_chats, public.telegram_messages,
  public.telegram_homework_links, public.homework_attachments TO authenticated;
