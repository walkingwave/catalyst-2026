# BandDrop

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
supabase/migrations/0002_*.sql      function grants (advisor fixes)
supabase/migrations/0003_*.sql      keep users.phone in E.164
supabase/migrations/0004_*.sql      concert imagery/description + activity map pins
supabase/migrations/0005_*.sql      artists/teams, per-artist pools, socials, social posts, messages, drops
supabase/migrations/0006_*.sql      live station (self-tap from any phone)
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
| `users` | `id` = auth user id, `name`, `phone`, `instagram`, `tiktok`, `x_handle`. Auto-created by trigger on `auth.users` insert. |
| `artists` | `slug`, `name`, `kind` (artist \| team), `image_url`, `bio`, `access_code` (console login, never exposed to clients) |
| `social_posts` | fan-submitted proof for `social` activities: `url`, `status` pending/approved/rejected |
| `messages` | artist → fan, `channel` inbox/sms, `sms_status` |
| `drops` | artist → fan gift: `title`, `message`, `code`, `claimed_at` |
| `concerts` | `artist_id`, `name`, `artist`, `venue`, `date`, `image_url`, `venue_image_url`, `description`, `doors_at`, `address` |
| `bands` | `uid` PK (tag serial, uppercase hex, no colons), `concert_id`, `user_id` nullable, `claimed_at`, `archived` |
| `activities` | per concert: `name`, `points`, `map_x`/`map_y` (percent on venue map), `location`, `icon`. Seed adds an "Entry" activity for attendance. |
| `scans` | `band_uid` + `activity_id`, unique together (no farming) |
| `rewards` | `artist_id`, `cost`, `type` (`merch` \| `discount_code`), `stock` |
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

Live project: **concertconnect** (`ivjrbaiiphqfvoynxwuc`, ca-central-1, org "wavy"). All three migrations are applied, demo data is seeded, phone auth is enabled. `.env.local` has the URL and anon key.

