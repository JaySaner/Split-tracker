-- SplitSmart: groups, membership, and group-scoped expense access.
--
-- Run schema.sql first, then run this file. This migration is safe to rerun.
-- Six-digit join codes are bearer invitations: share them only with intended members.
-- Join attempts are limited to five incorrect codes per user every 15 minutes.
-- Every expense is shared by all current group members; membership changes rebalance existing expenses.

create or replace function public.generate_group_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  random_bytes bytea;
begin
  -- Serialize code generation so simultaneous group inserts cannot choose the
  -- same currently-unused code.
  perform pg_advisory_xact_lock(846172, 12004);
  loop
    random_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    candidate := lpad((
      (
        get_byte(random_bytes, 0)::bigint * 16777216 +
        get_byte(random_bytes, 1)::bigint * 65536 +
        get_byte(random_bytes, 2)::bigint * 256 +
        get_byte(random_bytes, 3)::bigint
      ) % 1000000
    )::text, 6, '0');
    exit when not exists (
      select 1 from public.groups where join_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  currency    text not null default 'INR',
  join_code   text not null unique default public.generate_group_join_code(),
  created_by  uuid not null references auth.users(id) on delete cascade,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.groups
  add column if not exists description text,
  add column if not exists currency text not null default 'INR',
  add column if not exists archived boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.groups
  alter column join_code
  set default public.generate_group_join_code();

-- Replace codes created by the earlier 32-character-code migration.
update public.groups
set join_code = public.generate_group_join_code()
where join_code !~ '^[0-9]{6}$';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.groups'::regclass
      and conname = 'groups_join_code_six_digits'
  ) then
    alter table public.groups
      add constraint groups_join_code_six_digits
      check (join_code ~ '^[0-9]{6}$') not valid;
  end if;
end
$$;

alter table public.groups
  validate constraint groups_join_code_six_digits;

create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members
  add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.group_members'::regclass
      and conname = 'group_members_role_check'
  ) then
    alter table public.group_members
      add constraint group_members_role_check
      check (role in ('owner', 'admin', 'member')) not valid;
  end if;
end
$$;

alter table public.expenses
  add column if not exists group_id uuid references public.groups(id) on delete restrict,
  add column if not exists paid_by_user_id uuid references auth.users(id) on delete set null;

update public.expenses
set paid_by_user_id = user_id
where group_id is not null and paid_by_user_id is null;

create index if not exists group_members_user_group_idx
  on public.group_members (user_id, group_id);
create index if not exists expenses_group_created_idx
  on public.expenses (group_id, created_at desc)
  where group_id is not null;

create table if not exists public.expense_splits (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_amount numeric(12, 2) not null check (share_amount >= 0),
  primary key (expense_id, user_id)
);

create index if not exists expense_splits_group_user_idx
  on public.expense_splits (group_id, user_id, expense_id);

alter table public.expense_splits enable row level security;
revoke all on public.expense_splits from anon, authenticated;
grant select on public.expense_splits to authenticated;

