-- Images on drops, drop templates and inbox messages.
alter table public.drops add column if not exists image_url text;
alter table public.drop_templates add column if not exists image_url text;
alter table public.messages add column if not exists image_url text;
