# ConcertConnect

NFC wristbands that track concert activity and points, plus one mobile website for fans.
No app, no passwords. Name + phone + SMS code.

- Fans tap their wristband with any phone -> `https://<domain>/b/<UID>` opens natively.
- Staff scan bands at booths with an Android phone (Web NFC) -> points land on the band UID.
- Fans claim a band once (name + phone + OTP). Every past scan on that band counts instantly.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind v4) on Vercel · Supabase (Postgres, Auth phone OTP via Twilio, RLS) · Twilio (optional post-scan texts) · Web NFC (`NDEFReader`, Android Chrome).

## Layout

```
supabase/migrations/0001_init.sql   schema, views, RLS, redeem_reward(), archive_expired_bands()
scripts/seed.ts                     demo data (npm run seed)
src/proxy.ts                        refreshes Supabase session cookie on every request
src/lib/supabase/{server,client,admin}.ts
src/lib/{phone,uid,sms,staff,fan,types}.ts
src/app/b/[uid]/                    band tap landing + claim flow
src/app/login/                      phone OTP login
src/app/dashboard/  concerts/  marketplace/  leaderboard/
src/app/staff/                      staff scan station (Web NFC + manual UID)
src/app/api/scan                    POST, staff PIN, logs a scan
src/app/api/claim                   POST, locks a band to the signed-in fan
src/app/api/staff/{verify,catalog}  PIN check, concerts + activities
src/app/api/cron/archive            daily: archive unclaimed bands 30d after show
```

## Data model

| table | notes |
|---|---|
| `users` | `id` = auth user id, `name`, `phone`. Auto-created by trigger on `auth.users` insert. |
| `concerts` | `name`, `artist`, `venue`, `date` |
| `bands` | `uid` PK (tag serial, uppercase hex, no colons), `concert_id`, `user_id` nullable, `claimed_at`, `archived` |
| `activities` | per concert: `name`, `points`. Seed adds an "Entry" activity for attendance. |
| `scans` | `band_uid` + `activity_id`, unique together (no farming) |
| `rewards` | `cost`, `type` (`merch` \| `discount_code`), `stock` |
| `reward_codes` | one row per code, `redeemed_by` nullable |
| `redemptions` | `user_id`, `reward_id`, `code_id` |

Views: `band_points` (per band), `user_points` (earned across owned bands minus spent; RLS-scoped), `leaderboard_concert` and `leaderboard_alltime` (`rank()` window function, public name + points only).

Functions: `redeem_reward(p_reward_id)` (atomic, called via `rpc` by the fan), `archive_expired_bands()` (cron).

RLS: fans read only their own users/bands/scans/codes/redemptions. Concerts, activities, rewards, leaderboards are readable by everyone. **No client writes.** Scans and claims go through server routes using the service role; redemptions go through the definer function.

## Env vars

Copy `.env.example` to `.env.local`:

| var | purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | public URL, used for tag URLs in seed output |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | server only; scan/claim routes and seed |
| `STAFF_PIN` | unlocks `/staff` and `/api/scan` |
| `SMS_NOTIFICATIONS` | `true` to text fans after each scan on a claimed band (default off) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | only needed when `SMS_NOTIFICATIONS=true` |
| `CRON_SECRET` | protects `/api/cron/archive`; Vercel sets the header automatically |

## Supabase setup

1. Create a project. Copy URL, anon key, service role key into `.env.local`.
2. SQL Editor -> paste `supabase/migrations/0001_init.sql` -> run. (Or `supabase db push` with the CLI.)
3. Authentication -> Providers -> **Phone**: enable. SMS provider: **Twilio**. Enter Account SID, Auth Token, and your Twilio number (or Messaging Service SID).
4. Authentication -> Rate limits: raise "SMS messages per hour" if you'll demo a lot.
5. Optional: Authentication -> Phone -> **Test OTP** lets you map a demo phone to a fixed code with no SMS at all. Handy for demos.

Scans on an unknown UID auto-register the band to the activity's concert, so you never need to pre-load band rows.

## Twilio setup

1. Create a Twilio account, buy a number with SMS.
2. **Trial accounts can only text verified numbers.** Twilio Console -> Phone Numbers -> Verified Caller IDs -> add every phone you'll demo with (yours, teammates', judges' if they'll sign up live).
3. Put SID/token/number in Supabase phone auth (step 3 above). The same creds go in `.env.local` only if you turn on `SMS_NOTIFICATIONS`.
4. Trial messages carry a "Sent from your Twilio trial account" prefix. Fine for a demo.

## Run

```bash
npm install
cp .env.example .env.local   # fill in
npm run seed                 # demo concert, activities, 10 bands, fans, rewards
npm run dev                  # http://localhost:3000
```

Seed prints band UIDs. Try `/b/04A1B2C3D4E505` (unclaimed, 245 pts) to walk the claim flow.

Demo fans (`+15550100001`…`06`) are fake numbers. To log in as one, use Supabase's Test OTP feature, or just claim a fresh band with your real phone.

## Writing band URLs to NTAG215 tags

Use the **NFC Tools** app (iOS/Android).

1. Open NFC Tools -> **Read** -> hold a tag. Note the **Serial number**, e.g. `04:A1:B2:C3:D4:E5:06`.
2. Strip the colons, uppercase: `04A1B2C3D4E506`. That's the band UID.
3. **Write** -> Add a record -> **URL/URI** -> `https://<your-domain>/b/04A1B2C3D4E506` -> Write -> hold the tag.
4. Tap the tag with any phone. iPhone shows a banner, Android opens Chrome. Both land on the band page.

The staff station reads the tag's hardware serial (`NDEFReadingEvent.serialNumber`), so the URL and the serial must match. The app normalizes both (strips separators, uppercases), so `04:a1:…` and `04A1…` are the same band.

Tip: lock the tags after writing (NFC Tools -> Other -> Lock) so fans can't rewrite them.

## Staff station

1. Android phone, Chrome, NFC on. Open `https://<domain>/staff` (Web NFC requires HTTPS; `localhost` also works).
2. Enter `STAFF_PIN`. It's remembered in localStorage until you tap **Lock**.
3. Pick concert + activity. Tap **Start NFC scanning**. Chrome asks for NFC permission once.
4. Hold bands to the back of the phone. Each tap: full-screen green `+N` (new), amber `Done` (already did this activity), red error.
5. Desktop / iPhone: type a UID in the manual box and press **Log**.

Each tap POSTs `{ band_uid, activity_id }` to `/api/scan` with header `x-staff-pin`. Response includes points, whether the band is claimed, owner name, and rank tonight.

## Deploy

Vercel: import repo, add the env vars, deploy. `vercel.json` schedules `/api/cron/archive` daily (flags unclaimed bands 30 days after their concert). Set `NEXT_PUBLIC_SITE_URL` to the production URL and write that domain into the tags.
