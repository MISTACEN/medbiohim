-- Счётчик переходов на внешние учебные платформы (этап 5 плана интеграции).
-- Только публичная навигация: platform, title, href из src/data/external-platforms.ts.
create table if not exists public.external_platform_clicks (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('neofamily', 'sechenov')),
  title text not null,
  href text not null,
  subject_slug text,
  created_at timestamptz not null default now()
);

create index if not exists external_platform_clicks_created_at_idx
  on public.external_platform_clicks (created_at desc);

create index if not exists external_platform_clicks_platform_href_idx
  on public.external_platform_clicks (platform, href);

-- Анонимная запись разрешена (счётчик публичный), чтение — только через сервисный ключ.
alter table public.external_platform_clicks enable row level security;

create policy "external_platform_clicks_insert_anon"
  on public.external_platform_clicks
  for insert
  to anon, authenticated
  with check (true);
