# IMPLEMENTATION AUDIT — 2026-10-06 — PASS 25

## Full current-semester question/test → curriculum mapping

### Scope

Current academic context: **2 курс · 3 семестр · 2026/2027**.

Subjects with published question banks in this scope:
- Гистология, цитология — 479 questions;
- Органическая и физическая химия — 176 questions.

Published tests:
- Гистология, цитология — 9;
- Органическая и физическая химия — 21.

### Result

All **655 published questions** in these two current-semester subjects now have a canonical `topic_id`.

All **30 published tests** in these two current-semester subjects now have a canonical `topic_id`.

No current-semester question/test remains in the generic "Без темы" state.

### Histology

The existing 19 canonical lesson topics were retained.

The 206 previously untagged histology questions were mapped using their actual answer/specimen content:
- cytology → cytology weeks;
- embryology/gametes → embryology weeks;
- epithelium → week 5;
- blood/lymph → weeks 5–6;
- connective tissue → weeks 6–7;
- cartilage/bone → weeks 7–8;
- muscle → weeks 8–9;
- nervous tissue/synapses/peripheral structures → corresponding nervous-system weeks;
- sensory systems → weeks 12–13;
- cardiovascular → week 14;
- endocrine → week 15;
- hematopoiesis/immune structures → weeks 16–17;
- oral-cavity/dental material → week 18.

Questions such as kidney, uterus, ovary, lung and other material not represented by the current 18-week plan were **not falsely attached to a lesson**. They were placed under:
`Дополнительные материалы — вне текущего плана → Вне текущего 3 семестра / дополнительные препараты`.

This bucket currently contains 47 questions.

### Organic / physical chemistry

A detailed current-year lesson module was created:
`План занятий 2026/2027 — органическая и физическая химия`.

18 canonical preparation topics were created from the existing question-bank taxonomy and tied to the verified 18-lecture schedule:
- 1.1 Classification/nomenclature
- 1.2 Chemical bonding/electronic effects
- 1.3 Stereoisomerism
- 1.4 Acidity/basicity
- 2.1 Physicochemical identification
- 3.1 Alkanes/cycloalkanes
- 3.2 Alkenes/alkynes/dienes
- 3.3 Arenes
- 3.4 Halogen derivatives
- 3.5 Alcohols/phenols/ethers
- 3.6 Amines
- 3.7 Diazo compounds
- 3.8 Aldehydes/ketones
- 3.9 Carboxylic acids/derivatives
- 3.10 Heterofunctional acids
- 3.11 Five-membered heterocycles
- 3.12 Six-membered heterocycles
- 3.13 Fused heterocycles/alkaloids.

Question `source_key` provenance was used for the 1.1–3.13 mapping; no semantic guessing was used where the source taxonomy already gave an exact section.

The verified 18-lecture calendar shows 13 of these sections directly in the current calendar. Sections 3.6, 3.7, 3.11, 3.12 and 3.13 are retained as `other`/additional because they are present in the question bank but are not represented by the current 18-lecture calendar. They are therefore visible but explicitly marked as outside the current calendar.

Three aggregate chemistry tests were also placed into explicit summary topics:
- Theoretical foundations;
- Physicochemical methods;
- Main classes of organic compounds.

### UI / API

The tests curriculum map now returns:
- subject;
- module;
- topic;
- question count;
- test count;
- planned lesson date;
- curriculum status / extra flag.

The tests page displays:
- lesson topic;
- what to prepare;
- number of questions/tests;
- planned lesson date;
- explicit "Дополнительно / вне текущего календаря" marker.

The question bank filters by canonical topic.

### Safety

No ticket-bank UUIDs were changed.

No existing question text/answers were rewritten as part of this mapping.

No cross-subject or cross-course mapping was performed.

### Verification

Live Supabase verification:
- current-semester questions: 655 total, 0 untagged;
- current-semester tests: 30 total, 0 untagged;
- curriculum entries now carry lesson dates for the mapped current calendar.

Runtime/build/browser verification remains a separate gate.
