create or replace function public.can_view_event_details(target_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event
      and public.is_trip_member(e.trip_id)
      and (
        e.type = 'master'
        or e.owner_id = auth.uid()
        or e.visibility = 'open'
        or exists (
          select 1 from public.event_participants ep
          where ep.event_id = e.id
            and ep.user_id = auth.uid()
            and ep.status in ('joined', 'invited')
        )
      )
  );
$$;

create or replace function public.can_view_event(target_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event
      and public.is_trip_member(e.trip_id)
      and (
        e.type = 'master'
        or e.owner_id = auth.uid()
        or e.visibility = 'open'
        or e.visibility = 'private'
        or exists (
          select 1 from public.event_participants ep
          where ep.event_id = e.id
            and ep.user_id = auth.uid()
            and ep.status in ('joined', 'invited')
        )
      )
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
    e.id, e.trip_id, e.owner_id, e.type,
    case when e.visibility = 'private' and e.owner_id <> auth.uid() then 'Busy' else e.title end,
    case when e.visibility = 'private' and e.owner_id <> auth.uid() then null else e.description end,
    case when e.visibility = 'private' and e.owner_id <> auth.uid() then null else e.location end,
    e.start_time, e.end_time, e.visibility, e.capacity, e.is_all_day,
    p.display_name,
    case when e.visibility = 'private' and e.owner_id <> auth.uid() then '[]'::jsonb
      else coalesce(jsonb_agg(jsonb_build_object('user_id', ep.user_id, 'status', ep.status)
        order by ep.user_id) filter (where ep.user_id is not null), '[]'::jsonb)
    end
  from public.events e
  join public.profiles p on p.id = e.owner_id
  left join public.event_participants ep on ep.event_id = e.id
  where e.trip_id = target_trip
    and public.is_trip_member(target_trip)
    and public.can_view_event(e.id)
  group by e.id, p.display_name;
$$;

drop policy if exists "owners update personal events and admins update master" on public.events;
create policy "owners update personal events and admins update master" on public.events for update using (
  (owner_id = auth.uid() and type = 'personal')
  or (type = 'master' and public.is_trip_admin(trip_id))
) with check (
  public.is_trip_member(trip_id)
  and (
    (owner_id = auth.uid() and type = 'personal')
    or (type = 'master' and owner_id = auth.uid() and visibility = 'open' and public.is_trip_admin(trip_id))
  )
);

drop policy if exists "members join eligible events" on public.event_participants;
create policy "members join eligible events" on public.event_participants for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.events e
    where e.id = event_id
      and e.type = 'personal'
      and e.visibility = 'open'
      and public.is_trip_member(e.trip_id)
  )
);

drop policy if exists "owners invite trip members" on public.event_participants;
create policy "owners invite trip members" on public.event_participants for insert with check (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and e.owner_id = auth.uid()
      and e.type = 'personal'
      and e.visibility = 'invite'
      and public.is_trip_member(e.trip_id)
  )
  and exists (
    select 1 from public.trip_members tm
    join public.events e on e.trip_id = tm.trip_id
    where e.id = event_id and tm.user_id = event_participants.user_id
  )
);
