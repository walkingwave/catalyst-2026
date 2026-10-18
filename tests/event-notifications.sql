-- Run ONLY on an empty, disposable PostgreSQL database with psql -v ON_ERROR_STOP=1.
-- Minimal fixtures for migration 0009; no SMS provider or live Supabase connection.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;
create table public.concerts (id uuid primary key, name text not null);
create table public.users (id uuid primary key, phone text);
create table public.bands (uid text primary key, concert_id uuid references concerts, user_id uuid references users, archived boolean default false);
create table public.messages (
  id uuid primary key default gen_random_uuid(), artist_id uuid not null,
  user_id uuid references users, channel text, body text, sms_status text
);
\ir ../supabase/migrations/0009_event_notifications.sql

begin;
insert into concerts values
  ('00000000-0000-0000-0000-000000000001', 'Event one'),
  ('00000000-0000-0000-0000-000000000002', 'Event two');
insert into users values
  ('10000000-0000-0000-0000-000000000001', '+15550100001'),
  ('10000000-0000-0000-0000-000000000002', null),
  ('10000000-0000-0000-0000-000000000003', '+15550100003');
insert into bands values
  ('one', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', false),
  ('duplicate', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', false),
  ('unclaimed', '00000000-0000-0000-0000-000000000001', null, false),
  ('archived', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', true),
  ('other-event', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', false);

do $$
declare
  event_id uuid := '00000000-0000-0000-0000-000000000001';
  job_id uuid := '20000000-0000-0000-0000-000000000001';
  work record;
  stats record;
begin
  assert (select fans = 1 and phones = 1 from event_notification_audience(event_id)), 'Audience must deduplicate and exclude archived/unclaimed/other events';
  insert into event_notifications(id, concert_id, body, channel, scheduled_at) values (job_id, event_id, 'Scheduled', 'sms', now() + interval '1 hour');
  assert (select count(*) = 0 from claim_event_notification_batch(job_id)), 'Never send early';
  assert (select count(*) = 0 from messages), 'Never insert a scheduled inbox message early';
  -- A fan who claims after scheduling but before dispatch is included.
  update bands set user_id = '10000000-0000-0000-0000-000000000002' where uid = 'unclaimed';
  update event_notifications set scheduled_at = now() - interval '1 second' where id = job_id;
  create temp table reserved as select * from claim_event_notification_batch(job_id);
  assert (select count(*) = 2 from reserved), 'Snapshot audience at dispatch';
  assert (select count(*) = 2 from messages), 'Persist one inbox per recipient before SMS';
  assert (select count(*) = 0 from claim_event_notification_batch(job_id)), 'Reserved recipients cannot be claimed twice';
  assert (select count(*) = 0 from messages where concert_id <> event_id or artist_id is not null), 'Event attribution must not impersonate an artist';
  -- A duplicate HTTP request cannot create another campaign.
  insert into event_notifications(id, concert_id, body, channel) values (job_id, event_id, 'Scheduled', 'sms') on conflict do nothing;
  assert (select count(*) = 1 from event_notifications), 'Request ID must be idempotent';
  for work in select * from reserved loop
    perform finish_event_notification_delivery(work.delivery_id, case when work.phone is null then 'skipped' else 'sent' end, case when work.phone is null then 'No phone' else null end);
  end loop;
  select * into stats from event_notification_history where id = job_id;
  assert stats.status = 'completed' and stats.inbox_count = 2 and stats.sms_sent = 1 and stats.skipped = 1, 'Summary must report actual delivery outcomes';
  assert not finish_event_notification_delivery((select delivery_id from reserved limit 1), 'failed', 'duplicate callback'), 'Late callbacks cannot overwrite finished results';

  insert into event_notifications(id, concert_id, body, channel, status) values ('20000000-0000-0000-0000-000000000002', event_id, 'Cancelled', 'inbox', 'cancelled');
  assert (select count(*) = 0 from claim_event_notification_batch('20000000-0000-0000-0000-000000000002')), 'Cancelled sends must not dispatch';

  job_id := '20000000-0000-0000-0000-000000000003';
  insert into event_notifications(id, concert_id, body, channel) values (job_id, event_id, 'Interrupted', 'sms');
  perform * from claim_event_notification_batch(job_id);
  update event_notification_deliveries set started_at = now() - interval '6 minutes' where notification_id = job_id;
  assert (select count(*) = 0 from claim_event_notification_batch(job_id)), 'Interrupted sends must never automatically resend';
  select * into stats from event_notification_history where id = job_id;
  assert stats.status = 'completed' and stats.unknown = 2, 'Interrupted SMS must become uncertain';

  job_id := '20000000-0000-0000-0000-000000000004';
  insert into event_notifications(id, concert_id, body, channel) values (job_id, event_id, 'Inbox recovery', 'inbox');
  perform * from claim_event_notification_batch(job_id);
  update event_notification_deliveries set started_at = now() - interval '6 minutes' where notification_id = job_id;
  perform * from claim_event_notification_batch(job_id);
  select * into stats from event_notification_history where id = job_id;
  assert stats.status = 'completed' and stats.inbox_count = 2 and stats.unknown = 0, 'Inbox-only recovery is safe without an external send';

  job_id := '20000000-0000-0000-0000-000000000005';
  insert into event_notifications(id, concert_id, body, channel) values (job_id, event_id, 'Batched', 'inbox');
  assert (select count(*) = 1 from claim_event_notification_batch(job_id, 1)), 'Batch size must be respected';
  assert (select count(*) = 1 from claim_event_notification_batch(job_id, 1)), 'Next batch continues remaining recipients';
  assert (select count(*) = 0 from claim_event_notification_batch(job_id, 1)), 'No duplicate recipients across batches';
  assert not has_function_privilege('anon', 'claim_event_notification_batch(uuid,integer)', 'execute'), 'Anonymous users must not claim sends';
  assert not has_function_privilege('authenticated', 'finish_event_notification_delivery(uuid,text,text)', 'execute'), 'Fans must not forge results';
  assert not has_table_privilege('authenticated', 'event_notifications', 'insert'), 'Fans must not create broadcasts';
end;
$$;
rollback;
\echo Event notification queue assertions passed.
