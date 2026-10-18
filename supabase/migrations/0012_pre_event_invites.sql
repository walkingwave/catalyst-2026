-- Pre-event activities, song requests, and single-use invite links per ticket buyer.

-- ---------- activities ----------
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in ('scan', 'social', 'song_request'));
-- Pre-event activities are doable before the show and lock when doors open.
alter table public.activities add column pre_event boolean not null default false;

-- ---------- song requests (and any other text answer) ----------
-- One answer per fan per activity; points land on submit. Inserted by the server after it checks enrollment and the window.
create table public.activity_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  response text not null check (char_length(response) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (user_id, activity_id)
);
create index activity_completions_activity_idx on public.activity_completions (activity_id);
alter table public.activity_completions enable row level security;
create policy "activity_completions: read own" on public.activity_completions
  for select using (auth.uid() = user_id);

-- ---------- invites ----------
-- One code per ticket buyer. Redeeming enrolls the fan in the event before they have a wristband;
-- claiming a band later with the same phone account keeps everything together.
create table public.event_invites (
  code text primary key,
  concert_id uuid not null references public.concerts (id) on delete cascade,
  label text,
  redeemed_by uuid references public.users (id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index event_invites_concert_idx on public.event_invites (concert_id);
create index event_invites_user_idx on public.event_invites (redeemed_by);
alter table public.event_invites enable row level security;
create policy "event_invites: read own" on public.event_invites
  for select using (auth.uid() = redeemed_by);

-- ---------- points include song requests ----------
create or replace view public.user_artist_points
with (security_invoker = true) as
with earned as (
  select b.user_id, c.artist_id, sum(a.points)::integer as pts
  from public.bands b
  join public.scans s on s.band_uid = b.uid
  join public.activities a on a.id = s.activity_id
  join public.concerts c on c.id = a.concert_id
  where b.user_id is not null and c.artist_id is not null
  group by b.user_id, c.artist_id
  union all
  select sp.user_id, c.artist_id, sum(a.points)::integer
  from public.social_posts sp
  join public.activities a on a.id = sp.activity_id
  join public.concerts c on c.id = a.concert_id
  where sp.status = 'approved' and c.artist_id is not null
  group by sp.user_id, c.artist_id
  union all
  select ac.user_id, c.artist_id, sum(a.points)::integer
  from public.activity_completions ac
  join public.activities a on a.id = ac.activity_id
  join public.concerts c on c.id = a.concert_id
  where c.artist_id is not null
  group by ac.user_id, c.artist_id
),
earned_sum as (
  select user_id, artist_id, sum(pts)::integer as earned from earned group by user_id, artist_id
),
spent as (
  select r.user_id, rw.artist_id, sum(rw.cost)::integer as spent
  from public.redemptions r
  join public.rewards rw on rw.id = r.reward_id
  where rw.artist_id is not null
  group by r.user_id, rw.artist_id
)
select
  coalesce(e.user_id, s.user_id) as user_id,
  coalesce(e.artist_id, s.artist_id) as artist_id,
  coalesce(e.earned, 0) as earned,
  coalesce(s.spent, 0) as spent,
  coalesce(e.earned, 0) - coalesce(s.spent, 0) as balance
from earned_sum e
full outer join spent s on s.user_id = e.user_id and s.artist_id = e.artist_id;

create or replace view public.leaderboard_concert as
with pts as (
  select c.id as concert_id, b.user_id, a.points, s.scanned_at as at
  from public.concerts c
  join public.bands b on b.concert_id = c.id and b.user_id is not null
  join public.scans s on s.band_uid = b.uid
  join public.activities a on a.id = s.activity_id
  union all
  select a.concert_id, sp.user_id, a.points, sp.reviewed_at
  from public.social_posts sp
  join public.activities a on a.id = sp.activity_id
  where sp.status = 'approved'
  union all
  select a.concert_id, ac.user_id, a.points, ac.created_at
  from public.activity_completions ac
  join public.activities a on a.id = ac.activity_id
)
select
  p.concert_id,
  u.id as user_id,
  u.name,
  sum(p.points)::integer as points,
  rank() over (partition by p.concert_id order by sum(p.points) desc, min(p.at) asc)::integer as rank
from pts p
join public.users u on u.id = p.user_id
group by p.concert_id, u.id, u.name;
