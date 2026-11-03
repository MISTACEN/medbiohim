# MEDBIOHIM — LIVE PROJECT SNAPSHOT — 2026-10-06

Источник цифр: read-only SQL against Supabase project gnobvyjywtqbdfeejxmf on 2026-10-06.

## Core live counts

| Entity | Live count |
|---|---:|
| users | 4 |
| active group memberships | 4 |
| active groups | 4 |
| active subjects | 110 |
| published tests | 32 |
| published + non-archived questions | 660 |
| published exam questions | 776 |
| published materials | 80 |
| published trainer cards | 206 |
| question reports | 0 |

## Current academic session

Current session:

- title: 2026/2027 · 2 курс · 3 семестр
- type: primary
- course: 2
- semester: 3
- start: 2026-09-01
- end: 2027-01-30
- is_current: true

## Important semantic finding

Active subject slugs are not globally unique.

Current duplicate active slugs include:
- chemistry_organic_physical — 3 subjects;
- informatics — 3;
- physiology — 3;
- biology — 2;
- history — 2;
- optics — 2;
- philosophy — 2;
- математический_анализ — 2.

Therefore subject_slug cannot be an authoritative identity selector. Subject UUID must remain authoritative and the selected academic context must accompany the action.

## Schedule/group snapshot

Active groups currently include:
- МБХ 201 / МБХ-201 / course 2 / specialty mbh;
- Медико-биологический 301 / МБ-301 / course 3 / specialty mbh;
- plus two active groups with no course/specialty metadata.

The application currently has multiple active memberships, so any write or context-sensitive read that needs one academic group must accept an explicit group UUID or return GROUP_REQUIRED.

## Documentation rule

This file is the numeric live snapshot. ROADMAP/PHASES_STATUS should describe status and link to this snapshot rather than duplicate stale counts.

No production data was modified by this snapshot query.
