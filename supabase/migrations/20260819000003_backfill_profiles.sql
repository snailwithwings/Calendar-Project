insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(coalesce(u.email, 'traveler'), '@', 1))
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(coalesce(new.email, 'traveler'), '@', 1))
  )
  on conflict (id) do update set display_name = excluded.display_name;
  return new;
end; $$;
