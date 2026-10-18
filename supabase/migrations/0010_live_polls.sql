-- Live fan polls run by an artist/team. One vote per fan per poll, changeable while open.
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  concert_id uuid references public.concerts (id) on delete set null,
  question text not null check (length(btrim(question)) between 1 and 140),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opened_at timestamptz,
  closes_at timestamptz,        -- optional timer; null = until the artist closes it
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index polls_artist_idx on public.polls (artist_id, created_at desc);
create index polls_open_idx on public.polls (status) where status = 'open';

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 60),
  position integer not null default 0
);
create index poll_options_poll_idx on public.poll_options (poll_id, position);

create table public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index poll_votes_option_idx on public.poll_votes (option_id);

-- A poll is "live" while open and before its timer runs out.
create or replace function public.poll_is_live(p public.polls)
returns boolean language sql immutable as $$
  select p.status = 'open' and (p.closes_at is null or p.closes_at > now());
$$;

-- Aggregated counts only; never exposes who voted.
create or replace view public.poll_results as
select o.poll_id, o.id as option_id, o.label, o.position, count(v.user_id)::integer as votes
from public.poll_options o
left join public.poll_votes v on v.option_id = o.id
group by o.poll_id, o.id, o.label, o.position;

-- Fans vote through this. Checks the poll is open, the option belongs to it, and upserts (vote can change).
create or replace function public.cast_vote(p_poll_id uuid, p_option_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_poll public.polls%rowtype;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into v_poll from public.polls where id = p_poll_id;
  if not found then raise exception 'poll not found'; end if;
  if v_poll.status <> 'open' or (v_poll.closes_at is not null and v_poll.closes_at <= now()) then
    raise exception 'poll is closed';
  end if;
  if not exists (select 1 from public.poll_options where id = p_option_id and poll_id = p_poll_id) then
    raise exception 'option not in poll';
  end if;
  insert into public.poll_votes (poll_id, option_id, user_id) values (p_poll_id, p_option_id, v_user)
  on conflict (poll_id, user_id) do update set option_id = excluded.option_id, created_at = now();
end;
$$;
grant execute on function public.cast_vote(uuid, uuid) to authenticated;
revoke execute on function public.cast_vote(uuid, uuid) from anon;

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- Fans see open and closed polls (not drafts), their options, aggregate results, and only their own vote.
create policy "polls: read published" on public.polls for select to anon, authenticated using (status in ('open', 'closed'));
create policy "poll_options: read published" on public.poll_options for select to anon, authenticated
  using (exists (select 1 from public.polls p where p.id = poll_options.poll_id and p.status in ('open', 'closed')));
create policy "poll_votes: read own" on public.poll_votes for select to authenticated using (user_id = auth.uid());
grant select on public.poll_results to anon, authenticated;

-- Realtime: fans get open/close instantly; vote counts are re-fetched on change.
alter publication supabase_realtime add table public.polls;
alter publication supabase_realtime add table public.poll_votes;
