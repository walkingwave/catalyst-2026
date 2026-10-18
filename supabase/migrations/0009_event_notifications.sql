-- Durable event-wide sends. Only staff server routes / the queue worker can access the queue.
-- Event messages have their own attribution, so they do not change the artist console.
alter table public.messages add column concert_id uuid references public.concerts(id) on delete cascade;
alter table public.messages alter column artist_id drop not null;
alter table public.messages add constraint messages_sender_check check (artist_id is not null or concert_id is not null);

create table public.event_notifications (
  id uuid primary key, -- client request ID prevents duplicate sends after a lost HTTP response
  concert_id uuid not null references public.concerts(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 320),
  channel text not null check (channel in ('inbox', 'sms')),
  scheduled_at timestamptz, -- null means send now
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index event_notifications_due_idx on public.event_notifications (status, scheduled_at, created_at);
create index event_notifications_concert_idx on public.event_notifications (concert_id, created_at desc);

create table public.event_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.event_notifications(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'unknown')),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  unique (notification_id, user_id)
);
create index event_notification_deliveries_queue_idx on public.event_notification_deliveries (notification_id, status);

create table public.notification_worker (
  id boolean primary key default true check (id),
  last_seen_at timestamptz not null
);

alter table public.event_notifications enable row level security;
alter table public.event_notification_deliveries enable row level security;
alter table public.notification_worker enable row level security;
revoke all on public.event_notifications, public.event_notification_deliveries, public.notification_worker from anon, authenticated;
grant all on public.event_notifications, public.event_notification_deliveries, public.notification_worker to service_role;

create view public.event_notification_history with (security_invoker = true) as
select n.*,
  count(d.id)::integer as recipients,
  count(d.message_id)::integer as inbox_count,
  count(d.id) filter (where n.channel = 'sms' and d.status = 'sent')::integer as sms_sent,
  count(d.id) filter (where d.status = 'failed')::integer as failed,
  count(d.id) filter (where d.status = 'skipped')::integer as skipped,
  count(d.id) filter (where d.status = 'unknown')::integer as unknown,
  count(d.id) filter (where d.status in ('pending', 'sending'))::integer as remaining
from public.event_notifications n
left join public.event_notification_deliveries d on d.notification_id = n.id
group by n.id;
revoke all on public.event_notification_history from anon, authenticated;
grant select on public.event_notification_history to service_role;

create function public.event_notification_audience(p_concert_id uuid)
returns table (fans integer, phones integer)
language sql stable set search_path = public as $$
  select count(*)::integer, count(nullif(u.phone, ''))::integer
  from public.users u
  where exists (
    select 1 from public.bands b
    where b.concert_id = p_concert_id and b.user_id = u.id and not b.archived
  );
$$;

-- Lock the campaign before snapshotting its audience or reserving deliveries.
-- All callers (immediate sends and periodic workers) share these database locks.
create function public.claim_event_notification_batch(p_notification_id uuid default null, p_limit integer default 20)
returns table (delivery_id uuid, user_id uuid, phone text, body text, channel text, event_name text)
language plpgsql set search_path = public as $$
declare
  job public.event_notifications%rowtype;
  delivery public.event_notification_deliveries%rowtype;
  new_message_id uuid;
  event_title text;
