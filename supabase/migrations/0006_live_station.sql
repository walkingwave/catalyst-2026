-- "Live station": when set, any tap of a band's URL (e.g. from an iPhone) logs a scan for this activity.
-- Lets a demo run with no Android scanner: the fan's own phone is the tap station.
alter table public.concerts add column live_activity_id uuid references public.activities (id) on delete set null;
