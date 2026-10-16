# PWA + Match Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live tournament app installable and send each subscribed player a push notification 20 minutes before every match they play or referee.

**Architecture:** A static web manifest, optimized icons and a minimal service worker make the site installable. A `/settings` page stores "who I am" on the device and registers a Web Push subscription in two new D1 tables. Every minute, the Worker's `scheduled` handler loads a small snapshot of the tournament with plain SQL. Pure, unit-tested code then decides which (device, player, match, role) reminders are due, and they're sent with VAPID through `@pushforge/builder`.

**Tech Stack:** Astro 7 SSR on Cloudflare Workers (existing), D1 (existing `DB` binding), Wrangler D1 migrations, `@pushforge/builder` 2.x, `sharp` (dev only, icons), Vitest with `node:sqlite` for SQL tests.

**Spec:** `docs/superpowers/specs/2026-10-16-pwa-notifications-design.md` (builds on `docs/superpowers/specs/2026-10-16-puntilla-tournament-app-design.md`)

## Global Constraints

- English only. Exact copy:
  - Player reminder title: `Your match in {N} min`
  - Referee reminder title: `You're refereeing in {N} min`
  - Rescheduled: `Rescheduled: your match in {N} min` / `Rescheduled: you're refereeing in {N} min`
  - Body: `{Sat|Sun} {HH:MM} · Court {n} · {team1} v {team2}` (team name, or its placeholder label)
  - Test push: title `Test notification`, body `La Puntilla notifications are working.`
- `{N}` = whole minutes until the start, rounded down, minimum 1.
- Reminder due when the match isn't finished, `now ≥ start − 20 min` and `now < start`.
- Start = `time_override` ?? `session.starts_at + (slot − 1) × slot_minutes`. Reuse `matchTime()` from `src/lib/schedule.ts`.
- Re-notify only if the start moved by **more than 5 minutes** from the `match_start` of the last reminder for the same (endpoint, player, match, role).
- If a player is both on a playing team and the referee team of the same match, send the player reminder only.
- Tap targets: player → `/{category}/{qualifiers|finals}#match-{id}` (`calendarPath()` from `src/lib/routes.ts`); referee → `/referee/{id}`.
- Times shown in `Atlantic/Canary` (`formatTime()`).
- Our tables are `push_subscriptions` and `push_sent`; never write to emdash tables (`ec_*`, `_emdash_*`) from this feature.
- The public site stays login-free; the new APIs are public.
- VAPID private key (JWK JSON) is a Worker **secret** `VAPID_PRIVATE_JWK`. `VAPID_PUBLIC_KEY` and `VAPID_SUBJECT` (`mailto:` address) are `vars`.

## Review Focus

1. **A subscription the push service rejects as gone (404/410)** must be deleted, not retried forever. Pinned in Task 4 (`runReminders` deletes on 410).
2. **A send that fails for any other reason** (500, network) must be retried on the next minute, not marked sent. Pinned in Task 4 (no `push_sent` row after a 500).
3. **Emdash data the job doesn't expect:** soft-deleted or draft matches, matches with no session, teams with no players. These must be ignored without crashing the job (which would also stop emdash's own scheduled work). Pinned in Task 3 (`loadSnapshot` ignores deleted/draft/sessionless rows).
4. **A malformed or hostile subscribe request** (missing keys, non-https endpoint, unknown player) must get a 400 and store nothing. Pinned in Task 5 (`parseSubscribeBody` tests).
5. **iPhone in Safari, not installed** must see the "Add to Home Screen" guidance, not a toggle that fails silently. Pinned in Task 6 (`pushSupport` returns `"ios-needs-install"`).

## File Structure

