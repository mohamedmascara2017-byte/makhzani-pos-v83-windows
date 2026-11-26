-- Makhzani POS V8.6 safety patch
-- Apply once in Supabase SQL Editor. This does not modify existing store data.
-- Snapshot writes are restricted to active owners and malformed/empty payloads are rejected.

create or replace function public.makhzani_save_snapshot(
  p_store_id uuid,
  p_payload jsonb,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  if not private.is_makhzani_owner(p_store_id) then
    raise exception 'Only an active store owner can replace the cloud snapshot'
      using errcode = '42501';
  end if;

  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or p_payload ->> 'format' <> 'makhzani-pos-backup-v1'
     or jsonb_typeof(p_payload -> 'products') <> 'array'
     or jsonb_typeof(p_payload -> 'employees') <> 'array'
     or jsonb_typeof(p_payload -> 'sales') <> 'array'
     or jsonb_typeof(p_payload -> 'purchases') <> 'array'
     or jsonb_typeof(p_payload -> 'returns') <> 'array'
     or jsonb_typeof(p_payload -> 'counts') <> 'array'
     or jsonb_typeof(p_payload -> 'audit') <> 'array'
     or jsonb_typeof(p_payload -> 'expenses') <> 'array' then
    raise exception 'Invalid or incomplete Makhzani backup payload'
      using errcode = '22023';
  end if;

  update public.makhzani_store_snapshots
    set payload = p_payload,
        revision = revision + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where store_id = p_store_id
      and revision = p_expected_revision
    returning revision into v_revision;

  if v_revision is null then
    raise exception 'SYNC_CONFLICT: snapshot revision changed; pull latest data before retrying'
      using errcode = '40001';
  end if;

  return v_revision;
end;
$$;

revoke all on function public.makhzani_save_snapshot(uuid, jsonb, bigint) from public, anon;
grant execute on function public.makhzani_save_snapshot(uuid, jsonb, bigint) to authenticated;
