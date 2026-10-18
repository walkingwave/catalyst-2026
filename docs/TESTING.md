# Testing

## Run

```bash
npm test            # Vitest unit tests (pure logic: phone, uid, staff PIN)
npm run test:e2e    # Playwright: API integration + browser e2e + axe a11y (needs dev server + live Supabase)
npm run test:all
npx playwright show-report   # after an e2e run
```

The e2e suite runs against `http://localhost:3000` (starts `npm run dev` if nothing is listening) and the live Supabase project. It creates its own artists, events, bands, rewards and posts with `E2E` prefixes and deletes them in `finally` blocks; the setup project also purges leftovers from aborted runs.

Fans sign in with Supabase test OTP numbers (code `123456`). Supabase allows one OTP per number per 60 seconds, so each UI login uses a different number and most fan tests reuse the saved test fan session (Taylor B.) (`tests/e2e/.auth/fan.json`, written by `auth.setup.ts`). Signing out revokes every session for that user, so the sign-out test uses its own number.

Viewport is iPhone 14 in Chromium (Web NFC paths show their fallbacks, like a real iPhone would).

## Coverage

Event alerts: `tests/unit/event-notifications.test.ts` checks validation (alerts always
send immediately), PIN guards, idempotent requests and delivery outcomes with SMS mocked.
The "Event alert controls" tests in `tests/e2e/admin.spec.ts` exercise both admin and
staff with mocked APIs (no messages are sent), including immediate send, event
switching and mobile overflow. "Admin people" covers listing, creating a demo user
with a random number, editing and deleting, also with mocked APIs.

`tests/event-notifications.sql` bootstraps minimal fixtures and applies migration
0009 in an **empty disposable PostgreSQL database**. Run it with
`psql -v ON_ERROR_STOP=1 -f tests/event-notifications.sql` using a local test database
connection. Never point this fixture script at live Supabase. It checks audience
deduplication and event isolation, late claims, no early sends, cancellation,
batch reservations, uncertain-delivery recovery and service-only grants.

| file | what |
|---|---|
| `tests/unit/*.test.ts` | `normalizePhone`, `normalizeUid`/`isValidUid`, `checkStaffPin` (timing-safe, fails closed) |
| `tests/e2e/api.spec.ts` | staff verify/catalog, `/api/scan` (auto-register, award, duplicate, cross-event 409, bad activity 404, bad PIN 401, bad UID 400), claim/social/profile auth guards, admin events (validation, create, live station, delete), admin bands (register, idempotent, move, lookup, archive/restore/unclaim/clear), admin rewards + artists, artist console (verify, overview shape, message/drop validation, social review guard), cron |
| `tests/e2e/public.spec.ts` | home, protected redirects with `next`, login validation + wrong code + change number, sign-out, theme persistence, no horizontal overflow |
| `tests/e2e/band.spec.ts` | unknown/garbage UID, unclaimed preview + full OTP claim, owner redirect, claimed-by-other states, live-station self-tap + dedupe + add-to-account |
| `tests/e2e/fan.spec.ts` | dashboard (points, fandoms, latest show, nav), shows → concert page + map pin (keyboard), leaderboard tabs/chips/you, profile save, social submit → pending, marketplace per-artist pools + can't-afford + redeem code + redemption list, own-band live tap banner, drop claim |
| `tests/e2e/staff.spec.ts` | PIN gate, manual tap overlay, duplicate, log |
| `tests/e2e/admin.spec.ts` | create event via UI (new team, activities, points total), tap tab + go live + counts, write (manual register) + bands lookup/move/archive/restore, viewport overflow regression |
| `tests/e2e/artist.spec.ts` | code gate, top fans with socials, select Top 5 + inbox blast, drop quick pick, social approve → fan pool/leaderboard |
| `tests/e2e/a11y.spec.ts` | axe WCAG 2.0 A/AA on every page; serious/critical fail the test, others are logged |

## Gaps found by the suite (all fixed)

- **Pinch zoom disabled** on every page (`maximumScale: 1`). WCAG 1.4.4. Removed.
- **Success green text failed AA contrast** on white (`#16a34a`, 3.3:1). Now `#15803d`; warning darkened too.
- **Venue map pins were invisible to assistive tech**: the SVG had `role="img"`, which hides children, and pins were plain `<g>`. Now `role="group"` with pins as `role="button"`, focusable, `aria-label`, Enter/Space activate.
- **Admin "Assign to event" row overflowed the phone viewport**: the select's intrinsic width pushed the Move button off-screen (x 369 + 73 wide on a 390 screen). `min-w-0` on the select, `shrink-0` on the button, regression assertion in the test.
- **Admin Events tab opened the create form by default** whenever the list was empty before loading. Opens only when there are truly no events.
- **Artist console said "Approved" even when the request failed**, and the approve request itself failed for freshly created artists because of a nested PostgREST embed. Plain lookups now; failures surface in the toast; re-reviewing a non-pending post returns 409.
- **Artist "Fans" count excluded attendees with no points yet**. Now counts everyone holding a claimed band at the artist's shows, ranked by points.
- **Concert page "earned / possible" ignored approved social posts**. Included now.
- **Manual UID entry was silently dropped** if the same UID was entered twice within 3s (the NFC chatter debounce). Manual entry bypasses the debounce.
- **Admin header counts didn't refresh after a tap**; "1 bands". Refresh after each successful tap, pluralized.
- **Toasts could sit over buttons** on short phones. `pointer-events-none` + `role="status"`.
- **Staff station locked itself on any catalog error**, not just a bad PIN. Only 401 clears the PIN now; other errors are logged.

## Open UX notes (not bugs, worth a look)

- `meta-viewport` moderate warning is gone; axe reports no remaining violations on any page.
- OTP cooldown (60s per number) is a real-world limit: a fan who mistypes the code and goes back to "change number" can't resend for a minute. Consider a visible countdown on the code screen.
- Marketplace "9,950 more points needed" is informative but long on small screens; consider "Need 9,950 more".
- Web NFC is Android Chrome only; iPhone staff/admin see the fallback copy. The live-station flow covers iPhone demos.

Some E2E tests send real drops, messages and poll notices to demo fans through the
artist API. Every test string starts with `E2E `, and `tests/e2e/cleanup.ts` deletes
those rows before the run (setup) and after it (`teardown` project), so they never
appear in demo inboxes or the artist Log. An aborted run is cleaned up by the next run.
