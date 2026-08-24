alter table public.trips
  add column if not exists banner_image_path text;

insert into storage.buckets (id, name, public)
values ('trip-images', 'trip-images', false)
on conflict (id) do nothing;

create policy "trip members can read trip banners"
on storage.objects for select
using (
  bucket_id = 'trip-images'
  and public.is_trip_member((storage.foldername(name))[1]::uuid)
);

create policy "trip admins can upload trip banners"
on storage.objects for insert
with check (
  bucket_id = 'trip-images'
  and public.is_trip_admin((storage.foldername(name))[1]::uuid)
);

create policy "trip admins can replace trip banners"
on storage.objects for update
using (
  bucket_id = 'trip-images'
  and public.is_trip_admin((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'trip-images'
  and public.is_trip_admin((storage.foldername(name))[1]::uuid)
);

create policy "trip admins can remove trip banners"
on storage.objects for delete
using (
  bucket_id = 'trip-images'
  and public.is_trip_admin((storage.foldername(name))[1]::uuid)
);