```
public/manifest.webmanifest                    web app manifest
public/icons/icon-192.png, icon-512.png,
       apple-touch-icon.png, favicon-32.png    generated, optimized (committed)
public/sw.js                                   service worker: push + notificationclick
scripts/build-icons.mjs                        one-off icon generator (sharp)
migrations/0001_push.sql                       push_subscriptions + push_sent
src/lib/reminders.ts                           pure: snapshot types, due reminders, copy, resend decision, player matches
src/lib/push-db.ts                             SqlDb interface, D1 adapter, snapshot loader, subscription + sent-log queries
src/lib/push-send.ts                           VAPID send via @pushforge/builder
src/lib/reminder-job.ts                        runReminders(): snapshot → due → send → record
src/lib/push-api.ts                            pure request validation (parseSubscribeBody, …)
src/lib/push-client.ts                         browser helpers: pushSupport(), subscribe/unsubscribe
src/worker.ts                                  + our scheduled job alongside emdash's
src/pages/api/players/index.ts                 GET players
src/pages/api/players/[id]/matches.ts          GET a player's upcoming matches
src/pages/api/push/subscribe.ts, unsubscribe.ts, test.ts
src/pages/settings.astro + src/scripts/settings.ts   gear page
src/components/CategoryNav.astro, src/pages/index.astro  + gear icon
src/layouts/Base.astro                         + manifest/icons/meta, SW registration
tests/reminders.test.ts, tests/push-db.test.ts, tests/reminder-job.test.ts,
tests/push-api.test.ts, tests/push-client.test.ts, tests/pwa-assets.test.ts
tests/sqlite.ts                                node:sqlite SqlDb adapter + emdash fixture schema (test-only)
```

---

### Task 1: Installable app (icons, manifest, service worker)

**Files:**
- Create: `scripts/build-icons.mjs`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`, `public/icons/favicon-32.png`, `public/manifest.webmanifest`, `public/sw.js`, `tests/pwa-assets.test.ts`
- Modify: `src/layouts/Base.astro` (head tags + SW registration), `package.json` (`sharp` devDependency, `"icons:build"` script). The original 1.3 MB PNG stays as the source and is never referenced by the manifest or pages.

**Interfaces:**
- Produces: `/sw.js` handles `push` events whose payload JSON is `{ title: string; body: string; url: string; tag?: string }`, and opens/focuses `url` on click. Later tasks send exactly that payload.

- [ ] **Step 1: Write `tests/pwa-assets.test.ts` (failing).** Read the PNG header bytes (width at offset 16, height at 20) and the manifest JSON:
  ```ts
  const size = (f: string) => { const b = readFileSync(`public/icons/${f}`); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  test("icons have the standard sizes and are optimized", () => {
    expect(size("icon-192.png")).toEqual([192, 192]);
    expect(size("icon-512.png")).toEqual([512, 512]);
    expect(size("apple-touch-icon.png")).toEqual([180, 180]);
    expect(size("favicon-32.png")).toEqual([32, 32]);
    for (const f of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) expect(statSync(`public/icons/${f}`).size).toBeLessThan(60_000);
  });
  test("manifest", () => {
    const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(m).toMatchObject({ name: "La Puntilla Beach Volley", short_name: "La Puntilla", start_url: "/", display: "standalone", background_color: "#f7f3ec" });
    expect(m.icons.map((i: any) => [i.src, i.sizes, i.purpose])).toEqual([
      ["/icons/icon-192.png", "192x192", "any maskable"], ["/icons/icon-512.png", "512x512", "any maskable"]]);
  });
  test("service worker handles push and notificationclick", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
  });
  ```
- [ ] **Step 2: Run `npx vitest run tests/pwa-assets.test.ts`.** Expected: FAIL (files missing).
- [ ] **Step 3: Generate the icons.** `npm i -D sharp`. `scripts/build-icons.mjs` reads `public/icons/la-puntilla-app-icon.png` and writes the four sizes with `sharp(...).resize(n, n).png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })`. Add the script `"icons:build": "node scripts/build-icons.mjs"` and run it.
- [ ] **Step 4: Write the manifest and the service worker.**
  - **Manifest** as tested, with `theme_color` = the icon's navy sampled with sharp (spec suggests `#0b2457`).
  - **`sw.js`:**
    - `push`: parse the JSON payload and call `showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag, data: { url } })`.
    - `notificationclick`: close the notification, focus an existing same-origin client and navigate it to `data.url`, otherwise `clients.openWindow(url)`.
    - No fetch handler and no caching.
- [ ] **Step 5: Wire up `Base.astro`.**
  - **Head tags:** `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="icon" href="/icons/favicon-32.png">`, `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-title" content="La Puntilla">`, `<meta name="apple-mobile-web-app-status-bar-style" content="default">`, and `theme-color` = the manifest's.
  - **Service worker registration:** an `is:inline` script, `if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js")`.
- [ ] **Step 6: Run `npm test` and `npx astro check`.** Expected: all PASS, 0 errors. Then `npm run dev`; in Chrome DevTools → Application, the manifest shows with no errors and the service worker is "activated".
- [ ] **Step 7: Commit.** `feat: installable PWA (manifest, icons, service worker)`

