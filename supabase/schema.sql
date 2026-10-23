-- SplitSmart: personal expenses and authenticated access.
--
-- Run this first in the Supabase SQL Editor. It is safe to run again.
-- For shared groups, run schema_hour6.sql after this file.

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  emoji       text not null default '🧾',
  paid_by     text not null,
  amount      numeric not null check (amount > 0),
  category    text not null default 'Other',
  expense_date date not null default current_date,
  created_at  timestamptz not null default now()
);

alter table public.expenses
  add column if not exists category text not null default 'Other',
  add column if not exists expense_date date not null default current_date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_amount_positive'
  ) then
    alter table public.expenses
      add constraint expenses_amount_positive check (amount > 0) not valid;
  end if;
end
$$;

create index if not exists expenses_user_created_idx
  on public.expenses (user_id, created_at desc);

alter table public.expenses enable row level security;

revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;

-- Replace older policies as well as the current policies so permissive
-- policies from a previous run cannot accidentally widen access.
drop policy if exists "read own expenses" on public.expenses;
drop policy if exists "insert own expenses" on public.expenses;
drop policy if exists "update own expenses" on public.expenses;
drop policy if exists "delete own expenses" on public.expenses;
drop policy if exists "see group expenses" on public.expenses;
drop policy if exists "add group expenses" on public.expenses;
drop policy if exists "delete group expenses" on public.expenses;
drop policy if exists "expenses_select" on public.expenses;
drop policy if exists "expenses_insert" on public.expenses;
drop policy if exists "expenses_update" on public.expenses;
drop policy if exists "expenses_delete" on public.expenses;

-- Use group membership checks if the group migration has already been run.
-- Otherwise keep this table scoped to each authenticated user.
do $$
declare
  has_group_access boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'group_id'
  ) and to_regprocedure('public.is_active_group_member(uuid)') is not null
  into has_group_access;

  if has_group_access then
    execute $policy$
      create policy expenses_select on public.expenses
      for select to authenticated
      using (auth.uid() = user_id or (group_id is not null and public.is_group_member(group_id)))
    $policy$;
    execute $policy$
      create policy expenses_insert on public.expenses
      for insert to authenticated
      with check (
        auth.uid() = user_id
        and (group_id is null or public.is_active_group_member(group_id))
      )
    $policy$;
    execute $policy$
      create policy expenses_update on public.expenses
      for update to authenticated
      using (auth.uid() = user_id and (group_id is null or public.is_active_group_member(group_id)))
      with check (auth.uid() = user_id and (group_id is null or public.is_active_group_member(group_id)))
    $policy$;
    execute $policy$
      create policy expenses_delete on public.expenses
      for delete to authenticated
      using (auth.uid() = user_id and (group_id is null or public.is_active_group_member(group_id)))
    $policy$;
  else
    create policy expenses_select on public.expenses
      for select to authenticated using (auth.uid() = user_id);
    create policy expenses_insert on public.expenses
      for insert to authenticated with check (auth.uid() = user_id);
    create policy expenses_update on public.expenses
      for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
    create policy expenses_delete on public.expenses
      for delete to authenticated using (auth.uid() = user_id);
  end if;
end
$$;
