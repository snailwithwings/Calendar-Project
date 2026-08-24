-- Personal events are removed with their owner. Master events belong to the
-- trip, so their creator may be deleted without removing the itinerary.
alter table public.events
  alter column owner_id drop not null;

alter table public.events
  drop constraint if exists events_owner_id_fkey;

alter table public.events
  add constraint events_owner_id_fkey
  foreign key (owner_id) references public.profiles(id) on delete set null;

create or replace function public.get_trip_events(target_trip uuid)
returns table (
  id uuid, trip_id uuid, owner_id uuid, type public.event_type, title text,
  description text, location text, start_time timestamptz, end_time timestamptz,
  visibility public.event_visibility, capacity integer, is_all_day boolean,
  owner_name text, participants jsonb
)
language sql stable security definer set search_path = public as $$
  select
    e.id, e.trip_id, e.owner_id, e.type, e.title, e.description, e.location,
    e.start_time, e.end_time, e.visibility, e.capacity, e.is_all_day,
    p.display_name,
    coalesce(
      jsonb_agg(jsonb_build_object('user_id', ep.user_id, 'status', ep.status)
        order by ep.user_id) filter (where ep.user_id is not null),
      '[]'::jsonb
    )
  from public.events e
  left join public.profiles p on p.id = e.owner_id
  left join public.event_participants ep on ep.event_id = e.id
  where e.trip_id = target_trip
    and public.is_trip_member(target_trip)
  group by e.id, p.display_name;
$$;

drop policy if exists "owners update personal events and admins update master" on public.events;
create policy "owners update personal events and admins update master"
on public.events for update
using (
  (type = 'personal' and owner_id = auth.uid())
  or (type = 'master' and public.is_trip_admin(trip_id))
)
with check (
  public.is_trip_member(trip_id)
  and (
    (type = 'personal' and owner_id = auth.uid())
    or (type = 'master' and visibility = 'open' and public.is_trip_admin(trip_id))
  )
);
