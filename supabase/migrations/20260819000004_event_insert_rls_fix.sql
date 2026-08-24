create or replace function public.can_insert_event(
  target_trip uuid,
  target_owner uuid,
  target_type public.event_type
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and target_owner = auth.uid()
    and (
      (target_type = 'personal' and exists (
        select 1
        from public.trip_members tm
        where tm.trip_id = target_trip
          and tm.user_id = auth.uid()
      ))
      or
      (target_type = 'master' and exists (
        select 1
        from public.trip_members tm
        where tm.trip_id = target_trip
          and tm.user_id = auth.uid()
          and tm.role = 'admin'
      ))
    );
$$;

drop policy if exists "members create personal events" on public.events;
drop policy if exists "admins create master events" on public.events;

create policy "members create personal events"
on public.events
for insert
to authenticated
with check (
  public.can_insert_event(trip_id, owner_id, type)
  and type = 'personal'
);

create policy "admins create master events"
on public.events
for insert
to authenticated
with check (
  public.can_insert_event(trip_id, owner_id, type)
  and type = 'master'
  and visibility = 'open'
);

revoke all on function public.can_insert_event(uuid, uuid, public.event_type) from public;
grant execute on function public.can_insert_event(uuid, uuid, public.event_type) to authenticated;
