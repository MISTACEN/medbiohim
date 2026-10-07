-- Align Supabase RLS with backend FileRepository access semantics.
-- Group-scoped files require active membership; group-less files are public only
-- when explicitly marked public (or accessible to their uploader).
drop policy if exists files_read_allowed on public.files;

create policy files_read_allowed
on public.files
for select
to authenticated
using (
  uploaded_by = (select auth.uid())
  or visibility = 'public'
  or exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = files.group_id
      and gm.user_id = (select auth.uid())
      and gm.is_active = true
  )
);
