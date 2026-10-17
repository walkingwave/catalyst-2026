-- Public media bucket for artist/venue/map images uploaded from the admin console (service role writes).
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
create policy "media: public read" on storage.objects for select to anon, authenticated using (bucket_id = 'media');

-- Optional custom venue map (photo/plan) rendered under the activity pins instead of the stylized floor plan.
alter table public.concerts add column if not exists map_image_url text;
