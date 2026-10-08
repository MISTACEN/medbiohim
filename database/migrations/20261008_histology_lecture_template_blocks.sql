-- Histology lecture template blocks based on Lecture 05 canonical format
-- Scope: current 3rd-semester Histology lectures except Lecture 05, which already is the full exemplar.
BEGIN;

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-plan-01-20261008'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Введение. Клетка и клеточная теория"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-7a6cad3f20","caption":"Клетка и ее пр. Животная кл"}
```

```image
{"trainerId":"feed-prep-93165b7921","caption":"Клетка и ее пр. Межклет. вещ"}
```

```image
{"trainerId":"feed-prep-e9636e97ba","caption":"Клетка и ее пр. Симпласт"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Введение. Клетка и клеточная теория",
  "questionIds": [
    "61431a2f-10b4-574e-bf25-e67a6d90a1f1",
    "2ce51b23-ee0a-53e2-b2c2-ee98e5f02f4c",
    "0bb5c475-f9fa-51b1-b767-54d7e1e816b2"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-cytology'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Цитоплазма, органеллы, включения, ядро, клеточный цикл"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-39fbedbf71","caption":"Включения гликогена"}
```

```image
{"trainerId":"feed-prep-9d6443a5e3","caption":"Жировые включения"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Цитоплазма, органеллы, включения, ядро, клеточный цикл",
  "questionIds": [
    "0794a94f-7a99-450c-8a2a-48d1c07b2318",
    "2976c343-eb70-45a5-b164-0a6ab2eb0868",
    "30ef3cf2-923f-42c6-a5e1-397f271f74cd"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-embryology'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Общая эмбриология и половые клетки"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-fe18ae0ec6","caption":"Эмбриогенез. Плацента, плодная часть"}
```

```image
{"trainerId":"feed-prep-541085df21","caption":"Эмбриогенез. Плацента, материнская часть"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Общая эмбриология и половые клетки",
  "questionIds": [
    "01a5ca16-3f6d-4244-bbe8-838be3329b11",
    "22c04ac5-108b-4406-af9c-3308bffe28a4",
    "37db8da4-792c-4501-a91d-5ac3d48f5f0e"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-epithelium'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Эпителиальные ткани"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-faf5c56e6f","caption":"Многослойный переходный"}
```

```image
{"trainerId":"feed-prep-6b07de1df2","caption":"Цилиндрический эпителий"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Эпителиальные ткани",
  "questionIds": [
    "052dbbea-58ba-4fb8-8bec-205c9f4a4eb9",
    "13138dfb-3da2-49c7-9027-97c5fdf23020",
    "15047620-6a0d-4507-a5f3-aeccb90f3b4b"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-connective'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Соединительные ткани"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-ca632ba774","caption":"Ретикулярная ткань"}
```

```image
{"trainerId":"feed-prep-03d5e052f0","caption":"Соед.тк. Фибробласты"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Соединительные ткани",
  "questionIds": [
    "60d0b5a6-a8ef-4f23-87cc-62008aec998e",
    "7e21b023-c1cd-40fb-a473-3e3785862a5f",
    "8dc593fa-09ae-4da3-96c0-0a080e4316e4"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-bone_muscle'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Хрящ, кость и развитие кости"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-be5aa9a6f4","caption":"Гиалиновый хрящ"}
```

```image
{"trainerId":"feed-prep-3b500d1e4c","caption":"Развитие кости на месте мезенхимы"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Хрящ, кость и развитие кости",
  "questionIds": [
    "155df9f6-84f9-4d7c-889b-2e12ac43fa05",
    "1ce38c9f-a51c-418a-8408-905cdd1f51b5",
    "3acea6a4-256c-4b58-8987-5e4070a313e2"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-plan-08-20261008'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Мышечные ткани"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-8dddaad9dc","caption":"Артерия мышечного типа"}
```

```image
{"trainerId":"feed-prep-b26968a511","caption":"Мышечная тк. Гл. мыш. ткань"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Мышечные ткани",
  "questionIds": [
    "34202ea2-afb3-499c-8c45-75a2cb26d67b",
    "367ed7ab-51f3-4d2e-8590-8571dd4c54a6",
    "464d1816-fa47-4bc9-9a3c-f5fd4e5c680c"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-nerve_tissue'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Нервная ткань"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-369595730e","caption":"Астроцитарная глия"}
```

```image
{"trainerId":"feed-prep-ffdac73431","caption":"Нервная тк. Нейроны. Хроматофильная субстанция"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Нервная ткань",
  "questionIds": [
    "587f0cec-066b-419b-97de-984b69be8501",
    "8779f9ff-669b-4930-b449-f9347a234494",
    "cda07565-8b4d-461e-a259-74af0fd7fb88"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-nervous_system'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Спинной мозг, ганглий, периферический нерв"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-7bfe2cafed","caption":"Периферический нерв"}
```

```image
{"trainerId":"feed-prep-994d2e3139","caption":"Периферический нерв"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Спинной мозг, ганглий, периферический нерв",
  "questionIds": [
    "4185d7d3-76d7-4068-9b8b-80df7bfb9b3f",
    "59db6c81-1de5-461c-82af-8c43b22a48e4",
    "8735a05f-6652-44ec-99c4-aecb6d4b3084"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-plan-11-20261008'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Кора, мозжечок и ВНС"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-06e9fc4a90","caption":"Кора мозжечка"}
```

```image
{"trainerId":"feed-prep-73fd49dad2","caption":"Кора мозжечка"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Кора, мозжечок и ВНС",
  "questionIds": [
    "0e3e126d-2646-43d5-932a-97683e7e11e1",
    "fa57b2e7-b694-4147-8700-a36dfd326d7d"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-sensory'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Зрение, обоняние, слух, равновесие, вкус"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-3fb5c04858","caption":"Анализаторы. Развитие глаза"}
```

```image
{"trainerId":"feed-prep-bd5035dc8a","caption":"Анализаторы. Кортиев орган, б.ув"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Зрение, обоняние, слух, равновесие, вкус",
  "questionIds": [
    "2da70a8d-3ed3-47f8-911e-3e9dd6d76aaf",
    "8c58d37f-4e74-496a-8822-1e001c681d9a",
    "95804f2d-bacf-4604-ac13-d3a1ca209a1b"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-cvs'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Сердечно-сосудистая система"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-6736da285a","caption":"Аорта"}
```

```image
{"trainerId":"feed-prep-867c9e401e","caption":"Мелкие сосуды"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Сердечно-сосудистая система",
  "questionIds": [
    "0bf2dc09-59b8-460c-ac49-eec7283eb77a",
    "5c080344-174c-4b4a-b878-a23b20a5b39f",
    "79563d01-e5eb-459c-a63e-ae10272084dd"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-endocrine'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Эндокринная система"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-106de4040d","caption":"Гипофиз"}
```

```image
{"trainerId":"feed-prep-687054a55a","caption":"Гипофиз"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Эндокринная система",
  "questionIds": [
    "1f7b90e0-7155-4b1a-83d2-ef8bc2dc927a",
    "2327dd6c-1d4c-4c54-b64f-1e15cda0d717",
    "2ab7fab5-ade1-47aa-9dd1-ad3e71fc333f"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-hematopoiesis'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Кроветворение и иммунная защита"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-44d3102c32","caption":"Красный костный мозг"}
```

```image
{"trainerId":"feed-prep-ff85aa0c5c","caption":"Кроветворение. Лимфоузел, корковое вещество"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Кроветворение и иммунная защита",
  "questionIds": [
    "028f3992-62ed-40a0-b0c7-b01e8e218296",
    "1bc90d15-12ba-4fe5-a165-6626fc034662",
    "a9334eb8-2fda-451c-879e-1021045de79c"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

UPDATE public.site_content
SET payload=jsonb_set(
  payload,'{items}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN item->>'id'='lec-hist-stom_mbh'
         AND position('<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->' in coalesce(item->>'body_md',''))=0
        THEN item || jsonb_build_object('body_md',coalesce(item->>'body_md','') || '<!-- MEDBIOHIM-LECTURE-TEMPLATE-V1 -->


---

## Практический блок по эталону Лекции 5

Схема занятия: теория → распознавание препарата → контроль вопросами. Блоки используют только канонические материалы текущей темы.

```mermaid
flowchart LR
A["Пищеварительный канал: ротовая полость"]
B["Теория"]
C["Практическое распознавание"]
D["Мини-тест"]
A --> B
B --> C
C --> D
```

```image
{"trainerId":"feed-prep-1d52fc685f","caption":"Губа"}
```

```image
{"trainerId":"feed-prep-5ad85c038c","caption":"Сосочки языка"}
```

### Контроль после блока

```quiz
{
  "subjectId": "977d78ca-7a58-4b0a-9e93-29d8e03f6946",
  "title": "Проверь себя · Пищеварительный канал: ротовая полость",
  "questionIds": [
    "0482fc72-574c-4b87-a7b0-f762d452ea83",
    "15e6381f-eb7c-4647-9b15-84055245651c",
    "2492ae66-d3ba-4342-98bb-c55c8f695c28"
  ]
}
```

После этого блока вернись к связанным материалам лекции и сравни морфологические признаки на реальном препарате с теорией.
')
        ELSE item
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(payload->'items') WITH ORDINALITY x(item,ord)
  ),true
),updated_at=now()
WHERE key='lectures';

COMMIT;