begin
  select n.* into job from public.event_notifications n
  where (p_notification_id is null or n.id = p_notification_id)
    and coalesce(n.scheduled_at, n.created_at) <= now()
    and (n.status = 'scheduled' or (n.status = 'processing' and (exists (
      select 1 from public.event_notification_deliveries d where d.notification_id = n.id
      and (d.status = 'pending' or (d.status = 'sending' and d.started_at < now() - interval '5 minutes'))
    ) or not exists (
      select 1 from public.event_notification_deliveries d where d.notification_id = n.id and d.status in ('pending', 'sending')
    ))))
  order by coalesce(n.scheduled_at, n.created_at), n.id
  limit 1 for update skip locked;
  if not found then return; end if;

  select c.name into event_title from public.concerts c where c.id = job.concert_id;
  if job.status = 'scheduled' then
    insert into public.event_notification_deliveries(notification_id, user_id)
      select distinct job.id, b.user_id from public.bands b
      where b.concert_id = job.concert_id and b.user_id is not null and not b.archived
      on conflict do nothing;
    update public.event_notifications set status = 'processing', started_at = now() where id = job.id;
  end if;

  -- A process may die after sending but before saving the response. Never resend
  -- such SMS automatically; keep its inbox copy and surface the uncertain outcome.
  update public.messages m set sms_status = case when job.channel = 'sms' then 'unknown: worker interrupted' else null end
  from public.event_notification_deliveries d
  where d.notification_id = job.id and d.status = 'sending'
    and d.started_at < now() - interval '5 minutes' and m.id = d.message_id;
  update public.event_notification_deliveries set
    status = case when job.channel = 'inbox' then 'sent' else 'unknown' end,
    error = case when job.channel = 'sms' then 'Worker interrupted; check delivery before resending.' else null end,
    finished_at = now()
  where notification_id = job.id and status = 'sending' and started_at < now() - interval '5 minutes';

  for delivery in
    select d.* from public.event_notification_deliveries d
    where d.notification_id = job.id and d.status = 'pending'
    order by d.id limit greatest(1, least(p_limit, 20)) for update skip locked
  loop
    insert into public.messages(concert_id, user_id, channel, body, sms_status)
    values (job.concert_id, delivery.user_id, job.channel, job.body, case when job.channel = 'sms' then 'pending' else null end)
    returning id into new_message_id;
    update public.event_notification_deliveries
    set status = 'sending', started_at = now(), message_id = new_message_id where id = delivery.id;
    return query select delivery.id, u.id, u.phone, job.body, job.channel, event_title
      from public.users u where u.id = delivery.user_id;
  end loop;

  if not exists (select 1 from public.event_notification_deliveries d where d.notification_id = job.id and d.status in ('pending', 'sending')) then
    update public.event_notifications set status = 'completed', finished_at = now() where id = job.id;
  end if;
end;
$$;

create function public.finish_event_notification_delivery(p_delivery_id uuid, p_status text, p_error text default null)
returns boolean language plpgsql set search_path = public as $$
declare
  job public.event_notifications%rowtype;
  delivery public.event_notification_deliveries%rowtype;
begin
  if p_status not in ('sent', 'failed', 'skipped', 'unknown') then raise exception 'Invalid delivery status'; end if;
  -- Same lock order as claiming: campaign then recipient.
  select n.* into job from public.event_notifications n
    join public.event_notification_deliveries d on d.notification_id = n.id
    where d.id = p_delivery_id for update of n;
  if not found then return false; end if;
  update public.event_notification_deliveries set status = p_status, error = left(p_error, 300), finished_at = now()
    where id = p_delivery_id and status = 'sending' returning * into delivery;
  if not found then return false; end if;
  update public.messages set sms_status = case
    when job.channel = 'inbox' then null
    when p_status = 'sent' then 'sent'
    else p_status || coalesce(': ' || left(p_error, 300), '')
  end where id = delivery.message_id;
  if not exists (select 1 from public.event_notification_deliveries d where d.notification_id = job.id and d.status in ('pending', 'sending')) then
    update public.event_notifications set status = 'completed', finished_at = now() where id = job.id;
  end if;
  return true;
end;
$$;

revoke all on function public.event_notification_audience(uuid),
  public.claim_event_notification_batch(uuid, integer),
  public.finish_event_notification_delivery(uuid, text, text) from public, anon, authenticated;
grant execute on function public.event_notification_audience(uuid),
  public.claim_event_notification_batch(uuid, integer),
  public.finish_event_notification_delivery(uuid, text, text) to service_role;
