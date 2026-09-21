# Sync stamp

- **When:** 2026-09-21
- **HEAD intent:** dashboard nearest-lesson (Asia/Vladivostok), schedule dedupe, GigaChat+Gemini LlmGateway, calculators/search/cards pages
- **Vercel:** root Next.js (`src/`) auto-deploys from `main`
- **SpaceWeb:** still manual upload of `backend/` (no auto-deploy)

## This commit
- Dashboard «Ближайшее занятие» = next upcoming slot, not semester[0]
- Frontend pages: `/calculators`, `/search`, `/cards` (fix Vercel 404)
- Backend: ContentStore schedule parts no-merge + dedupe; LlmGateway hybrid; platform dashboard upcoming filter