Still needed once: **Settings -> API Keys -> Legacy -> service_role** into `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Band pages, staff scans and claims use it.

**No SMS provider at all?** Everything still works:

- Sign-in: Supabase *test OTP* numbers log in with code `123456`, no text sent. `/admin` → **Phones** adds any number on the spot (needs `SUPABASE_ACCESS_TOKEN`, a personal access token from supabase.com/dashboard/account/tokens; no signup, you're already logged in). Without the token, edit the list in Authentication → Phone → Test OTPs.
- Notifications: every scan on a claimed band writes "+100 pts at Merch Booth. You're #3 tonight." to the fan's in-app inbox. Artist messages do the same. SMS is an optional extra on top.

Demo sign-in without Twilio: the Phone provider has test numbers registered (valid until 2026-11-30). Enter `555 010 0099` (new fan) or `555 010 0001`..`0006` (seeded fans) on the login screen, code `123456`. No SMS is sent. Any other number goes to Twilio, which currently holds placeholder credentials, so real SMS fails until you paste real Twilio creds in Authentication -> Sign In / Providers -> Phone.

Fresh project instead: run `supabase/migrations/*.sql` in order in the SQL editor, then `npm run seed`.

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
npm run seed                 # optional re-seed (live project is already seeded)
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

## Android NFC checklist

1. Chrome on Android (any recent version), NFC on in Settings → Connections.
2. Open the **production HTTPS URL** (Web NFC refuses plain http and LAN IPs).
3. `/admin` → Write → **Test NFC (read only)**, hold a band to the top-back of the phone. You should see its serial and any records. If Chrome asks for NFC permission, allow it.
4. Writing happens on the first tap: in the station's Scan mode (e.g. Entry), a blank tag gets registered, scanned, and its `/b/<serial>` URL written in one hold. The overlay says "Tag written". The Write tab still exists for pre-writing a stack of bands before doors.
5. Tap the band with an iPhone or another phone: it opens the band page.
6. Tap tab → pick an activity → Start NFC scanning → hold bands for the +N overlay.

Errors are spelled out on screen (permission denied, NFC off, tag moved during write). Screen stays awake while a session runs.

## Staff station

1. Android phone, Chrome, NFC on. Open `https://<domain>/staff` (Web NFC requires HTTPS; `localhost` also works).
2. Enter `STAFF_PIN`. It's remembered in localStorage until you tap **Lock**.
3. Pick concert + activity. Tap **Start NFC scanning**. Chrome asks for NFC permission once.
4. Hold bands to the back of the phone. Each tap: full-screen green `+N` (new), amber `Done` (already did this activity), red error.
5. Desktop / iPhone: type a UID in the manual box and press **Log**.

Each tap POSTs `{ band_uid, activity_id }` to `/api/scan` with header `x-staff-pin`. Admin routes (`/api/admin/events`, `/api/admin/bands`) use the same header. Response includes points, whether the band is claimed, owner name, and rank tonight.

## iPhone-only demo (no Android scanner)

Web NFC (`NDEFReader`) only exists in Chrome on Android, so the Tap and Write tabs can't scan on an iPhone. The fan side needs nothing: iPhones read NDEF URL tags natively and open Safari. So the demo makes **the fan's own tap the station**:

1. Write tags once with the free **NFC Tools** iOS app: Read the tag, copy its serial (strip colons), Write a URL record `https://<domain>/b/<SERIAL>`. Lock the tag if you want.
2. In `/admin` → Tap, pick an activity and press **Go live**. Only one station is live at a time, across all events.
3. Tap a band with any iPhone. The band page logs a scan for the live station and shows "+N pts · Activity". Tapping again shows "Already tapped in". Unknown serials auto-register to the live event, so step 1 is the only prep.
4. Switch the live station (Entry → Merch Booth → Photo Wall) or switch events from the admin dropdown to simulate moving through the venue or between shows.

Claimed bands redirect the owner to their dashboard with the same banner. `concerts.live_activity_id` holds the live station; `src/lib/tap.ts` does the work.

## Admin console

`/admin`, unlocked with `STAFF_PIN`. Built for demos without real tap stations.

- **Current event** switcher at the top, remembered per device. Everything below acts on that event.
- **Tap**: pick an activity, then tap bands (Web NFC on Android Chrome) or type a UID. **Go live** makes that activity the live station for iPhone demos (see above). Same `/api/scan` as the staff station, so switching events and tapping simulates a fan moving between shows.
- **Write**: turns the phone into an NFC writer. Each tapped tag is registered to the current event (`POST /api/admin/bands`) and gets `https://<domain>/b/<serial>` written as an NDEF URL (`NDEFReader.write`, overwrite on). Full-screen green/red result per tag. Desktop fallback: register a UID manually, write the URL with NFC Tools.
- **Bands**: look up any UID (owner, event, scans, tag URL), move it to another event, unclaim, archive/restore, clear scans. Lists all bands at the current event with points.
- **Events**: create an event with name, description, location, address, date, doors, artist or team (existing, or create one with a generated console access code), and activities with points. The possible-points total updates as you type. New events open in Write so you can start writing bands.

Staff station `/staff` is the slimmed-down tap-only version for booth workers.

## Artists and fandoms

Points are pooled **per artist or team**, not globally. A fan has a separate balance with Our Lady Peace, Neon Harbor, and the Toronto Marlies, and spends each only on that artist's rewards. `user_artist_points` is the source of truth; `user_points` sums it for the headline number. Leaderboards: per show (`leaderboard_concert`), per artist all-time (`leaderboard_artist`), and overall (`leaderboard_alltime`).

**Artist console** at `/artist`, unlocked with the artist's access code (`artists.access_code`; seeded: `OLP2026`, `NEON2026`, `MARLIES2026`):

- Top fans: rank, points, shows attended, linked socials, phone on file (last 4 only). Tap to select, or pick Top 5/10/25.
- Message: SMS + inbox or inbox only, to selected fans or Top N. SMS goes via Twilio when `SMS_NOTIFICATIONS=true`, otherwise recorded as `simulated`. Everything lands in the fan's inbox regardless.
- Drop: send a gift (title, message, optional code prefix numbered per fan) to selected fans or Top N. Fans claim it on their home screen.
- Social: approve or reject fan post submissions. Approval awards the activity's points to that artist's pool.
- Log: recent drops and messages.

APIs under `/api/artist/*` take header `x-artist-code`.

**Fan side**: `/profile` links Instagram, TikTok and X handles. Shows can include `social` activities (e.g. "Post on Instagram", +150). The fan pastes the post link on the show page; points arrive after the artist approves.

## Design

Cues from fandrop.com: monochrome, zero border radius, condensed uppercase display type, hard 2px rules, black-and-white photography, inverted black blocks for emphasis.

- Fonts: Clash Display (headlines, uppercase) and General Sans (body) via Fontshare, free for commercial use.
- Tokens in `src/app/globals.css`: `--ink`, `--line`, `--invert-bg/fg`, plus success/warning/danger. Light = white paper, dark = black. Toggle in the header, follows system by default.
- Primitives in `src/components/ui.tsx`: `Panel` (bordered or inverted), `List`/`Row` with hairline rules, `Button` filled/outline, `Headline` with a rule, `StatTile`.
- Photos get `.photo` (grayscale + contrast) so any artist image matches the system.
- 56px buttons/inputs, 56px tab bar (black with white icons), 17px inputs, safe-area insets, no overscroll bounce.

Demo show: Our Lady Peace at Massey Hall with a monochrome floor-plan map (`VenueMap`) whose pins come from `activities.map_x / map_y`. Photos are Creative Commons from Wikimedia (see `public/img/ATTRIBUTION.md`).

## Tests

```bash
npm test          # Vitest unit tests
npm run test:e2e  # Playwright API + e2e + axe a11y against the dev server and live Supabase
```

See `docs/TESTING.md` for coverage, how test data is isolated, and the UX gaps the suite found and fixed.

## Deploy

Repo remote: `github.com/walkingwave/catalyst-2026`. Vercel Hobby is free.

```bash
git push -u origin main
npx vercel login
npx vercel link            # create project "concertconnect" in walkingwave's projects
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production      # paste from .env.local, repeat for:
#   NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STAFF_PIN, SMS_NOTIFICATIONS
npx vercel --prod
```

Or in the Vercel dashboard: Add New Project -> import the GitHub repo -> paste the env vars -> Deploy.

Daily archive cron: add `"crons": [{ "path": "/api/cron/archive", "schedule": "0 4 * * *" }]` to `vercel.json` once the project is claimed (anonymous deployments can't define crons). `/api/cron/archive` can also be hit by hand.

No login? `npx vercel deploy --temporary` with `-b`/`-e` env flags gives a claimable URL that lives ~1 hour. `vercel.json` already strips the `allow_scripts` setting the CLI injects, which npm 11 rejects. Set `NEXT_PUBLIC_SITE_URL` to the production URL and write that domain into the tags. Web NFC on `/staff` needs HTTPS, so the staff phone must use the deployed URL (or `localhost` on the dev box).
