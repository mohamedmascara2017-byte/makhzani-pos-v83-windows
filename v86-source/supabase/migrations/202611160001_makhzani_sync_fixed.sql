-- Makhzani POS V8.6 - secure multi-device sync foundation for Supabase
-- Run once in Supabase SQL Editor after enabling Email auth.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.makhzani_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.makhzani_store_members (
  store_id uuid not null references public.makhzani_stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'employee' check (role in ('owner','employee')),
  active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index if not exists makhzani_store_members_user_idx on public.makhzani_store_members(user_id);

create table if not exists public.makhzani_devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.makhzani_stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null default 'Makhzani device',
  platform text not null default 'other' check (platform in ('windows','android','web','other')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (store_id, id)
);
create index if not exists makhzani_devices_store_idx on public.makhzani_devices(store_id);

create table if not exists public.makhzani_store_snapshots (
  store_id uuid primary key references public.makhzani_stores(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.makhzani_sync_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.makhzani_stores(id) on delete cascade,
  device_id uuid,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('insert','update','delete')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (store_id, id)
);
create index if not exists makhzani_sync_events_store_created_idx on public.makhzani_sync_events(store_id, created_at);

create or replace function private.is_makhzani_member(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.makhzani_store_members m
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.active = true
  );
$$;

create or replace function private.is_makhzani_owner(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.makhzani_store_members m
    where m.store_id = p_store_id
      and m.user_id = (select auth.uid())
      and m.active = true
      and m.role = 'owner'
  );
$$;

revoke all on function private.is_makhzani_member(uuid) from public;
revoke all on function private.is_makhzani_owner(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_makhzani_member(uuid) to authenticated;
grant execute on function private.is_makhzani_owner(uuid) to authenticated;

-- First signed-in user creates the store and becomes its owner.
create or replace function public.makhzani_create_store(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_store_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.makhzani_store_members where user_id = v_user and active) then
    raise exception 'This account is already linked to a Makhzani store';
  end if;
  insert into public.makhzani_stores(name, owner_id)
  values (trim(p_name), v_user) returning id into v_store_id;
  insert into public.makhzani_store_members(store_id, user_id, role, active)
  values (v_store_id, v_user, 'owner', true);
  insert into public.makhzani_store_snapshots(store_id, payload, revision, updated_by)
  values (v_store_id, '{}'::jsonb, 0, v_user);
  return v_store_id;
end;
$$;
revoke all on function public.makhzani_create_store(text) from public, anon;
grant execute on function public.makhzani_create_store(text) to authenticated;

create or replace function public.makhzani_get_snapshot(p_store_id uuid)
returns table(payload jsonb, revision bigint, updated_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_makhzani_member(p_store_id) then raise exception 'Not a store member'; end if;
  return query
    select s.payload, s.revision, s.updated_at
    from public.makhzani_store_snapshots s where s.store_id = p_store_id;
end;
$$;
revoke all on function public.makhzani_get_snapshot(uuid) from public, anon;
grant execute on function public.makhzani_get_snapshot(uuid) to authenticated;

-- Optimistic concurrency prevents one device silently overwriting a newer snapshot.
create or replace function public.makhzani_save_snapshot(p_store_id uuid, p_payload jsonb, p_expected_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if not private.is_makhzani_member(p_store_id) then raise exception 'Not a store member'; end if;
  update public.makhzani_store_snapshots
    set payload = p_payload,
        revision = revision + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where store_id = p_store_id and revision = p_expected_revision
    returning revision into v_revision;
  if v_revision is null then
    raise exception 'SYNC_CONFLICT: snapshot revision changed; pull latest data before retrying' using errcode = '40001';
  end if;
  return v_revision;
end;
$$;
revoke all on function public.makhzani_save_snapshot(uuid, jsonb, bigint) from public, anon;
grant execute on function public.makhzani_save_snapshot(uuid, jsonb, bigint) to authenticated;

alter table public.makhzani_stores enable row level security;
alter table public.makhzani_store_members enable row level security;
alter table public.makhzani_devices enable row level security;
alter table public.makhzani_store_snapshots enable row level security;
alter table public.makhzani_sync_events enable row level security;

revoke all on public.makhzani_stores from anon, authenticated;
revoke all on public.makhzani_store_members from anon, authenticated;
revoke all on public.makhzani_devices from anon, authenticated;
revoke all on public.makhzani_store_snapshots from anon, authenticated;
revoke all on public.makhzani_sync_events from anon, authenticated;

grant select on public.makhzani_stores to authenticated;
grant select on public.makhzani_store_members to authenticated;
grant select, insert, update on public.makhzani_devices to authenticated;
grant select on public.makhzani_store_snapshots to authenticated;
grant select, insert on public.makhzani_sync_events to authenticated;

-- Make policy creation repeatable: remove only these named policies, then recreate them below.
drop policy if exists "Makhzani members read their stores" on public.makhzani_stores;
drop policy if exists "Makhzani members read store membership" on public.makhzani_store_members;
drop policy if exists "Makhzani members read devices" on public.makhzani_devices;
drop policy if exists "Makhzani users register own devices" on public.makhzani_devices;
drop policy if exists "Makhzani users update own devices" on public.makhzani_devices;
drop policy if exists "Makhzani members read snapshots" on public.makhzani_store_snapshots;
drop policy if exists "Makhzani members read sync events" on public.makhzani_sync_events;
drop policy if exists "Makhzani members append sync events" on public.makhzani_sync_events;

create policy "Makhzani members read their stores" on public.makhzani_stores
for select to authenticated using (private.is_makhzani_member(id));

create policy "Makhzani members read store membership" on public.makhzani_store_members
for select to authenticated using (private.is_makhzani_member(store_id));

create policy "Makhzani members read devices" on public.makhzani_devices
for select to authenticated using (private.is_makhzani_member(store_id));
create policy "Makhzani users register own devices" on public.makhzani_devices
for insert to authenticated with check (
  user_id = (select auth.uid()) and private.is_makhzani_member(store_id)
);
create policy "Makhzani users update own devices" on public.makhzani_devices
for update to authenticated using (
  user_id = (select auth.uid()) and private.is_makhzani_member(store_id)
) with check (
  user_id = (select auth.uid()) and private.is_makhzani_member(store_id)
);

create policy "Makhzani members read snapshots" on public.makhzani_store_snapshots
for select to authenticated using (private.is_makhzani_member(store_id));

create policy "Makhzani members read sync events" on public.makhzani_sync_events
for select to authenticated using (private.is_makhzani_member(store_id));
create policy "Makhzani members append sync events" on public.makhzani_sync_events
for insert to authenticated with check (private.is_makhzani_member(store_id));
