-- All members of a trip may read complete event details.  Participation
-- policies below continue to control who may join or accept an invitation.
create or replace function public.can_view_event(target_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event
      and public.is_trip_member(e.trip_id)
  );
$$;

create or replace function public.can_view_event_details(target_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event
      and public.is_trip_member(e.trip_id)
  );
$$;

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
  join public.profiles p on p.id = e.owner_id
  left join public.event_participants ep on ep.event_id = e.id
  where e.trip_id = target_trip
    and public.is_trip_member(target_trip)
  group by e.id, p.display_name;
$$;

drop policy if exists "members view allowed event details" on public.events;
create policy "trip members view events"
on public.events
for select
using (public.is_trip_member(trip_id));

drop policy if exists "members view participants for visible events" on public.event_participants;
create policy "trip members view event participants"
on public.event_participants
for select
using (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and public.is_trip_member(e.trip_id)
  )
);

drop policy if exists "members join eligible events" on public.event_participants;
create policy "members join eligible events"
on public.event_participants
for insert
with check (
  user_id = auth.uid()
  and status = 'joined'
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.type = 'personal'
      and public.is_trip_member(e.trip_id)
      and (
        e.visibility = 'open'
        or (
          e.visibility = 'invite'
          and exists (
            select 1
            from public.event_participants invitation
            where invitation.event_id = e.id
              and invitation.user_id = auth.uid()
              and invitation.status = 'invited'
          )
        )
      )
  )
);

drop policy if exists "invited members accept invitations" on public.event_participants;
create policy "invited members accept invitations"
on public.event_participants
for update
using (
  user_id = auth.uid()
  and status = 'invited'
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.type = 'personal'
      and e.visibility = 'invite'
      and public.is_trip_member(e.trip_id)
  )
)
with check (user_id = auth.uid() and status = 'joined');

grant execute on function public.can_view_event(uuid) to authenticated;
grant execute on function public.can_view_event_details(uuid) to authenticated;
grant execute on function public.get_trip_events(uuid) to authenticated;
