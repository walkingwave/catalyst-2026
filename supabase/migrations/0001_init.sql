-- ConcertConnect schema
-- Run in Supabase SQL editor or via `supabase db push`.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  phone text unique,
  created_at timestamptz not null default now()
);

create table public.concerts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  artist text not null,
  venue text not null,
  date date not null
);

create table public.bands (
  uid text primary key,
  concert_id uuid not null references public.concerts (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  claimed_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index bands_user_id_idx on public.bands (user_id);
create index bands_concert_id_idx on public.bands (concert_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts (id) on delete cascade,
  name text not null,
  points integer not null check (points >= 0)
);
create index activities_concert_id_idx on public.activities (concert_id);

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  band_uid text not null references public.bands (uid) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  unique (band_uid, activity_id)
);
create index scans_activity_id_idx on public.scans (activity_id);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  cost integer not null check (cost >= 0),
  type text not null check (type in ('merch', 'discount_code')),
  stock integer not null default 0 check (stock >= 0)
);

create table public.reward_codes (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards (id) on delete cascade,
  code text not null,
  redeemed_by uuid references public.users (id) on delete set null
);
create index reward_codes_reward_id_idx on public.reward_codes (reward_id);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  reward_id uuid not null references public.rewards (id) on delete cascade,
  code_id uuid references public.reward_codes (id) on delete set null,
  created_at timestamptz not null default now()
);
create index redemptions_user_id_idx on public.redemptions (user_id);

-- ---------- auth -> users mirror ----------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    new.phone
  )
  on conflict (id) do update
    set phone = excluded.phone,
        name = case when public.users.name = '' then excluded.name else public.users.name end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------- views ----------

-- Points per band (all bands, claimed or not). Used by the band landing preview.
create or replace view public.band_points
with (security_invoker = true) as
select
  b.uid as band_uid,
  b.concert_id,
  b.user_id,
  coalesce(sum(a.points), 0)::integer as points,
  count(s.id)::integer as activity_count
from public.bands b
left join public.scans s on s.band_uid = b.uid
left join public.activities a on a.id = s.activity_id
group by b.uid;

-- Balance per user: earned across all owned bands minus spent on redemptions.
-- security_invoker so RLS limits a fan to their own row.
create or replace view public.user_points
with (security_invoker = true) as
with earned as (
  select b.user_id, coalesce(sum(a.points), 0)::integer as earned
  from public.bands b
  join public.scans s on s.band_uid = b.uid
  join public.activities a on a.id = s.activity_id
  where b.user_id is not null
  group by b.user_id
),
spent as (
  select r.user_id, coalesce(sum(rw.cost), 0)::integer as spent
  from public.redemptions r
  join public.rewards rw on rw.id = r.reward_id
  group by r.user_id
)
select
  u.id as user_id,
  coalesce(e.earned, 0) as earned,
  coalesce(s.spent, 0) as spent,
  coalesce(e.earned, 0) - coalesce(s.spent, 0) as balance
from public.users u
left join earned e on e.user_id = u.id
left join spent s on s.user_id = u.id;

-- Leaderboards are public (name + points only). Definer views bypass RLS on purpose.
create or replace view public.leaderboard_concert as
select
  c.id as concert_id,
  u.id as user_id,
  u.name,
  coalesce(sum(a.points), 0)::integer as points,
  rank() over (partition by c.id order by coalesce(sum(a.points), 0) desc, min(s.scanned_at) asc)::integer as rank
from public.concerts c
join public.bands b on b.concert_id = c.id and b.user_id is not null
join public.users u on u.id = b.user_id
left join public.scans s on s.band_uid = b.uid
left join public.activities a on a.id = s.activity_id
group by c.id, u.id, u.name;

create or replace view public.leaderboard_alltime as
select
  u.id as user_id,
  u.name,
  coalesce(sum(a.points), 0)::integer as points,
  rank() over (order by coalesce(sum(a.points), 0) desc, min(s.scanned_at) asc)::integer as rank
from public.users u
join public.bands b on b.user_id = u.id
left join public.scans s on s.band_uid = b.uid
left join public.activities a on a.id = s.activity_id
group by u.id, u.name;

-- ---------- functions ----------

-- Redeem a reward atomically. Called by the fan via rpc(). Returns the code (if any).
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
  if not found then
    raise exception 'reward not found';
  end if;
  if v_reward.stock <= 0 then
    raise exception 'sold out';
  end if;

  select balance into v_balance from public.user_points where user_id = v_user;
  if coalesce(v_balance, 0) < v_reward.cost then
    raise exception 'not enough points';
  end if;

  if v_reward.type = 'discount_code' then
    select * into v_code
    from public.reward_codes
    where reward_id = p_reward_id and redeemed_by is null
    order by id
    limit 1
    for update skip locked;
    if not found then
      raise exception 'sold out';
    end if;
    update public.reward_codes set redeemed_by = v_user where id = v_code.id;
  end if;

  update public.rewards set stock = stock - 1 where id = p_reward_id;

  insert into public.redemptions (user_id, reward_id, code_id)
  values (v_user, p_reward_id, v_code.id)
  returning id into v_redemption_id;

  return query select v_redemption_id, v_code.code;
end;
$$;

grant execute on function public.redeem_reward(uuid) to authenticated;

-- Flag unclaimed bands 30 days after their concert. Run daily (Vercel cron hits /api/cron/archive).
create or replace function public.archive_expired_bands()
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.bands b
    set archived = true
    from public.concerts c
    where c.id = b.concert_id
      and b.user_id is null
      and b.archived = false
      and c.date < current_date - interval '30 days'
    returning b.uid
  )
  select count(*)::integer from updated;
$$;

-- ---------- RLS ----------

alter table public.users enable row level security;
alter table public.concerts enable row level security;
alter table public.bands enable row level security;
alter table public.activities enable row level security;
alter table public.scans enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_codes enable row level security;
alter table public.redemptions enable row level security;

create policy "users: read own" on public.users
  for select to authenticated using (id = auth.uid());
create policy "users: update own name" on public.users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "concerts: public read" on public.concerts
  for select to anon, authenticated using (true);
create policy "activities: public read" on public.activities
  for select to anon, authenticated using (true);
create policy "rewards: public read" on public.rewards
  for select to anon, authenticated using (true);

create policy "bands: read own" on public.bands
  for select to authenticated using (user_id = auth.uid());

create policy "scans: read own bands" on public.scans
  for select to authenticated using (
    exists (select 1 from public.bands b where b.uid = scans.band_uid and b.user_id = auth.uid())
  );

create policy "reward_codes: read own" on public.reward_codes
  for select to authenticated using (redeemed_by = auth.uid());

create policy "redemptions: read own" on public.redemptions
  for select to authenticated using (user_id = auth.uid());

-- No insert/update/delete policies: all writes go through server routes (service role)
-- or the redeem_reward() definer function.

grant select on public.band_points, public.user_points, public.leaderboard_concert, public.leaderboard_alltime to anon, authenticated;