create or replace function public.rebuild_group_expense_splits(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.expense_splits
  where group_id = p_group_id;

  with member_splits as (
    select
      expense.id as expense_id,
      expense.group_id,
      expense.amount,
      member.user_id,
      row_number() over (partition by expense.id order by member.user_id) as member_number,
      count(*) over (partition by expense.id) as member_count
    from public.expenses as expense
    join public.group_members as member on member.group_id = expense.group_id
    where expense.group_id = p_group_id
  ),
  totals as (
    select expense_id, round(amount * 100)::bigint as cents
    from member_splits
    group by expense_id, amount
  )
  insert into public.expense_splits (expense_id, group_id, user_id, share_amount)
  select
    member_splits.expense_id,
    member_splits.group_id,
    member_splits.user_id,
    (
      floor(totals.cents::numeric / member_splits.member_count)
      + case
          when member_splits.member_number <= totals.cents % member_splits.member_count then 1
          else 0
        end
    ) / 100
  from member_splits
  join totals using (expense_id);
end;
$$;

create or replace function public.populate_expense_splits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.group_id is null then
    return new;
  end if;

  with eligible_members as (
    select
      user_id,
      row_number() over (order by user_id) as member_number,
      count(*) over () as member_count
    from public.group_members
    where group_id = new.group_id
  ),
  total as (
    select round(new.amount * 100)::bigint as cents
  )
  insert into public.expense_splits (expense_id, group_id, user_id, share_amount)
  select
    new.id,
    new.group_id,
    eligible_members.user_id,
    (
      floor(total.cents::numeric / eligible_members.member_count)
      + case
          when eligible_members.member_number <= total.cents % eligible_members.member_count then 1
          else 0
        end
    ) / 100
  from eligible_members
  cross join total
  on conflict (expense_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists expenses_populate_splits on public.expenses;
create trigger expenses_populate_splits
  after insert on public.expenses
  for each row execute function public.populate_expense_splits();

create or replace function public.refresh_group_expense_splits_after_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.rebuild_group_expense_splits(old.group_id);
    return old;
  end if;

  perform public.rebuild_group_expense_splits(new.group_id);
  return new;
end;
$$;

create table if not exists public.group_join_attempts (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  failed_attempts   integer not null default 0 check (failed_attempts >= 0)
);

alter table public.group_join_attempts enable row level security;
revoke all on public.group_join_attempts from anon, authenticated;

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.group_members
      where group_id = gid and user_id = auth.uid()
    );
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.groups
      where id = gid and created_by = auth.uid()
    );
$$;

create or replace function public.is_active_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.group_members as members
      join public.groups as shared_group on shared_group.id = members.group_id
      where members.group_id = gid
        and members.user_id = auth.uid()
        and shared_group.archived = false
    );
$$;

create or replace function public.is_active_group_owner(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.groups
      where id = gid and created_by = auth.uid() and archived = false
    );
$$;

-- Group creation must also create the owner's membership atomically.
create or replace function public.add_group_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (group_id, user_id)
  do update set role = 'owner';
  return new;
end;
$$;

create or replace function public.set_group_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists groups_add_creator_membership on public.groups;
create trigger groups_add_creator_membership
  after insert on public.groups
  for each row execute function public.add_group_creator_as_member();

drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_group_updated_at();

-- Repair groups created before the membership trigger existed.
insert into public.group_members (group_id, user_id, role)
select id, created_by, 'owner'
from public.groups
on conflict (group_id, user_id) do update set role = 'owner';

drop trigger if exists group_members_refresh_expense_splits on public.group_members;
create trigger group_members_refresh_expense_splits
  after insert or delete on public.group_members
  for each row execute function public.refresh_group_expense_splits_after_membership();

do $$
declare
  group_to_rebuild uuid;
begin
  for group_to_rebuild in select id from public.groups
  loop
    perform public.rebuild_group_expense_splits(group_to_rebuild);
  end loop;
end;
$$;

-- Joining requires an authenticated user and a valid six-digit invite code.
-- Failed guesses are counted without exposing whether a code exists.
-- Direct client inserts into group_members are not allowed.
create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
  joining_user uuid := auth.uid();
  attempts public.group_join_attempts%rowtype;
begin
  if joining_user is null then
    raise exception 'Sign in before joining a group';
  end if;

  insert into public.group_join_attempts (user_id)
  values (joining_user)
  on conflict (user_id) do nothing;

  select * into attempts
  from public.group_join_attempts
  where user_id = joining_user
  for update;

  if now() - attempts.window_started_at >= interval '15 minutes' then
    update public.group_join_attempts
    set window_started_at = now(), failed_attempts = 0
    where user_id = joining_user
    returning * into attempts;
  end if;

  if attempts.failed_attempts >= 5 then
    return null;
  end if;

  if code is null or code !~ '^[0-9]{6}$' then
    gid := null;
  else
    select id into gid
    from public.groups
    where join_code = trim(code)
      and archived = false;
  end if;

  if gid is null then
    update public.group_join_attempts
    set failed_attempts = failed_attempts + 1
    where user_id = joining_user;
    return null;
  end if;

  insert into public.group_members (group_id, user_id)
  values (gid, joining_user)
  on conflict (group_id, user_id) do nothing;

  update public.group_join_attempts
  set window_started_at = now(), failed_attempts = 0
  where user_id = joining_user;

  return gid;
