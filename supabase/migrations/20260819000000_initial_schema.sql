create extension if not exists pgcrypto;

create type public.trip_role as enum ('admin', 'member');
create type public.event_type as enum ('master', 'personal');
create type public.event_visibility as enum ('open', 'invite', 'private');
create type public.participant_status as enum ('joined', 'invited');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Traveler',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  destination text not null check (char_length(destination) between 1 and 160),
  start_date date not null,
  end_date date not null,
  timezone text not null default 'UTC',
  description text,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.trip_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  type public.event_type not null,
  title text not null check (char_length(title) between 1 and 160),
  description text,
  location text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  visibility public.event_visibility not null default 'open',
  capacity integer check (capacity is null or capacity > 0),
  is_all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check ((type = 'master' and visibility = 'open') or type = 'personal')
);

create table public.event_participants (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.participant_status not null default 'joined',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index trip_members_user_idx on public.trip_members(user_id);
create index events_trip_time_idx on public.events(trip_id, start_time);

create or replace function public.is_trip_member(target_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.trip_members where trip_id = target_trip and user_id = auth.uid());
$$;

create or replace function public.is_trip_admin(target_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.trip_members where trip_id = target_trip and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.can_view_event(target_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event and public.is_trip_member(e.trip_id)
      and (
        e.type = 'master'
        or e.owner_id = auth.uid()
        or e.visibility = 'open'
        or e.visibility = 'private'
        or exists (
          select 1 from public.event_participants ep
          where ep.event_id = e.id and ep.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_view_event_details(target_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event and public.is_trip_member(e.trip_id)
      and (
        e.type = 'master'
        or e.owner_id = auth.uid()
        or e.visibility = 'open'
        or exists (
          select 1 from public.event_participants ep
          where ep.event_id = e.id and ep.user_id = auth.uid()
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
      else coalesce(jsonb_agg(jsonb_build_object('user_id', ep.user_id, 'status', ep.status))
        filter (where ep.user_id is not null), '[]'::jsonb)
    end
  from public.events e
  join public.profiles p on p.id = e.owner_id
  left join public.event_participants ep on ep.event_id = e.id
  where e.trip_id = target_trip and public.is_trip_member(target_trip)
    and (
      e.type = 'master'
      or e.owner_id = auth.uid()
      or e.visibility = 'open'
      or e.visibility = 'private'
      or exists (
        select 1 from public.event_participants ep2
        where ep2.event_id = e.id and ep2.user_id = auth.uid()
      )
    )
  group by e.id, p.display_name;
$$;

create or replace function public.create_trip(trip_name text, trip_destination text, trip_start_date date, trip_end_date date, trip_timezone text, trip_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_trip uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.trips(name,destination,start_date,end_date,timezone,description,created_by)
  values (trip_name,trip_destination,trip_start_date,trip_end_date,trip_timezone,trip_description,auth.uid()) returning id into new_trip;
  insert into public.trip_members(trip_id,user_id,role) values (new_trip,auth.uid(),'admin');
  return new_trip;
end; $$;

create or replace function public.join_trip(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_trip uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id into target_trip from public.trips where invite_code = upper(trim(code));
  if target_trip is null then raise exception 'Invite code not found'; end if;
  insert into public.trip_members(trip_id,user_id) values (target_trip,auth.uid()) on conflict do nothing;
  return target_trip;
end; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.add_event_owner_participant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'personal' then
    insert into public.event_participants(event_id, user_id, status)
    values (new.id, new.owner_id, 'joined')
    on conflict (event_id, user_id) do nothing;
  end if;
  return new;
end; $$;

create trigger on_personal_event_created after insert on public.events
for each row execute procedure public.add_event_owner_participant();

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;

create policy "members can view profiles in their trips" on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.trip_members mine
    join public.trip_members theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
create policy "users update own profile" on public.profiles for update using (id = auth.uid());
create policy "members view trips" on public.trips for select using (public.is_trip_member(id));
create policy "admins update trips" on public.trips for update using (public.is_trip_admin(id));
create policy "members view membership" on public.trip_members for select using (public.is_trip_member(trip_id));
create policy "admins manage membership" on public.trip_members for all using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
create policy "members view allowed event details" on public.events for select using (public.can_view_event_details(id));
create policy "members create personal events" on public.events for insert with check (
  owner_id = auth.uid() and type = 'personal' and public.is_trip_member(trip_id)
);
create policy "admins create master events" on public.events for insert with check (
  owner_id = auth.uid() and type = 'master' and public.is_trip_admin(trip_id)
);
create policy "owners update personal events and admins update master" on public.events for update using (
  (owner_id = auth.uid() and type = 'personal') or (type = 'master' and public.is_trip_admin(trip_id))
) with check (
  (owner_id = auth.uid() and type = 'personal') or (type = 'master' and public.is_trip_admin(trip_id))
);
create policy "owners delete personal events and admins delete master" on public.events for delete using (
  (owner_id = auth.uid() and type = 'personal') or (type = 'master' and public.is_trip_admin(trip_id))
);
create policy "members view participants for visible events" on public.event_participants for select using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (e.owner_id = auth.uid() or (e.visibility <> 'private' and public.can_view_event(event_id)))
  )
);
create policy "members join eligible events" on public.event_participants for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.events e where e.id = event_id and e.type = 'personal' and e.visibility = 'open' and public.is_trip_member(e.trip_id)
  )
);
create policy "users leave or owners manage participants" on public.event_participants for delete using (
  user_id = auth.uid() or exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid())
);
create policy "owners invite trip members" on public.event_participants for insert with check (
  exists (
    select 1 from public.events e
    where e.id = event_id and e.owner_id = auth.uid() and public.is_trip_member(e.trip_id)
  )
  and exists (
    select 1 from public.trip_members tm
    join public.events e on e.trip_id = tm.trip_id
    where e.id = event_id and tm.user_id = event_participants.user_id
  )
);

grant execute on function public.create_trip(text,text,date,date,text,text) to authenticated;
grant execute on function public.join_trip(text) to authenticated;
grant execute on function public.get_trip_events(uuid) to authenticated;
