-- Artists / teams, per-artist point pools, fan socials + social posts, artist messaging + drops.

-- ---------- artists ----------
create table public.artists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  kind text not null default 'artist' check (kind in ('artist', 'team')),
  image_url text,
  bio text not null default '',
  access_code text unique,          -- artist console login
  created_at timestamptz not null default now()
);

alter table public.concerts add column artist_id uuid references public.artists (id) on delete set null;
create index concerts_artist_id_idx on public.concerts (artist_id);

alter table public.rewards add column artist_id uuid references public.artists (id) on delete cascade;
create index rewards_artist_id_idx on public.rewards (artist_id);

-- ---------- fan socials ----------
alter table public.users
  add column instagram text,
  add column tiktok text,
  add column x_handle text;

-- Activities can be tap-scans (default) or social tasks the fan submits proof for.
alter table public.activities add column kind text not null default 'scan' check (kind in ('scan', 'social'));
alter table public.activities add column social_network text; -- instagram | tiktok | x

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id, activity_id)
);
create index social_posts_status_idx on public.social_posts (status);

-- ---------- artist -> fan messaging ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  channel text not null default 'inbox' check (channel in ('inbox', 'sms')),
  body text not null,
  sms_status text,                   -- sent | simulated | failed
  created_at timestamptz not null default now()
);
create index messages_user_id_idx on public.messages (user_id, created_at desc);
create index messages_artist_id_idx on public.messages (artist_id, created_at desc);

-- Drops: a gift from the artist to a fan (merch, code, early access).
create table public.drops (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  message text not null default '',
  code text,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index drops_user_id_idx on public.drops (user_id, created_at desc);

-- ---------- views (replace) ----------

-- Earned points per user per artist: tap scans via owned bands + approved social posts.
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

-- Total across artists (kept for the headline number).
drop view if exists public.user_points;
create view public.user_points
with (security_invoker = true) as
select
  u.id as user_id,
  coalesce(sum(p.earned), 0)::integer as earned,
  coalesce(sum(p.spent), 0)::integer as spent,
  coalesce(sum(p.balance), 0)::integer as balance
from public.users u
left join public.user_artist_points p on p.user_id = u.id
group by u.id;

-- Per-concert leaderboard now includes approved social posts.
drop view if exists public.leaderboard_concert;
create view public.leaderboard_concert as
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

-- Per-artist and all-time leaderboards are definer views (public names + points only).
-- user_artist_points is an invoker view, so wrap it in a definer function the views can read.
create or replace function public.artist_points_all()
returns table (user_id uuid, artist_id uuid, earned integer, spent integer, balance integer)
language sql security definer set search_path = public as $$
  select user_id, artist_id, earned, spent, balance from public.user_artist_points;
$$;
-- (execute granted below; views run it as the caller)

create or replace view public.leaderboard_artist as
select
  p.artist_id, u.id as user_id, u.name, p.earned as points,
  rank() over (partition by p.artist_id order by p.earned desc, u.created_at asc)::integer as rank
from public.artist_points_all() p
join public.users u on u.id = p.user_id;

create or replace view public.leaderboard_alltime as
select
  u.id as user_id, u.name,
  coalesce(sum(p.earned), 0)::integer as points,
  rank() over (order by coalesce(sum(p.earned), 0) desc, u.created_at asc)::integer as rank
from public.users u
join public.artist_points_all() p on p.user_id = u.id
group by u.id, u.name, u.created_at;

grant select on public.user_artist_points, public.user_points, public.leaderboard_concert,
  public.leaderboard_artist, public.leaderboard_alltime to anon, authenticated;
-- artists: everything except the console access code is public (default privileges grant the whole table, so revoke first).
revoke select on public.artists from anon, authenticated;
grant select (id, slug, name, kind, image_url, bio, created_at) on public.artists to anon, authenticated;

-- ---------- redeem: spend from the reward's artist pool ----------
create or replace function public.redeem_reward(p_reward_id uuid)
returns table (redemption_id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reward public.rewards%rowtype;
  v_balance integer;
  v_code public.reward_codes%rowtype;
  v_redemption_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select * into v_reward from public.rewards where id = p_reward_id for update;
  if not found then raise exception 'reward not found'; end if;
  if v_reward.stock <= 0 then raise exception 'sold out'; end if;

  select balance into v_balance
  from public.user_artist_points
  where user_id = v_user and artist_id = v_reward.artist_id;
  if coalesce(v_balance, 0) < v_reward.cost then
    raise exception 'not enough points with this artist';
  end if;

  if v_reward.type = 'discount_code' then
    select * into v_code from public.reward_codes
    where reward_id = p_reward_id and redeemed_by is null
    order by id limit 1 for update skip locked;
    if not found then raise exception 'sold out'; end if;
    update public.reward_codes set redeemed_by = v_user where id = v_code.id;
  end if;

  update public.rewards set stock = stock - 1 where id = p_reward_id;
  insert into public.redemptions (user_id, reward_id, code_id)
  values (v_user, p_reward_id, v_code.id)
  returning id into v_redemption_id;

  return query select v_redemption_id, v_code.code;
end;
$$;

-- ---------- RLS ----------
alter table public.artists enable row level security;
alter table public.social_posts enable row level security;
alter table public.messages enable row level security;
alter table public.drops enable row level security;

create policy "artists: public read" on public.artists
  for select to anon, authenticated using (true);

create policy "social_posts: read own" on public.social_posts
  for select to authenticated using (user_id = auth.uid());
create policy "social_posts: insert own" on public.social_posts
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

create policy "messages: read own" on public.messages
  for select to authenticated using (user_id = auth.uid());

create policy "drops: read own" on public.drops
  for select to authenticated using (user_id = auth.uid());
create policy "drops: claim own" on public.drops
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Fans may edit their own profile fields (name + socials). Policy already allows update on own row.

-- The leaderboard views call artist_points_all() with the caller's privileges, so fans need EXECUTE.
-- It only exposes (user_id, artist_id, points), the same data the leaderboards publish.
grant execute on function public.artist_points_all() to anon, authenticated;
