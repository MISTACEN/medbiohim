# MEDBIOHIM — расписание

Production source of truth for the schedule is Supabase (`public.schedules` + `public.schedule_entries`). The legacy `backend/data/schedule.json` remains only as old/demo data and is not used by the new schedule API.

## API

- `GET /api/v1/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD` — latest schedule version for the authenticated user's groups.
- `GET /api/v1/admin/schedule?group_id=...&semester=...` — latest schedule for admin/editor screens.
- `PUT /api/v1/admin/schedule` — creates an immutable new schedule version for a group/semester.

Each entry supports date, start/end time, subject, type, room, building, notes and cancellation flag.

The frontend week view provides previous/next week and Today navigation and groups lessons by date.
