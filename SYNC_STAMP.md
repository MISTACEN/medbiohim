# Full repository sync

**Date:** 2026-09-16
**HEAD trigger:** force Vercel rebuild after admin questions CMS

**Must build from this commit or later** (not `68cd4ca`):
- `src/lib/api.ts` exports `adminListQuestions`, `adminCreateQuestion`, `adminUpdateQuestion`, `adminDeleteQuestion`
- also: `listSessions`, `createSession`, `listQuestions`, `listTicketBanks`, `listTrainers`, …
- `src/app/admin/questions/page.tsx` requires those exports

Previous failed build used `68cd4ca` (page without matching api exports).
Fixed on `main` starting `f8a527d` / `d45d7aa`.
