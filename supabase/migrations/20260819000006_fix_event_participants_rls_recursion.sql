-- Prevent event_participants RLS from querying itself while authorizing writes.
-- The security-definer helpers read the required rows with the function owner's
-- privileges, while still enforcing the authenticated user's trip membership.

create or replace function public.can_join_event(target_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.events e
      where e.id = target_event
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
        and not exists (
          select 1
          from public.event_participants existing
          where existing.event_id = e.id
            and existing.user_id = auth.uid()
            and existing.status = 'joined'
        )
    );
$$;

create or replace function public.can_view_event_participants(target_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event
      and public.is_trip_member(e.trip_id)
  );
$$;

create or replace function public.can_accept_event_invitation(target_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.event_participants invitation
      join public.events e on e.id = invitation.event_id
      where invitation.event_id = target_event
        and invitation.user_id = auth.uid()
        and invitation.status = 'invited'
        and e.type = 'personal'
        and e.visibility = 'invite'
        and public.is_trip_member(e.trip_id)
    );
$$;

drop policy if exists "members view participants for visible events" on public.event_participants;
drop policy if exists "trip members view event participants" on public.event_participants;
create policy "trip members view event participants"
on public.event_participants
for select
using (public.can_view_event_participants(event_id));

drop policy if exists "members join eligible events" on public.event_participants;
create policy "members join eligible events"
on public.event_participants
for insert
with check (
  user_id = auth.uid()
  and status = 'joined'
  and public.can_join_event(event_id)
);

drop policy if exists "invited members accept invitations" on public.event_participants;
create policy "invited members accept invitations"
on public.event_participants
for update
using (public.can_accept_event_invitation(event_id))
with check (user_id = auth.uid() and status = 'joined');

drop policy if exists "users leave or owners manage participants" on public.event_participants;
create policy "users leave or owners manage participants"
on public.event_participants
for delete
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.owner_id = auth.uid()
  )
);

revoke all on function public.can_join_event(uuid) from public;
revoke all on function public.can_view_event_participants(uuid) from public;
revoke all on function public.can_accept_event_invitation(uuid) from public;
grant execute on function public.can_join_event(uuid) to authenticated;
grant execute on function public.can_view_event_participants(uuid) to authenticated;
grant execute on function public.can_accept_event_invitation(uuid) to authenticated;