---

### Task 2: Reminder logic (pure)

**Files:**
- Create: `src/lib/reminders.ts`, `tests/reminders.test.ts`

**Interfaces:**
- Consumes: `matchTime`, `formatTime` (`src/lib/schedule.ts`); `calendarPath` (`src/lib/routes.ts`); `Category`, `Day`, `Phase` (`src/lib/types.ts`).
- Produces:
  ```ts
  export type SnapshotTeam = { id: string; seed: string; name: string; playerIds: string[] };
  export type SnapshotMatch = {
    id: string; category: Category; day: Day; slot: number; court: 1 | 2; timeOverride: Date | null;
    finished: boolean; sessionStart: Date; slotMinutes: number;
    team1Id: string | null; team2Id: string | null; refereeId: string | null;
    team1Label: string; team2Label: string;
  };
  export type Snapshot = { matches: SnapshotMatch[]; teams: Map<string, SnapshotTeam> };
  export type Role = "player" | "referee";
  export type Reminder = { matchId: string; playerId: string; role: Role; start: Date };
  export type PushPayload = { title: string; body: string; url: string; tag: string };
  export const REMINDER_LEAD_MINUTES = 20;
  export const RESCHEDULE_THRESHOLD_MINUTES = 5;
  export function matchStart(m: SnapshotMatch): Date;
  export function dueReminders(s: Snapshot, now: Date): Reminder[];      // one per (match, player); player role wins over referee
  export function resendDecision(lastMatchStart: Date | null, start: Date): "send" | "rescheduled" | "skip";
  export function reminderPayload(s: Snapshot, r: Reminder, now: Date, rescheduled: boolean): PushPayload;
  export type PlayerMatch = { matchId: string; role: Role; start: Date; category: Category; court: 1 | 2; label: string };
  export function playerMatches(s: Snapshot, playerId: string, now: Date): PlayerMatch[]; // not finished, start > now, sorted by start; label = "Dani/Mat v Emilio/Ilde"
  ```
  - `PushPayload.tag` = `` `${matchId}:${role}` `` (a rescheduled reminder replaces the earlier notification on the device).

- [ ] **Step 1: Write `tests/reminders.test.ts` (failing).** Build a fixture snapshot: Men's Saturday session at `2026-10-17T11:30:00Z`, 20-min slots. Match `m1`, slot 1, court 1: team `tA1` (players `p-dani`, `p-mat`, name `Dani/Mat`) v `tA2` (`p-emilio`, `p-ilde`, `Emilio/Ilde`), referee `tB3` (`p-marci`, `p-giando`). Cases:
  - `dueReminders(s, 11:09:59Z)` → `[]`; at `11:10:00Z` → 6 reminders: 4 `player`, 2 `referee`, all with `start` 11:30Z.
  - at `11:30:00Z` → `[]` (already started); `finished: true` → `[]` at 11:15Z.
  - override `11:50Z` → nothing at 11:10Z, 6 at 11:30Z.
  - late assignment: `team2Id: null` at 11:10Z → only `p-dani`/`p-mat` (player) and referees; same at 11:25Z once `team2Id` is set → includes `p-emilio`.
  - a player on team1 and the referee team → one reminder, role `player`.
  - `resendDecision(null, t)` → `"send"`; same start → `"skip"`; moved +5 min → `"skip"`; moved +6 min → `"rescheduled"`; moved −10 min → `"rescheduled"`.
  - `reminderPayload` for Dani as player at 11:10Z → `{ title: "Your match in 20 min", body: "Sat 12:30 · Court 1 · Dani/Mat v Emilio/Ilde", url: "/mens/qualifiers#match-m1", tag: "m1:player" }`. For Marci as referee at 11:25:30Z → `title: "You're refereeing in 4 min"`, `url: "/referee/m1"`. At 11:29:50Z → `"in 1 min"`. Rescheduled → `"Rescheduled: your match in 20 min"`. Placeholder team2 → body uses `team2Label`.
  - `playerMatches(s, "p-marci", 11:00Z)` → `[{ matchId: "m1", role: "referee", label: "Dani/Mat v Emilio/Ilde", … }]`; a finished match or an unknown player → `[]`.
