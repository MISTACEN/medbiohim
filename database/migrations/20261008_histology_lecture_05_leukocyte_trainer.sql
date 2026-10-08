-- Histology Lecture 05: interactive leukocyte differential trainer.
-- Scope: ONLY lec-histology-blood-20261008.
-- Idempotent: inserts one Markdown special block only when absent.
DO $migration$
DECLARE
  v_payload jsonb;
  v_body text;
  v_fence text := chr(96)||chr(96)||chr(96);
  v_block text := v_fence||'leukocyte' || E'\n' ||
    '{"title":"Лейкоцитарная формула — тренажёр","mode":"mixed","sourceMode":"mixed","rounds":12}' ||
    E'\n' || v_fence;
  v_new text;
BEGIN
  SELECT payload INTO v_payload
  FROM public.site_content
  WHERE key='lectures'
  LIMIT 1;

  IF v_payload IS NULL THEN
    RETURN;
  END IF;

  SELECT item->>'body_md' INTO v_body
  FROM jsonb_array_elements(COALESCE(v_payload->'items','[]'::jsonb)) item
  WHERE item->>'id'='lec-histology-blood-20261008'
  LIMIT 1;

  IF v_body IS NULL OR position(v_fence||'leukocyte' in v_body) > 0 THEN
    RETURN;
  END IF;

  v_new := replace(
    v_body,
    '## 13. Мини-проверка',
    E'## 13A. Интерактивный тренажёр: проценты → ↑/↓ → мазок\n\n' ||
    '> Сначала вспоминай учебные проценты из Лекции 5, затем определяй повышение/снижение и только после этого переходи к распознаванию клетки по мазку. Для независимой визуальной проверки доступны отдельные внешние изображения.\n\n' ||
    v_block ||
    E'\n\n## 13. Мини-проверка'
  );

  IF v_new = v_body THEN
    RETURN;
  END IF;

  v_payload := jsonb_set(
    v_payload,
    '{items}',
    (
      SELECT jsonb_agg(
        CASE
          WHEN item->>'id'='lec-histology-blood-20261008'
          THEN jsonb_set(item,'{body_md}',to_jsonb(v_new),true)
          ELSE item
        END
      )
      FROM jsonb_array_elements(COALESCE(v_payload->'items','[]'::jsonb)) item
    ),
    true
  );

  UPDATE public.site_content
  SET payload=v_payload,
      updated_at=now()
  WHERE key='lectures';
END
$migration$;