-- Account deletion may leave a trip in place when another admin can take over.
-- SET NULL keeps the audit field valid after the creator deletes their account.
alter table public.trips
  alter column created_by drop not null;

alter table public.trips
  drop constraint if exists trips_created_by_fkey;

alter table public.trips
  add constraint trips_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

create or replace function public.delete_trip(target_trip uuid)
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
      and role = 'admin'
  ) then
    raise exception 'Only trip admins can permanently delete this trip';
  end if;

  delete from public.trips where id = target_trip;
  if not found then
    raise exception 'Trip not found';
  end if;
end;
$$;

revoke all on function public.delete_trip(uuid) from public;
grant execute on function public.delete_trip(uuid) to authenticated;
