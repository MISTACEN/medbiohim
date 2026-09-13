# Медбиохим

Образовательная платформа (Next.js demo UI).

**Репозиторий:** [github.com/MISTACEN/medbiohim](https://github.com/MISTACEN/medbiohim) (приватный)

## Запуск локально

```bash
npm install
npm run dev
```

http://localhost:3000

## Деплой на Vercel

1. Откройте [vercel.com/new](https://vercel.com/new)
2. Import Git Repository → выберите `MISTACEN/medbiohim`
3. Framework: **Next.js** (auto)
4. Root Directory: `.` (корень репо)
5. Deploy

Или CLI:

```bash
npx vercel
```

## Стек

- Frontend: Next.js 15 + React 19 + Tailwind + TypeScript
- Backend (scaffold): PHP 8.4 на SpaceWeb — отдельно
- Data: Supabase + Backblaze B2 — следующий этап

Сейчас UI работает на **mock-данных**.
