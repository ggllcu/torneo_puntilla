# La Puntilla — PWA install + match reminders — Design

Status: approved · 2026-10-16
Builds on: `docs/superpowers/specs/2026-10-16-puntilla-tournament-app-design.md` (the live app).

## 1. Intent

Players want to know when they're due on court without watching the calendar. The app becomes
installable on phones and sends a push notification **20 minutes before every match in which
the player plays or referees**. Players identify themselves by picking their name, with no login.

Not needed for the first day of play (Sat 17 Oct); it ships when ready (no deadline). Deploying it mid-tournament is safe: the D1 migration only adds tables, and Worker deploys are atomic.

- **Goals:** install to home screen (Android + iOS); a gear/settings screen to pick "who I am" and
  turn notifications on/off; reminders 20 min before each of that player's matches, as player and
  as referee, in every category the player is in.
- **Non-goals (for now):** other notification triggers (bracket placement, referee changes,
  results), offline browsing of the calendar, verifying that the person really is that player,
  more than one player per phone, notification preferences per type, i18n.
- **Anti-goals:** duplicate notifications; reminders for matches that already started; any
  login or account for players; a third-party push service account (OneSignal) unless the
  Cloudflare-native path proves unworkable.

## 2. Decided

- **Cloudflare-native**: Web Push with VAPID from the Worker, the existing every-minute Cron
  Trigger, storage in the existing D1 database. Account is on Workers Paid.
- One player per device; picking another player replaces the previous choice.
- A device is notified for matches where **team1, team2 or the referee team** contains its player.
- Reminder moment: **displayed match time − 20 min** (displayed time = `time_override` ??
  `session.starts_at + (slot − 1) × slot_minutes`, same rule as the calendar).
- If a match only becomes relevant to the player after that moment (team or referee assigned
  late), the reminder is sent at the next cron run, **as long as the match hasn't started**.
- Each (device, player, match, role) is notified **once per start time**. If the match's displayed
  start time later moves by **more than 5 minutes** from the time the last reminder was for, a new
  reminder is sent 20 min before the new time, titled "Rescheduled: your match in 20 min" /
  "Rescheduled: you're refereeing in 20 min". Moves of 5 minutes or less don't re-notify.
- Switching a device to another player doesn't suppress reminders for the new player (the sent log
  is keyed by player too).
- Wording (English):
  - player — title "Your match in 20 min"
  - referee — title "You're refereeing in 20 min"
  - body for both — `Sat 12:30 · Court 1 · Dani/Mat v Emilio/Ilde` (late sends still say "in N min"
    with the real number of minutes left, rounded down, minimum 1)
  - tap: player → calendar at the match (`/{category}/{tab}#match-{id}`); referee → `/referee/{id}`
- A player who both plays and referees the same match can't happen in this tournament's schedule;
  if it ever does, send the player reminder only.
- Icon: `public/icons/la-puntilla-app-icon.png` (1254², opaque navy background) resized to
  the standard sizes and losslessly optimized.

## 3. Install (PWA)

- `manifest.webmanifest`: name "La Puntilla Beach Volley", short_name "La Puntilla",
  `start_url: "/"`, `display: "standalone"`, theme colour navy (`#0b2457`, sampled from the icon;
  builder may adjust), background `#f7f3ec` (the app's `--bg`), icons 192 and 512 (both
  `purpose: "any maskable"`, the icon is full-bleed).
- `apple-touch-icon` 180², favicon 32², `<meta name="apple-mobile-web-app-capable">` and
  status-bar style, linked from `Base.astro`.
- Optimized PNGs generated once and committed (target: each ≤ ~60 KB). The 1.3 MB original stays
  out of the served assets.
- Service worker `/sw.js`, registered on every page. It only needs to: receive `push` and show the
  notification; handle `notificationclick` (focus an open app window or open the target URL).
  No offline caching (non-goal).

## 4. Settings screen (the gear)