- [ ] **Step 2: Run `npx vitest run tests/reminders.test.ts`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `src/lib/reminders.ts`.** `matchStart` delegates to `matchTime({ startsAt: sessionStart, slotMinutes }, slot, timeOverride)`. The day label is `Sat`/`Sun` from `day`.
- [ ] **Step 4: Run the tests.** Expected: PASS, and `npm test` is all green.
- [ ] **Step 5: Commit.** `feat: reminder scheduling logic`

---

### Task 3: Push tables and data access

**Files:**
- Create: `migrations/0001_push.sql`, `src/lib/push-db.ts`, `tests/sqlite.ts`, `tests/push-db.test.ts`
- Modify: `wrangler.jsonc` (`"migrations_dir": "migrations"` on the `DB` binding)

**Interfaces:**
- Consumes: `Snapshot`, `SnapshotMatch`, `SnapshotTeam`, `Role` (Task 2).
- Produces:
  ```ts
  export interface SqlDb { all<T>(sql: string, ...params: unknown[]): Promise<T[]>; run(sql: string, ...params: unknown[]): Promise<void>; }
  export function d1(db: D1Database): SqlDb;
  export type StoredSubscription = { endpoint: string; p256dh: string; auth: string; playerId: string };
  export async function loadSnapshot(db: SqlDb): Promise<Snapshot>;
  export async function loadPlayers(db: SqlDb): Promise<{ id: string; name: string }[]>;        // sorted by name
  export async function playerExists(db: SqlDb, id: string): Promise<boolean>;
  export async function upsertSubscription(db: SqlDb, s: StoredSubscription, now: Date): Promise<void>;
  export async function deleteSubscription(db: SqlDb, endpoint: string): Promise<void>;          // also deletes its push_sent rows
  export async function getSubscription(db: SqlDb, endpoint: string): Promise<StoredSubscription | null>;
  export async function subscriptionsForPlayers(db: SqlDb, playerIds: string[]): Promise<StoredSubscription[]>;
  export async function lastSentStart(db: SqlDb, endpoint: string, playerId: string, matchId: string, role: Role): Promise<Date | null>; // latest by sent_at
  export async function recordSent(db: SqlDb, endpoint: string, playerId: string, matchId: string, role: Role, matchStart: Date, now: Date): Promise<void>;
  ```
- Migration SQL: exactly the two tables in spec §5.1 (`push_sent` primary key `(endpoint, player_id, match_id, role, match_start)`), plus `CREATE INDEX push_subscriptions_player ON push_subscriptions(player_id)`.
- `loadSnapshot` SQL:
  - **Rows read:** `published`, `deleted_at IS NULL` rows of `ec_matches`, `ec_sessions` and `ec_teams`.
  - **Joins:** match → session on `(category, day)`; links from `_emdash_content_references` joined to `_emdash_relations` on `relation_id`, with slugs `matches_team1`, `matches_team2`, `matches_referee`, `teams_players`. `parent_group` is the parent entry id and `child_group` the child entry id.
  - **Skipped:** matches without a session.
  - **Shape:** `finished` = `match_state = 'finished'`; `time_override` is an ISO string or NULL.

- [ ] **Step 1: Write `tests/sqlite.ts`.** It has two parts:
  - **`sqliteDb(): SqlDb`**, backed by `node:sqlite` `DatabaseSync(":memory:")`.
  - **`seedEmdashFixture(db)`**, which creates the minimal emdash tables with only the columns the loader reads:
    - `ec_matches`: `id, status, deleted_at, category, day, slot, court, time_override, match_state, team1_label, team2_label`
    - `ec_sessions`: `id, status, deleted_at, category, day, starts_at, slot_minutes`
    - `ec_teams`: `id, status, deleted_at, seed, name`
    - `ec_players`: `id, status, deleted_at, name`
    - `_emdash_relations`: `id, slug`
    - `_emdash_content_references`: `id, relation_id, parent_group, child_group, sort_order`
  - **Fixture rows:**
    - the Task 2 fixture match `m1`;
    - a soft-deleted match `m-del`;
    - a draft match `m-draft`;
    - a match `m-nosession` with category `mixed` and no mixed session;
    - a team `t-empty` with no players.
  - **Migration:** it then applies `migrations/0001_push.sql`.
