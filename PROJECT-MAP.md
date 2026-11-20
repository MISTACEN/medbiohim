# Карта проекта MEDBIOHIM — где что лежит

**Обновлена:** 2026-11-20. Актуальный main: `b75a75ae`.

Сопутствующие документы: [ROADMAP.md](ROADMAP.md) — план/этапы/статус; [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md) — сводная таблица. Архитектура: [MODULE-ARCHITECTURE.md](docs/architecture/MODULE-ARCHITECTURE.md), [ADR/](docs/architecture/adr/).

---

## Как работать с новой архитектурой (главное)

### Новая страница
```text
src/app/домен/page.tsx          ≤200 строк
src/components/домен/           модель + хук + компоненты
src/lib/api/домен.ts            API-клиент (fetch)
```

### Новый маршрут API
```text
workers/api/src/routes/домен.ts  (баррель)
workers/api/src/routes/домен/    01-*.ts, 02-*.ts … shared.ts, types.ts
```
Каждый файл ≤400 строк. Guard обязателен (requireAuth или requireAdmin).

### Новый подмодуль предмета
```bash
node scripts/new-module.mjs <slug> --title "Название" --subject <subject_slug> --tab key:Заголовок
```

### Новый кэш списка
Добавить политику в `workers/api/src/lib/cache.ts`, обернуть GET в `cached()`.

---

## Что сделано

### Декомпозиция: 40 страниц, 22 маршрута, 2 модуля — 0 сверх лимита
### Дубли: 6 групп слиты (timing, escapeHtml, caller-roles, bodyJson, content-json, download)
### Инфраструктура: кэш (5 политик), пагинация, реестр подмодулей, генератор, LOC-бюджет, route guards
### Документация: MODULE-ARCHITECTURE.md (13 разделов), 4 ADR, LECTURES-MAP.md, PROJECT-STRUCTURE.md

---

## Осталось (требует твоего решения)

1. **Деплой на Vercel** — автоматически подхватит main после push ✅
2. **Функциональные доработки** ❌ из ROADMAP (графики, иерархия факультетов)
