-- Закрывает подмену результата диагностикума.
--
-- Раньше `authenticated` мог делать `update` по `diagnosticum_attempts`
-- (через PostgREST с anon-ключом), то есть выставить себе `score`, `correct`
-- или стереть `hints_used`. Проверка ответа теперь пишет только серверным
-- клиентом (service role), поэтому грант на запись можно отозвать.
--
-- Миграция аддитивная: только права, данные и схема не меняются. Грант insert
-- остаётся — `/diagnosticum/start` создаёт попытку клиентом пользователя.
-- `select` тоже остаётся: история и статистика читаются под RLS.

revoke update on public.diagnosticum_attempts from authenticated;
revoke update on public.diagnosticum_attempts from anon;

-- На случай, если грант был выдан роли через группу: явно фиксируем минимум.
grant select, insert on public.diagnosticum_attempts to authenticated;
grant select, insert on public.diagnosticum_attempts to anon;
