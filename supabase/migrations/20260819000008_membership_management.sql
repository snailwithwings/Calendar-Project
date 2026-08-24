-- Secure membership self-service and admin promotion.
-- These operations run with the function owner's privileges so they can
-- perform the required cleanup without widening table RLS policies.

create or replace function public.leave_trip(target_trip uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role public.trip_role;
  admin_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize membership changes for this trip so two admins cannot both
  -- leave after observing the same admin count.
  perform pg_advisory_xact_lock(hashtextextended(target_trip::text, 0));

  select role
    into caller_role
  from public.trip_members
  where trip_id = target_trip
    and user_id = auth.uid();

  if caller_role is null then
    raise exception 'You are not a member of this trip';
  end if;

  if caller_role = 'admin'::public.trip_role then
    select count(*)
      into admin_count
    from public.trip_members
    where trip_id = target_trip
      and role = 'admin'::public.trip_role;

    if admin_count <= 1 then
      raise exception 'The sole trip admin cannot leave. Promote another member first';
    end if;
  end if;

  -- Remove the caller's participation everywhere in this trip before the
  -- membership row is removed. Owned personal events are removed separately.
  delete from public.event_participants ep
  using public.events e
  where ep.event_id = e.id
    and e.trip_id = target_trip
    and ep.user_id = auth.uid();

  delete from public.events
  where trip_id = target_trip
    and type = 'personal'::public.event_type
    and owner_id = auth.uid();

  delete from public.trip_members
  where trip_id = target_trip
    and user_id = auth.uid();

  if not found then
    raise exception 'You are no longer a member of this trip';
  end if;
end;
$$;

create or replace function public.promote_trip_admin(target_trip uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.trip_members
    where trip_id = target_trip
      and user_id = auth.uid()
      and role = 'admin'::public.trip_role
  ) then
    raise exception 'Only trip admins can promote members';
  end if;

  if not exists (
    select 1
    from public.trip_members
    where trip_id = target_trip
      and user_id = target_user
  ) then
    raise exception 'The selected user is not a member of this trip';
  end if;

  update public.trip_members
  set role = 'admin'::public.trip_role
  where trip_id = target_trip
    and user_id = target_user;
end;
$$;

revoke all on function public.leave_trip(uuid) from public;
revoke all on function public.promote_trip_admin(uuid, uuid) from public;
grant execute on function public.leave_trip(uuid) to authenticated;
grant execute on function public.promote_trip_admin(uuid, uuid) to authenticated;
