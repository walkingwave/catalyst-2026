-- Saved drop templates per artist (custom "quick picks" in the artist console).
create table public.drop_templates (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  title text not null,
  message text not null default '',
  code_prefix text,
  created_at timestamptz not null default now()
);
create index drop_templates_artist_id_idx on public.drop_templates (artist_id);
alter table public.drop_templates enable row level security;
-- artist console uses the service role; no client policies needed.
