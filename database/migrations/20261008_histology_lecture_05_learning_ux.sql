-- Histology Lecture 05 learning UX:
-- 1) logical theory blocks followed by database-backed mini quizzes;
-- 2) canonical trainer photos are shown as single specimen cards, with title/metadata
--    loaded from the trainer card instead of duplicating captions in lecture content;
-- 3) the old photo wall at the end of the lecture is replaced by contextual visual checkpoints.
-- Scope: ONLY Histology Lecture 05.

DO $migration$
DECLARE
  v_payload jsonb;
  v_body text;
  v_new_body text;
BEGIN
  SELECT payload INTO v_payload
  FROM public.site_content
  WHERE key = 'lectures'
  LIMIT 1;

  IF v_payload IS NULL THEN
    RAISE NOTICE 'site_content/lectures not found; nothing to update';
    RETURN;
  END IF;

  SELECT item->>'body_md'
    INTO v_body
  FROM jsonb_array_elements(COALESCE(v_payload->'items','[]'::jsonb)) AS item
  WHERE item->>'id' = 'lec-histology-blood-20261008'
  LIMIT 1;

  IF v_body IS NULL THEN
    RAISE NOTICE 'Lecture 05 not found; nothing to update';
    RETURN;
  END IF;

  v_new_body := v_body;

  IF position('"title":"Кровь как ткань"' in v_body) = 0 THEN
    v_new_body := replace(
    v_new_body,
    $needle$## 2. Эритроциты — Erythrocyti$needle$,
    $quiz$
```quiz
{"subjectId":"977d78ca-7a58-4b0a-9e93-29d8e03f6946","title":"Кровь как ткань","questionIds":["8c1922f5-dd89-4f71-af30-5608e40e8454","fdf83b6d-ec68-450d-81b5-e52573294d1e","40a50617-c006-48f8-b83a-be300e095613"]}
```

## 2. Эритроциты — Erythrocyti$quiz$
  );

  v_new_body := replace(
    v_new_body,
    $needle$## 3. Тромбоциты — Thrombocyti$needle$,
    $visual$
### Визуальная проверка: общий мазок крови

```image
{"trainerId":"feed-prep-9f7dc534b5"}
```

```image
{"trainerId":"feed-prep-a47e9dc83a"}
```

Сначала определи клетки самостоятельно, затем открой карточку изображения для названия и морфологических признаков. Повторный список этих же препаратов в конце лекции не нужен.

## 3. Тромбоциты — Thrombocyti$visual$
  );

  IF position('"title":"Эритроциты: морфология"' in v_new_body) = 0 THEN
    v_new_body := replace(
      v_new_body,
      $needle$## 3. Тромбоциты — Thrombocyti$needle$,
      $quiz$
```quiz
{"subjectId":"977d78ca-7a58-4b0a-9e93-29d8e03f6946","title":"Эритроциты: морфология","questionIds":["6e7a5062-be40-4668-b445-b944181b74f2","bb9af8f2-4ca5-4c9a-bf6a-38e746e95d8c","83abf176-a5c9-48d7-83c8-03f761857775"]}
```

## 3. Тромбоциты — Thrombocyti$quiz$
    );
  END IF;

  v_new_body := replace(
    v_new_body,
    $needle$## 5. Гемограмма$needle$,
    $quiz$
```quiz
{"subjectId":"977d78ca-7a58-4b0a-9e93-29d8e03f6946","title":"Форменные элементы: практическое распознавание","questionIds":["0ff57ab7-0357-43b9-b6c4-b9cd31176e6e","930d7ae8-6e6a-4c85-a018-e780a6b12033","f044f188-09b1-4e35-8d1c-c7addd16c027"]}
```

## 5. Гемограмма$quiz$
  );

  v_new_body := replace(
    v_new_body,
    $needle$## 5. Гемограмма$needle$,
    $visual$
### Визуальная проверка: лейкоциты и тромбоциты

```image
{"trainerId":"feed-prep-a2feb3ec86"}
```

```image
{"trainerId":"feed-prep-bca30caf3b"}
```

```image
{"trainerId":"feed-prep-60e72c3e7e"}
```

Здесь достаточно одной связки: сравни размер и ядро лимфоцита/моноцита, затем отдельно найди мелкие тромбоциты. Эти изображения не повторяются отдельным списком ниже.

## 5. Гемограмма$visual$
  );


  v_payload := jsonb_set(
    v_payload,
    '{items}',
    (
      SELECT jsonb_agg(
        CASE
          WHEN item->>'id' = 'lec-histology-blood-20261008'
          THEN jsonb_set(item, '{body_md}', to_jsonb(v_new_body), true)
          ELSE item
        END
      )
      FROM jsonb_array_elements(COALESCE(v_payload->'items','[]'::jsonb)) AS item
    ),
    true
  );

  UPDATE public.site_content
  SET payload = v_payload,
      updated_at = now()
  WHERE key = 'lectures';
END
$migration$;
