-- Artist/venue imagery and venue-map pins for activities.
alter table public.concerts
  add column if not exists image_url text,
  add column if not exists venue_image_url text,
  add column if not exists description text not null default '',
  add column if not exists doors_at text,
  add column if not exists address text;

alter table public.activities
  add column if not exists map_x real,   -- 0..100, percent of venue map width
  add column if not exists map_y real,   -- 0..100, percent of venue map height
  add column if not exists location text,
  add column if not exists icon text;    -- entry | merch | photo | trivia | meet
