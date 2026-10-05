-- Canonicalize exact normalized duplicates where the supplied ZIP-backed
-- curated question exists. Rewire test links, then archive duplicate rows.
-- Intentionally leaves ambiguous malformed groups for manual/source review.
WITH pairs(canonical,duplicate) AS (VALUES
 ('390ff7b6-a716-494b-820d-52e42c78f0a5'::uuid,'f6ca3242-92cf-5d6f-929a-7036e5fa6059'::uuid),
 ('1f14ae2f-39ef-4b0b-9103-12fb3e893a6f'::uuid,'232e5c7e-4a21-5edd-ae0f-5f627a63361f'::uuid),
 ('968f7698-5fe3-5cd0-87f3-a5b9ac19719e'::uuid,'c8d6477f-e9a6-4f23-b9c4-92ee6c4f9f46'::uuid),
 ('04a097a9-47eb-5afa-8427-0d613d5e2067'::uuid,'45690cdf-b936-4364-b478-71120c332eb7'::uuid),
 ('b3536eb8-78db-49f1-86fd-8ed9f5e0709e'::uuid,'c6d00163-4d05-513f-8d54-bf4e4695c21a'::uuid),
 ('4ee8038c-b661-5a56-8521-da7d46083f0d'::uuid,'7741df62-1748-4c4a-bea0-00701d5f749e'::uuid),
 ('6cc5bfb5-bb92-441c-8fca-0309d0e5124a'::uuid,'db609f03-0f66-5413-89c8-873f748b0673'::uuid),
 ('20843f03-d286-58c5-b22b-b3c8af3e6a2c'::uuid,'60403da0-7f8f-42cc-913f-37f9c0612826'::uuid),
 ('12f303c4-bf05-5cc0-8f43-936b65ce4489'::uuid,'759a3d70-b921-4635-84ed-df85a5ee89b1'::uuid),
 ('0ffc4155-410f-570a-887e-2c56882f3903'::uuid,'17eb0d90-fe55-44a6-bfa1-bb9a09b54e85'::uuid),
 ('2164f8aa-ec24-4ffe-878e-815a0835bf8e'::uuid,'29171f04-1782-5936-9116-a06987342a45'::uuid),
 ('4769e514-886b-4e4e-8899-b57f12c73fa3'::uuid,'571ebe81-a15e-505a-b23a-501485f0604a'::uuid),
 ('146f43e1-afce-4f45-863a-b71a0274a97c'::uuid,'8231acab-ada1-5ebd-b648-3ed40590f686'::uuid),
 ('99da61f0-b61b-4f00-8542-2805fdf7adda'::uuid,'b485dc07-8cc4-5ad8-b2e4-5cde7f2c92e8'::uuid)
)
UPDATE public.test_questions tq SET question_id=p.canonical
FROM pairs p
WHERE tq.question_id=p.duplicate
  AND NOT EXISTS (SELECT 1 FROM public.test_questions tq2 WHERE tq2.test_id=tq.test_id AND tq2.question_id=p.canonical);

WITH pairs(canonical,duplicate) AS (VALUES
 ('390ff7b6-a716-494b-820d-52e42c78f0a5'::uuid,'f6ca3242-92cf-5d6f-929a-7036e5fa6059'::uuid),
 ('1f14ae2f-39ef-4b0b-9103-12fb3e893a6f'::uuid,'232e5c7e-4a21-5edd-ae0f-5f627a63361f'::uuid),
 ('968f7698-5fe3-5cd0-87f3-a5b9ac19719e'::uuid,'c8d6477f-e9a6-4f23-b9c4-92ee6c4f9f46'::uuid),
 ('04a097a9-47eb-5afa-8427-0d613d5e2067'::uuid,'45690cdf-b936-4364-b478-71120c332eb7'::uuid),
 ('b3536eb8-78db-49f1-86fd-8ed9f5e0709e'::uuid,'c6d00163-4d05-513f-8d54-bf4e4695c21a'::uuid),
 ('4ee8038c-b661-5a56-8521-da7d46083f0d'::uuid,'7741df62-1748-4c4a-bea0-00701d5f749e'::uuid),
 ('6cc5bfb5-bb92-441c-8fca-0309d0e5124a'::uuid,'db609f03-0f66-5413-89c8-873f748b0673'::uuid),
 ('20843f03-d286-58c5-b22b-b3c8af3e6a2c'::uuid,'60403da0-7f8f-42cc-913f-37f9c0612826'::uuid),
 ('12f303c4-bf05-5cc0-8f43-936b65ce4489'::uuid,'759a3d70-b921-4635-84ed-df85a5ee89b1'::uuid),
 ('0ffc4155-410f-570a-887e-2c56882f3903'::uuid,'17eb0d90-fe55-44a6-bfa1-bb9a09b54e85'::uuid),
 ('2164f8aa-ec24-4ffe-878e-815a0835bf8e'::uuid,'29171f04-1782-5936-9116-a06987342a45'::uuid),
 ('4769e514-886b-4e4e-8899-b57f12c73fa3'::uuid,'571ebe81-a15e-505a-b23a-501485f0604a'::uuid),
 ('146f43e1-afce-4f45-863a-b71a0274a97c'::uuid,'8231acab-ada1-5ebd-b648-3ed40590f686'::uuid),
 ('99da61f0-b61b-4f00-8542-2805fdf7adda'::uuid,'b485dc07-8cc4-5ad8-b2e4-5cde7f2c92e8'::uuid)
)
UPDATE public.questions q SET is_published=false, archived_at=COALESCE(archived_at,now())
FROM pairs p WHERE q.id=p.duplicate;