- A gear icon in the header of every page (calendar header and home) → `/settings`.
- **Who are you?** A searchable list of all players (by name), current choice highlighted.
  Choice stored on the device (`localStorage`) and shown in the header area as a small
  "You: Dani" hint (builder's call on exact placement).
- **Notifications** toggle (disabled until a player is chosen):
  - On: request permission → `PushManager.subscribe` with the VAPID public key → `POST` the
    subscription + player id to the server.
  - Off, or player cleared: unsubscribe in the browser and `DELETE` on the server.
  - Changing player while on: re-register the same subscription with the new player.
- **Your matches**: the chosen player's upcoming matches (time, court, round, "Playing"/"Refereeing"),
  so they can confirm the choice is right.
- **Platform guidance**, shown when relevant:
  - iOS Safari not installed (`navigator.standalone` false): explain Share → Add to Home Screen,
    and that notifications only work from the installed app; toggle hidden.
  - Push unsupported or permission denied: say so plainly.

## 5. Server

### 5.1 Storage (D1, our own tables — not emdash collections)

```
push_subscriptions(
  endpoint TEXT PRIMARY KEY,      -- from the browser subscription; one row per device
  p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  player_id TEXT NOT NULL,        -- emdash player entry id (e.g. p-dani)
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)
push_sent(
  endpoint TEXT NOT NULL, player_id TEXT NOT NULL,
  match_id TEXT NOT NULL, role TEXT NOT NULL,  -- 'player' | 'referee'
  match_start TEXT NOT NULL,                    -- the displayed start time this reminder was for (ISO)
  sent_at TEXT NOT NULL,
  PRIMARY KEY (endpoint, player_id, match_id, role, match_start)
)
```

Created with Wrangler D1 migrations (`migrations/` dir, `wrangler d1 migrations apply`), which
keep their own `d1_migrations` table and don't touch emdash's. Table names must not collide with
emdash's (`ec_*`, `_emdash_*`).

### 5.2 API (public, no auth — consistent with the rest of the app)

- `GET /api/players` → `[{ id, name }]` sorted by name (for the picker).
- `GET /api/players/:id/matches` → that player's upcoming matches with role (for "Your matches").
- `POST /api/push/subscribe` `{ subscription, playerId }` → upsert by endpoint. 400 on malformed
  subscription or unknown player.
- `POST /api/push/unsubscribe` `{ endpoint }` → delete (idempotent).
- `POST /api/push/test` `{ endpoint }` → sends "Test notification · La Puntilla" to that subscription
  only (404 if unknown). Backs a **"Send me a test notification"** button on the settings screen, used
  by players to check their setup and for production end-to-end testing without touching real matches.
- VAPID public key exposed to the page (e.g. `PUBLIC_VAPID_KEY` at build time or an endpoint).

### 5.3 Reminder job (every minute, in the Worker's `scheduled` handler)

- Runs alongside emdash's own scheduled handler in `src/worker.ts` (both must run; ours in
  `ctx.waitUntil`, failures logged, never thrown into emdash's).
- Reads emdash data with **plain SQL on `env.DB`** (the emdash query API needs a request
  context): `ec_matches`, `ec_sessions`, `ec_teams`, `ec_players`, and the links in
  `_emdash_content_references` joined to `_emdash_relations` by slug (`matches_team1`,
  `matches_team2`, `matches_referee`, `teams_players`). Only `status='published'` and
  `deleted_at IS NULL`. Link endpoints are emdash translation-group ids (equal to the entry ids
  for this site).
- Due = match not finished, `now ≥ start − 20 min` and `now < start`.
- For each due match × role × player on the relevant teams × subscription of that player: look up the
  latest `push_sent` row for (endpoint, player, match, role). None → send. One whose `match_start`
  differs from the current start by > 5 min → send the "Rescheduled" variant. Otherwise skip. On
  success insert `push_sent` with the current start.
- Push service response 404/410 → delete that subscription. Other errors → log, retry next minute
  (no `push_sent` row). Keep the job well under the cron's CPU budget (a run handles at most the
  few matches in a 20-minute window).
- VAPID private key and subject (`mailto:`) as Worker **secrets**; public key as a var.

## 6. Testing expectations

- Pure logic unit-tested: which matches are due at a given instant (normal, override, late
  assignment, already started, finished), which (player, role) pairs a match yields, notification
  text and target URL, the send/skip/rescheduled decision (none, same start, start moved ≤ 5 min,
  start moved > 5 min, different player on the same device).
- Reminder job tested against a local D1 (Miniflare) seeded with the tournament seed.
- Manual end-to-end on a real Android phone and a real iPhone (installed) against production via the
  "Send me a test notification" button. The 20-minute timing is covered by the unit tests and the
  local D1 job test, not by moving real matches.

## 7. Left to the builder

Visual design of the gear and settings page (consistent with the current minimal style), the exact
Web Push library (`@pushforge/builder` is the candidate: zero-dependency, Web Crypto, Workers
support), icon optimization tooling, module/file layout, VAPID key generation procedure.
