# Химическое ядро MedBioHim — план и реализуемость

> БД/миграции — отдельно (GPT). Здесь код и архитектура.

## Уже на main

| Функция | Статус |
|---------|--------|
| ChemicalMolecule + provenance | ✅ |
| PubChem resolve (name/SMILES/InChI) | ✅ |
| StructureImage[] + приоритет источников | ✅ |
| UI provenance + «Открыть источник» | ✅ |
| StructureView: RDKit SVG (если WASM) → PubChem PNG | ✅ |
| Sidebar /chemistry | ✅ |
| SQL schema files | ✅ (применить вручную) |

## Приоритет изображения (в ядре)

```
SMILES ──► RDKit WASM ──► SVG (generated)     ← предпочтительно
                │ нет WASM
                ▼
CID ────────► PubChem PNG (verified)
                │
                ▼
          external curated (позже)
```

Каждая картинка несёт `kind` + `generator` + `provenance`.

## Стек (оценка)

| Возможность | Технология | Реализуемо | Фаза |
|-------------|------------|------------|------|
| 2D structure | RDKit SVG / PubChem PNG | ✅ да | **сейчас** |
| Resolve name→ids | PubChem PUG | ✅ да | сейчас |
| 3D interactive | 3Dmol.js | ✅ да | next |
| Editor | Ketcher | ✅ да (тяжёлый) | next / beta |
| Fischer/Haworth/Newman | свой renderer + RDKit coords | ⚠️ средне | beta |
| Reactions SMARTS | RDKit | ✅ да | later |
| Mechanism arrows | свой SVG | ⚠️ сложно | later |
| Photo OCR → SMILES | ML / external API | ⚠️ дорого/сложно | experiment |
| KaTeX math | уже в лекциях | ✅ | есть |
| Plotly graphs | Plotly.js | ✅ | calculators |
| math.js | npm | ✅ | calculators |
| ChEBI/Rhea import | ETL → Supabase | ✅ | data pipeline |

## Не делать с нуля

Химическую «истину» — только RDKit (+ InChI). UI не дублирует граф молекулы.

## Следующие коммиты

1. ~~types + StructureImage + StructureView~~
2. `npm i @rdkit/rdkit` (опционально) → SVG на /chemistry
3. 3Dmol viewer
4. Ketcher modal
5. Projection renderers on beta first

## OCR / интернет-картинки

Не «Google first image». Source Resolver: PubChem → ChEBI → Rhea. OCR — только beta experiment.
