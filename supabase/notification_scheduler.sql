-- Run AFTER migration 0009 and deployment of /api/cron/notifications.
-- In Supabase Vault, first create:
--   banddrop_site_url    = https://banddrop.vercel.app (no trailing slash)
--   banddrop_cron_secret = the same random CRON_SECRET set in Vercel
-- Never paste real secret values into this tracked file.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'banddrop-event-notifications',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'banddrop_site_url') || '/api/cron/notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'banddrop_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);