- [ ] **Step 2: Write `tests/push-db.test.ts` (failing).**
  - `loadSnapshot` returns only `m1`, with `team1Id: "tA1"`, `refereeId: "tB3"` and `sessionStart` = `2026-10-17T11:30:00.000Z`. Team `tA1` has `playerIds` `["p-dani", "p-mat"]` (sort order), and `t-empty` has `[]`.
  - `loadPlayers` is sorted by name.
  - `upsertSubscription` twice with the same endpoint and a new player → one row with the new player.
  - `subscriptionsForPlayers(["p-dani"])` returns it.
  - `recordSent` then `lastSentStart` → that date. Recording again with a later start → the later one.
  - `deleteSubscription` removes the row and its `push_sent` rows.
- [ ] **Step 3: Run `npx vitest run tests/push-db.test.ts`.** Expected: FAIL.
- [ ] **Step 4: Implement `src/lib/push-db.ts` and the migration.** The `d1()` adapter uses `db.prepare(sql).bind(...params).all()` / `.run()`. Add `"migrations_dir": "migrations"` to the D1 binding in `wrangler.jsonc`.
- [ ] **Step 5: Run the tests,** then `npx wrangler d1 migrations apply puntilla --local`. Expected: PASS, and "0001_push.sql ✅".
- [ ] **Step 6: Commit.** `feat: push subscription storage and tournament snapshot loader`

---

### Task 4: Sending and the scheduled job

**Files:**
- Create: `src/lib/push-send.ts`, `src/lib/reminder-job.ts`, `tests/reminder-job.test.ts`
- Modify: `src/worker.ts`, `package.json` (`@pushforge/builder` dependency)

**Interfaces:**
- Consumes: Task 2 (`dueReminders`, `resendDecision`, `reminderPayload`, `PushPayload`); Task 3 (everything).
- Produces:
  ```ts
  // push-send.ts
  export type Vapid = { privateJWK: JsonWebKey; subject: string };
  export type SendPush = (sub: StoredSubscription, payload: PushPayload) => Promise<number>; // HTTP status from the push service
  export function webPushSender(vapid: Vapid): SendPush;   // buildPushHTTPRequest + fetch, ttl 1200 s, urgency "high"
  // reminder-job.ts
  export async function runReminders(db: SqlDb, now: Date, send: SendPush): Promise<{ sent: number; removed: number; failed: number }>;
  ```
- `runReminders` rules:
  - **Success** (201/200/202) → `recordSent`.
  - **404 or 410** → `deleteSubscription`.
  - **Anything else, or a thrown error** → count as failed, no record.
  - **Snapshot failure** → log and return zeros.
  - It never throws.
- `src/worker.ts`: keep emdash's handler and add ours:
  ```ts
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runReminders(d1(env.DB), new Date(controller.scheduledTime),
      webPushSender({ privateJWK: JSON.parse(env.VAPID_PRIVATE_JWK), subject: env.VAPID_SUBJECT })).catch(console.error));
    return emdashScheduled(controller, env, ctx);
  }
  ```
  If `VAPID_PRIVATE_JWK` is missing, log once and skip our job, so local dev without secrets still runs emdash's work.

