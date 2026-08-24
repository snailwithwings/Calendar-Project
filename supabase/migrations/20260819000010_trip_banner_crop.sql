alter table public.trips
  add column if not exists banner_position_x integer not null default 50,
  add column if not exists banner_position_y integer not null default 50;

update public.trips
set banner_position_x = 50,
    banner_position_y = 50
where banner_position_x is null
   or banner_position_y is null;