end;
$$;

create or replace function public.create_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  creator uuid := auth.uid();
  created_group_id uuid;
begin
  if creator is null then
    raise exception 'Sign in before creating a group';
  end if;

  if group_name is null or length(trim(group_name)) = 0 or length(trim(group_name)) > 80 then
    raise exception 'Group name must be between 1 and 80 characters';
  end if;

  insert into public.groups (name, created_by)
  values (trim(group_name), creator)
  returning id into created_group_id;

  return created_group_id;
end;
$$;

create or replace function public.get_group_members(p_group_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  joined_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    member.user_id,
    coalesce(
      nullif(trim(account.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(account.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(account.email, '@', 1), ''),
      'Group member'
    ) as display_name,
    account.email,
    member.role,
    member.joined_at
  from public.group_members as member
  join auth.users as account on account.id = member.user_id
  where member.group_id = p_group_id
    and public.is_group_member(p_group_id)
  order by member.joined_at, member.user_id;
$$;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_owner(uuid) from public;
revoke all on function public.is_active_group_member(uuid) from public;
revoke all on function public.is_active_group_owner(uuid) from public;
revoke all on function public.join_group(text) from public;
revoke all on function public.create_group(text) from public;
revoke all on function public.get_group_members(uuid) from public;
revoke all on function public.generate_group_join_code() from public;
revoke all on function public.add_group_creator_as_member() from public;
revoke all on function public.set_group_updated_at() from public;
revoke all on function public.populate_expense_splits() from public;
revoke all on function public.rebuild_group_expense_splits(uuid) from public;
revoke all on function public.refresh_group_expense_splits_after_membership() from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.is_active_group_member(uuid) to authenticated;
grant execute on function public.is_active_group_owner(uuid) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.get_group_members(uuid) to authenticated;

drop policy if exists expense_splits_select on public.expense_splits;
create policy expense_splits_select on public.expense_splits
  for select to authenticated
  using (public.is_group_member(group_id));

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;

revoke all on public.groups, public.group_members from anon, authenticated;
grant select, update on public.groups to authenticated;
grant select, update, delete on public.group_members to authenticated;

drop policy if exists "see my groups" on public.groups;
drop policy if exists "create groups" on public.groups;
drop policy if exists "groups_select" on public.groups;
drop policy if exists "groups_insert" on public.groups;
drop policy if exists "groups_update" on public.groups;
drop policy if exists "groups_create" on public.groups;

create policy groups_select on public.groups
  for select to authenticated
  using (public.is_group_member(id));
create policy groups_update on public.groups
  for update to authenticated
  using (public.is_group_owner(id))
  with check (public.is_group_owner(id) and created_by = auth.uid());

drop policy if exists "see my memberships" on public.group_members;
drop policy if exists "join groups" on public.group_members;
drop policy if exists "group_members_select" on public.group_members;
drop policy if exists "group_members_update" on public.group_members;
drop policy if exists "group_members_delete" on public.group_members;

create policy group_members_select on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));
create policy group_members_update on public.group_members
  for update to authenticated
  using (public.is_active_group_owner(group_id))
  with check (public.is_active_group_owner(group_id));
create policy group_members_delete on public.group_members
  for delete to authenticated
  using (public.is_active_group_owner(group_id) and user_id <> auth.uid());

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

create policy expenses_select on public.expenses
  for select to authenticated
  using (
    auth.uid() = user_id
    or (group_id is not null and public.is_group_member(group_id))
  );
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      group_id is null
      or (
        public.is_active_group_member(group_id)
        and paid_by_user_id = auth.uid()
      )
    )
  );
create policy expenses_update on public.expenses
  for update to authenticated
  using (
    auth.uid() = user_id
    and (group_id is null or public.is_active_group_member(group_id))
  )
  with check (
    auth.uid() = user_id
    and (
      group_id is null
      or (
        public.is_active_group_member(group_id)
        and paid_by_user_id = auth.uid()
      )
    )
  );
create policy expenses_delete on public.expenses
  for delete to authenticated
  using (
    auth.uid() = user_id
    and (group_id is null or public.is_active_group_member(group_id))
  );
