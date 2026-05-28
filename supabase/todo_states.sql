create table if not exists public.todo_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.todo_states enable row level security;

grant select, insert, update on table public.todo_states to authenticated;

drop policy if exists "Users can read their own todo state" on public.todo_states;
create policy "Users can read their own todo state"
  on public.todo_states
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can create their own todo state" on public.todo_states;
create policy "Users can create their own todo state"
  on public.todo_states
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own todo state" on public.todo_states;
create policy "Users can update their own todo state"
  on public.todo_states
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
