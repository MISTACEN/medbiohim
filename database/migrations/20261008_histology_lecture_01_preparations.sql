-- Histology Lecture 01: explicit introductory cell preparations
-- Date: 2026-10-08
-- Scope: histology only. Rerunnable by stable lecture id.
BEGIN;

UPDATE public.site_content
SET payload = jsonb_set(
  payload,
  '{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-plan-01-20261008' THEN
          item || jsonb_build_object(
            'related_learning',
            coalesce(item->'related_learning','{}'::jsonb) ||
            jsonb_build_object(
              'preparations', jsonb_build_array(
                jsonb_build_object(
                  'trainer_id','feed-prep-7a6cad3f20',
                  'name','Клетка и ее пр. Животная кл',
                  'source_key','histology-photo-be7528fc5372ebe98e1d00580cfd1c6c',
                  'label','Клетка и ее пр. Животная кл'
                ),
                jsonb_build_object(
                  'trainer_id','feed-prep-93165b7921',
                  'name','Клетка и ее пр. Межклет. вещ',
                  'source_key','histology-photo-4f5bd167c8a42e9c6657bbdf69fa7831',
                  'label','Клетка и ее пр. Межклет. вещ'
                ),
                jsonb_build_object(
                  'trainer_id','feed-prep-e9636e97ba',
                  'name','Клетка и ее пр. Симпласт',
                  'source_key','histology-photo-7a01212dd238f66e99c686b92a8994ab',
                  'label','Клетка и ее пр. Симпласт'
                )
              ),
              'preparations_note',
              'Три клеточных микропрепарата из source archive привязаны как практический визуальный материал к вводной лекции.'
            )
          )
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),
  true
),
updated_at=now()
WHERE key='lectures';

COMMIT;
