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
supabase/migrations/0007_*.sql      saved drop templates (artist console)
supabase/migrations/0008_*.sql      media storage bucket + custom venue map image
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

Create `.env.local` with these settings (the file is gitignored):

| var | purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | public URL, used for tag URLs in seed output |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | server only; scan/claim routes and seed |
| `STAFF_PIN` | unlocks `/staff` and `/api/scan` |
| `SMS_NOTIFICATIONS` | `true` enables artist messages, drop alerts and scan texts (default off) |
| `TEXTBELT_KEY` | paid Textbelt key; takes precedence over Twilio. Define it only once. |
| `SUPABASE_SMS_HOOK_SECRET` | signing secret for the Supabase Send SMS hook (OTP login) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | optional alternative when no Textbelt key is set |
| `CRON_SECRET` | protects `/api/cron/archive`; Vercel sets the header automatically |

## Supabase setup

Live project: **banddrop** (Supabase project slug still `concertconnect`) (`ivjrbaiiphqfvoynxwuc`, ca-central-1, org "wavy"). All three migrations are applied, demo data is seeded, phone auth is enabled. `.env.local` has the URL and anon key.

Still needed once: **Settings -> API Keys -> Legacy -> service_role** into `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Band pages, staff scans and claims use it.

**No SMS provider at all?** Everything still works:

- Sign-in: Supabase *test OTP* numbers log in with code `123456`, no text sent. `/admin` → event → **People** → **+ Demo user** adds one on the spot (needs `SUPABASE_ACCESS_TOKEN`, a personal access token from supabase.com/dashboard/account/tokens; no signup, you're already logged in). Without the token, edit the list in Authentication → Phone → Test OTPs.
- Notifications: every scan on a claimed band writes "+100 pts at Merch Booth. You're #3 tonight." to the fan's in-app inbox. Artist messages do the same. SMS is an optional extra on top.

Demo sign-in without SMS: the Phone provider has test numbers registered (valid until 2026-11-30). Enter `555 010 0099` (Taylor B.) or `555 010 0001`..`0006` (seeded fans) on the login screen, code `123456`. No SMS is sent. For real numbers, enable the Send SMS hook below.

Fresh project instead: run `supabase/migrations/*.sql` in order in the SQL editor, then `npm run seed`.

Scans on an unknown UID auto-register the band to the activity's concert, so you never need to pre-load band rows.

## Textbelt and notification setup

1. Set `TEXTBELT_KEY` to the paid key and `SMS_NOTIFICATIONS=true` in `.env.local`. Do not add a second `TEXTBELT_KEY=textbelt` entry: that free key would override the paid one.
2. For the live site, set the same variables in **Vercel → Project → Settings → Environment Variables → Production**, together with the Supabase URL, anon key and service-role key. Redeploy to apply them. Local env changes do not update Vercel.
3. For phone login only, enable **Supabase → Authentication → Hooks → Send SMS → HTTPS**, pointing at `https://<site>/api/hooks/send-sms`. Set its signing secret as `SUPABASE_SMS_HOOK_SECRET` on the deployment handling that URL. A local server needs a public tunnel. The hook replaces Supabase's SMS provider dropdown; Textbelt does not need to appear there.
4. Notification sends go directly from the app to Textbelt and do not need the Supabase hook. OTP sends bypass `SMS_NOTIFICATIONS`; artist/drop/scan notifications respect it.

To test using your own phone:

1. Sign in with your real number and claim a band for the artist's event. This puts you in their fan audience. Seeded fake phone numbers cannot receive texts.
2. Open `/artist`, enter the artist's access code, select only your fan in **Fans**, then **Message → SMS + inbox**. Send a short test. The result reports how many SMS requests the provider accepted, failed or skipped; **Log** shows each fan's status.
3. Open `/dashboard` as the fan. The inbox updates every 15 seconds while visible and when you return to the tab, even if SMS failed.
4. In **Drop**, optionally check **Send an SMS alert** before sending a gift. The drop itself always appears in the fan inbox.
5. In `/staff` or `/admin → Tap`, scan a claimed band at an activity it has not completed. The scan creates an inbox notification and, when enabled, a text. Duplicate scans do not send another notification.

The artist console's individual fan panel also supports **Message → SMS + inbox** and **Drop → Send an SMS alert**, with results shown inside the panel. Fan search, custom Top N selection, saved drop templates and the searchable log remain available.

Messages are saved before attempting SMS. `sent` means the provider accepted the request, not confirmed delivery to the handset. Failures are saved in `sms_status`; timeouts are not retried automatically because the provider may already have accepted the text. Scan notifications use Next.js `after()` so Vercel keeps the work alive after responding. This is not a durable retry queue; check the log before manually resending.

The app adds its STOP footer until a successful SMS is recorded for that fan. Concurrent first sends may both include it, and provider-added opt-out wording is outside the app's control.

**Timing:** Message, Drop and event alerts all send immediately; scan notifications are triggered by activity. There is no scheduling and no notification cron. Notifications mean SMS and the dashboard inbox, not browser push notifications.

## Event alerts (admin and staff)

Pick an event in `/admin` or `/staff`, then open **Alerts**. Choose **Inbox** or
**SMS** and press **Send**. The request sends to every fan with an active claimed
band at that event, one copy per fan, and returns when delivery finishes. Inbox
alerts appear on the fan dashboard; SMS alerts are texted only.

**Sent** shows inbox/SMS counts and failures. SMS acceptance does not guarantee
handset delivery. Retrying the same message reuses its request ID, so a lost
response never sends it twice. If a send is interrupted, reopening Alerts for
that event resumes it; fans who already received it are skipped. Interrupted SMS
reservations become uncertain and are not re-texted automatically.

Requires `supabase/migrations/0009_event_notifications.sql` (already applied to
the live project). No worker, cron or `CRON_SECRET` is needed for alerts.

## People (admin)

Inside an event, **People** lists every account with a claimed band there, with
phone number and a Real/Demo badge. Tap a person to edit their name or phone.
**+ Demo user** creates an account with a made-up number (the **Random** button
generates one in the fictional 555-01xx range), assigns it a band at the event,
and registers the number as a Supabase test OTP so it signs in at `/login` with
code `123456`. Demo users can be deleted; real accounts cannot.

Creating, renumbering or deleting demo users edits the project's auth config, so
`SUPABASE_ACCESS_TOKEN` must belong to a Supabase account with Owner or
Administrator access to the project. A read-only/developer token can list people
but not create demo logins.

## Run

```bash
npm install
# Create .env.local with the settings above
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

`/admin`, unlocked with `STAFF_PIN`. Five tabs; the current event dropdown at the top drives Station and Bands.

- **Station**: full-screen tap screen with four modes. **Scan** logs taps for the chosen activity and writes the band URL to blank tags. **Write** registers bands to the event and writes the URL (pre-write a stack before doors). **Read** shows a band's owner, event, points and tap history. **Reset** wipes a band. Manual UID entry at the bottom for desktops and iPhones.
- **Events**: list, create, and a full editor per event: details (save on blur), photos (artist hero, venue photo, custom venue map upload), activities (add / edit / delete, points, location, social vs tap-in), pin placement by tapping the map, live station toggle, delete event.
- **Rewards**: per artist/team: add / edit / delete rewards, stock or discount codes (paste one per line). **Profile** edits the artist's name, kind, bio, photo and console access code.
- **Bands**: look up any UID (owner, event, scans, tag URL), move between events, unclaim, archive/restore, clear scans, reset.
- **People**: everyone with a band at the event; edit them or add demo users that sign in with code `123456` (needs an Owner/Admin `SUPABASE_ACCESS_TOKEN`).

Images go to the public `media` bucket in Supabase Storage via `POST /api/admin/upload`. A custom venue map replaces the drawn floor plan on the fan's show page; pins keep their percent coordinates.

## Artists and fandoms

Points are pooled **per artist or team**, not globally. A fan has a separate balance with Our Lady Peace, Neon Harbor, and the Toronto Marlies, and spends each only on that artist's rewards. `user_artist_points` is the source of truth; `user_points` sums it for the headline number. Leaderboards: per show (`leaderboard_concert`), per artist all-time (`leaderboard_artist`), and overall (`leaderboard_alltime`).

**Artist console** at `/artist`, unlocked with the artist's access code (`artists.access_code`; seeded: `OLP2026`, `NEON2026`, `MARLIES2026`):

- Top fans: rank, points, shows attended, linked socials, phone on file (last 4 only). Tap to select, or pick Top 5/10/25.
- Message: SMS + inbox or inbox only, to selected fans or Top N. SMS uses Textbelt when configured, otherwise Twilio. SMS availability is shown in the console; disabled SMS is not silently simulated. The inbox copy remains if the SMS fails.
- Drop: send a gift (title, message, optional code prefix numbered per fan) to selected fans or Top N, with an optional SMS alert. Fans claim it on their home screen.
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
npx vercel link            # create project "banddrop" in walkingwave's projects
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production      # paste from .env.local, repeat for:
#   NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STAFF_PIN, SMS_NOTIFICATIONS
npx vercel --prod
```

Or in the Vercel dashboard: Add New Project -> import the GitHub repo -> paste the env vars -> Deploy.

Daily archive cron: add `"crons": [{ "path": "/api/cron/archive", "schedule": "0 4 * * *" }]` to `vercel.json` once the project is claimed (anonymous deployments can't define crons). `/api/cron/archive` can also be hit by hand.

No login? `npx vercel deploy --temporary` with `-b`/`-e` env flags gives a claimable URL that lives ~1 hour. `vercel.json` already strips the `allow_scripts` setting the CLI injects, which npm 11 rejects. Set `NEXT_PUBLIC_SITE_URL` to the production URL and write that domain into the tags. Web NFC on `/staff` needs HTTPS, so the staff phone must use the deployed URL (or `localhost` on the dev box).

## Images and links

Drops, drop templates and messages take an optional image (JPG, PNG, WebP, GIF or SVG, 8 MB max), uploaded from the artist console to the public `media` bucket through `/api/artist/upload`. Fans see it in the inbox card. SMS is text only, so every outgoing text ends with a link to `NEXT_PUBLIC_SITE_URL` (defaults to https://banddrop.vercel.app) so the fan can open the full drop or message. Migration `0011_media_messages.sql`.

## Live polls

Artists run polls from the **Polls** tab in the console: a question, 2–6 options, an optional timer, and an optional show (defaults to all fans). Open now or save as a draft, then Open / Close / Reopen from the list. Opening a poll drops an inbox note to the artist's fans.

Fans see open polls at the top of Home (for their current event) and on the show page. One tap votes, tapping another option changes the vote while the poll is open. Results stream in via Supabase Realtime (`polls`, `poll_votes`) with a 4s fetch fallback, and the card flips to "Poll closed" when the artist closes it or the timer runs out.

Tables: `polls`, `poll_options`, `poll_votes` (one row per fan per poll), view `poll_results`, RPC `cast_vote` (security definer: rejects closed polls, enforces the timer). Migration `0010_live_polls.sql`.


## Pre-event activities and invites

In the event editor (**/admin → Edit → Activities → + Add**) an activity is a **Tap-in** (staff scan at the venue),
**Social post** (fan pastes a link, the artist approves it in Review) or **Song request** (fan names a song, points
land on submit). Social posts and song requests can be marked **Pre-event**: fans can do them before the show,
they're highlighted with a Pre-event badge at the top of the show's Activities, and they lock at doors (the event
date plus its Doors time, Toronto time). There are no social activities by default; they exist only when an admin
adds one.

**Invites** (**/admin → event → People → Invites**): paste ticket buyers, one per line, to create single-use links
(`/join/<code>`). Opening one signs the fan in with their phone and enrolls them in the event before they have a
wristband. Claiming a band at the venue with the same phone keeps everything on one account. Unused links can be
copied or revoked. Song requests appear grouped with counts in the artist console's **Review** tab, and invited
fans count as the artist's fans. Migration `0012_pre_event_invites.sql`.

The fan inbox shows only the current event's drops, messages and alerts, matching how activity is scoped.
