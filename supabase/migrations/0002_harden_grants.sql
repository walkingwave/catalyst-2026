-- Only service role (cron route) may archive; trigger fn not callable via API; redeem only when signed in.
revoke execute on function public.archive_expired_bands() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.redeem_reward(uuid) from public, anon;
grant execute on function public.redeem_reward(uuid) to authenticated;