- [ ] **Step 1: Write `tests/reminder-job.test.ts` (failing).** Use `sqliteDb()` + `seedEmdashFixture()` + a fake `SendPush` that records calls and returns a scripted status per endpoint. Subscribe two devices: `e-dani` (p-dani) and `e-marci` (p-marci).
  - **11:10Z:** `{ sent: 2 }`. Dani gets the player payload, Marci the referee payload.
  - **11:11Z:** `{ sent: 0 }` (de-duplicated).
  - **Override moved to 11:50Z, run at 11:30Z:** 2 sends, titles starting `Rescheduled:`.
  - **Override 11:33Z, run at 11:13Z:** 0 sends (a 3-minute move doesn't re-notify).
  - **`e-dani` answers 410:** subscription deleted, `removed: 1`, and the next run doesn't call it.
  - **`e-marci` answers 500:** `failed: 1`, no `push_sent` row, and the next run retries it.
  - **Snapshot query throws** (drop `ec_matches`): returns `{ sent: 0, removed: 0, failed: 0 }` and doesn't throw.
- [ ] **Step 2: Run `npx vitest run tests/reminder-job.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.** `npm i @pushforge/builder`. Write `push-send.ts`, `reminder-job.ts` and the `src/worker.ts` change. Add `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` (`vars`) and `VAPID_PRIVATE_JWK` to the Env typing used by `worker.ts`.
- [ ] **Step 4: Run `npm test` and `npx astro check`.** Expected: all PASS, 0 errors.
- [ ] **Step 5: Commit.** `feat: send match reminders from the scheduled handler`

---

### Task 5: Public API

**Files:**
- Create: `src/lib/push-api.ts`, `tests/push-api.test.ts`, `src/pages/api/players/index.ts`, `src/pages/api/players/[id]/matches.ts`, `src/pages/api/push/subscribe.ts`, `src/pages/api/push/unsubscribe.ts`, `src/pages/api/push/test.ts`

**Interfaces:**
- Consumes: Tasks 2–4. Bindings in routes via `import { env } from "cloudflare:workers"` (`env.DB`, `env.VAPID_*`).
- Produces:
  ```ts
  export function parseSubscribeBody(body: unknown): { endpoint: string; p256dh: string; auth: string; playerId: string } | null;
  export function parseEndpointBody(body: unknown): string | null;
  ```
  - `parseSubscribeBody` accepts `{ subscription: { endpoint, keys: { p256dh, auth } }, playerId }`. The endpoint must be an `https:` URL of 2048 characters or fewer; keys and playerId must be non-empty strings of 512 characters or fewer.
- Routes (all `prerender = false`, JSON, `Cache-Control: no-store`):
  - `GET /api/players` → `loadPlayers`.
  - `GET /api/players/:id/matches` → `playerMatches(loadSnapshot(), id, new Date())` with start as ISO; 404 for an unknown player.
  - `POST /api/push/subscribe` → 400 on a bad body or unknown player, else `upsertSubscription` → 200 `{ ok: true }`.
  - `POST /api/push/unsubscribe` → 400 on a bad body, else `deleteSubscription` → 200, even if the endpoint is unknown.
  - `POST /api/push/test` → 404 if the subscription is unknown, else send `{ title: "Test notification", body: "La Puntilla notifications are working.", url: "/settings", tag: "test" }` → 200 `{ ok: true }` on a 2xx from the push service, 502 `{ error }` otherwise (deleting the subscription on 404/410).

- [ ] **Step 1: Write `tests/push-api.test.ts` (failing).**
  - A valid body parses.
  - Each of these returns `null`: missing `keys`, an `http:` endpoint, a non-URL endpoint, an empty `playerId`, an endpoint longer than 2048 characters, `null`, and a string body.
  - `parseEndpointBody({ endpoint: "https://x" })` → `"https://x"`, and `{}` → `null`.
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement `push-api.ts` and the five routes.**
- [ ] **Step 4: Verify.**
  - `npm test` and `npx astro check` → PASS, 0 errors.
  - With `npm run dev` and the local D1 migrated, using curl:
    - `GET /api/players` → 48 players.
    - `GET /api/players/p-dani/matches` → Men's and Mixed matches.
    - Subscribe with a fake https endpoint for `p-nope` → 400; for `p-dani` → 200, and the row is in local D1 (`wrangler d1 execute puntilla --local`).
    - `POST /api/push/test` for an unknown endpoint → 404.
    - Unsubscribe → 200, and the row is gone.
- [ ] **Step 5: Commit.** `feat: player and push subscription API`

---

### Task 6: Settings page and gear icon

**Files:**
- Create: `src/pages/settings.astro`, `src/scripts/settings.ts`, `src/lib/push-client.ts`, `tests/push-client.test.ts`
- Modify: `src/components/CategoryNav.astro`, `src/pages/index.astro` (gear icon linking to `/settings`)

**Interfaces:**
- Consumes: Task 5 routes; `VAPID_PUBLIC_KEY` (server-rendered into a `data-vapid` attribute on the settings page).
- Produces:
  ```ts
  export type PushSupport = "supported" | "unsupported" | "ios-needs-install" | "denied";
  export function pushSupport(env: { userAgent: string; standalone: boolean; hasPushManager: boolean; hasServiceWorker: boolean; permission: string }): PushSupport;
  export function urlBase64ToUint8Array(base64: string): Uint8Array;
  ```
  - `localStorage` key `puntilla:player` holds `{ id, name }`; `puntilla:push` = `"on"` when subscribed.

Page behaviour:
1. **Who are you?** A search input filtering the list from `/api/players`. Tapping a name stores it and highlights it; a "Clear" link removes it (and unsubscribes if on).
2. **Notifications.** What shows depends on `pushSupport`:
   - `supported`: a toggle, disabled until a player is chosen.
     - **On:** request permission, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, then POST subscribe.
     - **Off:** `subscription.unsubscribe()`, then POST unsubscribe.
     - **Changing player while on:** POST subscribe again with the new `playerId`.
     - Once on, a **"Send me a test notification"** button POSTs to `/api/push/test`.
   - `ios-needs-install`: "To get notifications on iPhone, tap Share → Add to Home Screen, then open La Puntilla from your home screen."
   - `unsupported`: "This browser can't receive notifications."
   - `denied`: "Notifications are blocked for this site in your browser settings."
3. **Your matches.** From `/api/players/:id/matches`: time (Canary), day, court, round label or teams, "Playing" or "Refereeing".
- **Gear icon:** an inline SVG link (`aria-label="Settings"`) at the right of the header bar on calendar pages, and at the top right of the home page. When a player is chosen, a small "You: {name}" hint sits next to it (rendered client-side from `localStorage`; builder's call on placement).
- Client DOM code avoids HTML-specific type casts: `@cloudflare/workers-types` redefines DOM types like `Element`, so `querySelector<HTMLSelectElement>` and `as HTMLSelectElement` fail `astro check`. Follow `CategoryNav.astro` (an `is:inline` script) or `src/scripts/referee.ts` (no HTML-specific casts).

- [ ] **Step 1: Write `tests/push-client.test.ts` (failing).**
  - `pushSupport` cases:
    - iPhone Safari UA with `standalone: false` → `"ios-needs-install"`
    - iPhone UA with `standalone: true` and push available → `"supported"`
    - Android Chrome → `"supported"`
    - permission `"denied"` → `"denied"`
    - no PushManager on a non-iOS browser → `"unsupported"`
  - `urlBase64ToUint8Array("AQID")` → `Uint8Array [1, 2, 3]`, including URL-safe characters (`-`, `_`).
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement** `push-client.ts`, `settings.astro`, `settings.ts` and the gear icons.
- [ ] **Step 4: Verify.** Run `npm test` and `npx astro check` (PASS, 0 errors). Then use playwright-core against local dev, with a Chrome context granted `notifications` permission:
  - **Pages at 360 px:** the gear shows on the home and calendar pages, and `/settings` has no horizontal overflow.
  - **Choosing a player:** search "dan" → tap Dani → "Your matches" lists the Men's and Mixed matches, and the hint shows "You: Dani".
  - **Toggle on:** `push_subscriptions` has one row for `p-dani` in local D1. (Real delivery is checked on phones in Task 7.)
  - **Player change:** switching to another player → same row, updated `player_id`.
  - **Toggle off:** the row is gone.
- [ ] **Step 5: Commit.** `feat: settings page with player picker and notifications`

---

### Task 7: Production rollout

Needs the user for real-phone checks. Wrangler is already logged in on account `6f58a6845b0fc07a79e61cdad8c1efca`.

- [ ] **Step 1: VAPID keys.**
  - Run `npx @pushforge/builder vapid`.
  - Put the public key and `VAPID_SUBJECT` (ask the user for the `mailto:` address) in `wrangler.jsonc` `vars`.
  - Store the private JWK with `npx wrangler secret put VAPID_PRIVATE_JWK`, never committed. For local dev, put it in `.dev.vars` (git-ignored).
- [ ] **Step 2: Migrate production D1.** Run `npx wrangler d1 migrations apply puntilla --remote`. Expected: `0001_push.sql` applied; `wrangler d1 execute puntilla --remote --command "select count(*) from push_subscriptions"` → 0.
- [ ] **Step 3: Deploy.** Run `npm run build && npx wrangler deploy`. Then smoke-test:
  - `/manifest.webmanifest` 200, `/sw.js` 200, `/settings` 200;
  - `/api/players` returns 48;
  - the six calendar pages still return 200.
- [ ] **Step 4: Check on real phones (the user):**
  - **Android Chrome:** install, pick a player, toggle on, "Send me a test notification" → it arrives, and tapping it opens `/settings`.
  - **iPhone:** the settings page in Safari shows the install guidance; after adding to the home screen, the same flow works from the installed app.
  - **Logs:** run `wrangler tail` during a cron minute and confirm there are no exceptions from `runReminders`.
- [ ] **Step 5: Commit any config changes** (`chore: VAPID public config`). Then PR and merge.
