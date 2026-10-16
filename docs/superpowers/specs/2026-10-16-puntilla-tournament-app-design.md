# La Puntilla Beach Volleyball Tournament — App Design

Status: approved · 2026-10-16

## 1. Intent

A small public web app to follow and score the first amateur beach volleyball
tournament at Playa de La Puntilla (Gran Canaria), **Sat 17 – Sun 18 October 2026**.
Players check the calendar on their phones to know when they play and when they
must referee; the referee of each match keeps the score on their phone and
submits the final result, which immediately shows up on the calendar.

It's a friendly, low-cost, quick project: simple and working beats complete.

- **Goals:** a calendar per category showing times, courts, teams, referees and
  final scores; a minimal referee scoring screen; a CMS where one admin manages
  all data and fixes anything by hand.
- **Non-goals (for now):** automatic advancement of teams into later rounds,
  walkover / referee-penalty handling in the app (done by hand in the CMS),
  timeouts or side-switch helpers, live point-by-point scores on the calendar,
  concurrency protection, translations (English only), visual design polish.
- **Anti-goals:** making players log in; anything that makes the referee screen
  harder to use with one thumb on a sunny beach.

## 2. Stack (decided)

- **Astro** in SSR mode (no static pre-rendering of tournament pages), deployed
  on **Cloudflare Workers**.
- **emdash CMS** as the content/admin layer, using Cloudflare **D1** (database)
  and **R2** (media, if any). Remote Cloudflare resources may be used during
  development.
- Public site: **no authentication**. CMS admin: authenticated, **one admin user**.
- Design system / components / CSS: builder's choice — modern and clean, mobile-first.

## 3. Tournament rules (source: organizers' messages)

Source of truth for teams, names and schedule is the **organizers' schedule
screenshots** (they supersede the names in the first text message and the
times on the poster).

### 3.1 Categories and format

| Category | Teams | Groups | Saturday qualifiers start | Sunday final phase start* |
|---|---|---|---|---|
| Women's | 9 | A–C (3 teams each) | 09:00 | 13:30 |
| Men's | 12 | A–D (3 teams each) | 12:30 | 16:30 |
| Mixed | 12 | A–D (3 teams each) | 16:00 | 09:30 |

\* Sunday times from the organizers' message (they supersede the poster). Everything is overridable in the CMS.

Two courts: **Court 1** and **Court 2**. Each group is a round robin (3 matches).

**Women's — to reach Sunday (8 teams):**
- 1st and 2nd of each group qualify directly (6 teams).
- The three 3rd-placed teams play a **Repechage group** (round robin, 3 matches)
  on Saturday. 1st and 2nd of the repechage qualify; 3rd is eliminated.

**Men's & Mixed — to reach Sunday (8 teams):**
- 1st of each group qualifies directly (4 teams).
- 2nd and 3rd of each group play **crossed playoff matches** on Saturday:
  2A–3B, 2B–3A, 2C–3D, 3C–2D. The 4 winners qualify.

**Sunday final phase (all categories, 8 teams):** Quarterfinals → Semifinals →
Final (1st/2nd) and a 3rd-place match (implied by "except the 1st and 2nd place
finals" in the scoring rules — see §10).

### 3.2 Scoring

- Every match: **one set to 21, win by 2, no cap**.
- Exception — **Final (1st/2nd place)**: **best of 3 sets**: sets 1–2 to 21,
  set 3 (if needed) to 15, always win by 2.
- Walkover = 21–0; referee no-show penalty = −10 points. Both are entered **by
  hand in the CMS**, not in the app.

### 3.3 Refereeing

Every match has an assigned **referee team** shown on the calendar:
group stage → the third team of the group (or another group's team, as in the
screenshots); repechage → the 2nd-placed teams; Men's/Mixed playoffs → the
1st-placed teams. Sunday referees are not known yet (field may be empty).

## 4. Data model (CMS)

Names are indicative; the builder maps them onto emdash collections/fields.

**Player**
- `name` (as displayed, e.g. "Laura M.")
- A player can belong to several teams (one per category at most, in practice).

**Team**
- `category` (womens | mens | mixed)
- `player1`, `player2` → Player
- `displayName` (e.g. "Laura M./Mona"; default = "player1/player2")
- `group` → Group, `seed` (e.g. "A2" — group letter + position in schedule)

**Group**
- `category`, `name` ("A", "B", "C", "D", "Repechage")
- teams → Team (repechage group teams are filled by the admin on Saturday)

**Session** (one per category per day — the scheduling anchor)
- `category`, `day` (Saturday | Sunday), `startAt` (local datetime, Atlantic/Canary)
- `slotMinutes` (default 20)

**Match**
- `category`, `session` → Session
- `phase`: group | repechage | playoff | quarterfinal | semifinal | third_place | final
- `group` → Group (group and repechage matches only)
- `slot` (integer, 1-based order within the session) and `court` (1 | 2)
- `timeOverride` (optional datetime)
- **Displayed time** = `timeOverride` ?? `session.startAt + (slot − 1) × slotMinutes`.
  Two matches on different courts share a slot.
- `team1`, `team2`, `referee` → Team (each optional)
- `team1Label`, `team2Label`, `refereeLabel` — placeholder text shown while the
  team relation is empty (e.g. "2nd Group A", "Winner QF1")
- `format`: single_21 | best_of_3 (final only)
- `sets`: list of `{ team1: int, team2: int }` (empty until submitted)
- `status`: scheduled | finished
- `bracketCode` (Sunday matches: "QF1".."QF4", "SF1", "SF2", "3RD", "FINAL";
  Saturday playoffs: "PO1".."PO4") — used in placeholder labels

**Playoff / bracket handling.** No automatic advancement. The bracket is a set of
Match records with placeholder labels; when a round finishes, the admin edits the
next match and picks `team1`/`team2` (and referee). Winner/loser of a finished
match is derived from its `sets`.

## 5. Seed data (from the screenshots)

The builder must load all of this so the calendar is complete on day one.

### 5.1 Teams

**Women's**
- A1 Ilaria/Carlotta · A2 Laura M./Mona · A3 Martina/Lucia
- B1 Eugenie/Patricia C. · B2 Patricia S./Agustina · B3 Cristina/Marina
- C1 Emilija/Sandra · C2 Janny/Paula L. · C3 Emi/Megi

**Men's**
- A1 Dani/Mat · A2 Emilio/Ilde · A3 Dubovs/Saul
- B1 Moodou/Adam · B2 Cesar/Albi · B3 Marci/Giando
- C1 Giulio/Marco · C2 Sebas/Kevin · C3 Gonzo/Matteo
- D1 Luca/Roberto · D2 Joaquin/Jorge · D3 Javi/Hector

**Mixed**
- A1 Cesar/Patricia C. · A2 Viktor/Silvia · A3 Saul/Sara
- B1 Marci/Ilaria · B2 Giando/Mona · B3 Dani/Laura P.
- C1 Luca/Daria · C2 Moodou/Megi · C3 Adam/Emi
- D1 Javi/Laura M. · D2 Albi/Emilija · D3 Dubovs/Paula G.

Shared players (same Player record across categories): Ilaria, Laura M., Mona,
Patricia C., Emi, Megi, Emilija (women/mixed); Dani, Saul, Dubovs, Moodou, Adam,
Cesar, Albi, Marci, Giando, Luca, Javi (men/mixed). "Paula L." ≠ "Paula G.",
"Laura M." ≠ "Laura P." (different people). The screenshot spells "Emilja" in
Women's and "Emilija" in Mixed — treated as one person, spelled **Emilija**
(*builder's call, editable in CMS*).

### 5.2 Saturday schedule (slot / court: match — referee)

**Women's** (session start 09:00)
| Slot | Court 1 | Court 2 |
|---|---|---|
| 1 (09:00) | A1 v A2 — ref B3 | B1 v B2 — ref C3 |
| 2 (09:20) | C1 v C2 — ref A1 | A2 v A3 — ref B1 |
| 3 (09:40) | B2 v B3 — ref C1 | C2 v C3 — ref A2 |
| 4 (10:00) | A1 v A3 — ref B2 | B1 v B3 — ref C2 |
| 5 (10:20) | C1 v C3 — ref A3 | **Repechage**: 3rd A v 3rd B — ref 2nd A |
| 6 (10:40) | **Repechage**: 3rd C v 3rd A — ref 2nd B | — |
| 7 (11:00) | **Repechage**: 3rd B v 3rd C — ref 2nd C | — |

**Men's** (session start 12:30)
| Slot | Court 1 | Court 2 |
|---|---|---|
| 1 (12:30) | A1 v A2 — ref B3 | B1 v B2 — ref A3 |
| 2 (12:50) | C1 v C2 — ref D3 | D1 v D2 — ref C3 |
| 3 (13:10) | A2 v A3 — ref B1 | B2 v B3 — ref A1 |
| 4 (13:30) | C2 v C3 — ref D1 | D2 v D3 — ref C1 |
| 5 (13:50) | A1 v A3 — ref B2 | B1 v B3 — ref A2 |
| 6 (14:10) | C1 v C3 — ref D2 | D1 v D3 — ref C2 |
| 7 (14:30) | **PO1** 2nd A v 3rd B — ref 1st C | **PO2** 2nd B v 3rd A — ref 1st D |
| 8 (14:50) | **PO3** 2nd C v 3rd D — ref 1st A | **PO4** 3rd C v 2nd D — ref 1st B |

**Mixed** (session start 16:00) — same pattern as Men's:
| Slot | Court 1 | Court 2 |
|---|---|---|
| 1 (16:00) | A1 v A2 — ref B3 | B1 v B2 — ref A3 |
| 2 (16:20) | C1 v C2 — ref D3 | D1 v D2 — ref C3 |
| 3 (16:40) | A2 v A3 — ref B1 | B2 v B3 — ref A1 |
| 4 (17:00) | C2 v C3 — ref D1 | D2 v D3 — ref C1 |
| 5 (17:20) | A1 v A3 — ref B2 | B1 v B3 — ref A2 |
| 6 (17:40) | C1 v C3 — ref D2 | D1 v D3 — ref C2 |
| 7 (18:00) | **PO1** 2nd A v 3rd B — ref 1st C | **PO2** 2nd B v 3rd A — ref 1st D |
| 8 (18:20) | **PO3** 2nd C v 3rd D — ref 1st A | **PO4** 3rd C v 2nd D — ref 1st B |

### 5.3 Sunday schedule (builder's default — no official bracket published)

Per category, one session. Placeholder labels as shown; all editable.

| Slot | Court 1 | Court 2 |
|---|---|---|
| 1 | QF1 | QF2 |
| 2 | QF3 | QF4 |
| 3 | SF1 (W QF1 v W QF2) | SF2 (W QF3 v W QF4) |
| 4 | FINAL (W SF1 v W SF2, best of 3) | 3RD (L SF1 v L SF2) |

Quarterfinal pairings (*my call*):
- **Men's / Mixed:** QF1 1st A v W PO4 · QF2 1st B v W PO3 · QF3 1st C v W PO2 ·
  QF4 1st D v W PO1 (avoids same-group rematches).
- **Women's:** QF1 1st A v 2nd Repechage · QF2 1st B v 2nd C · QF3 1st C v 2nd A ·
  QF4 2nd B v 1st Repechage.

Sunday referees: empty (`refereeLabel` "TBD") until set by the admin.

## 6. Public app

### 6.1 Calendar (home)

- **Category dropdown**: Men's · Women's · Mixed. Selection is reflected in the
  URL (shareable/bookmarkable link per category and tab).
- **Two tabs** per category:
  - **Qualifiers** = all Saturday matches (group stage + repechage or playoffs),
    plus **group standings** (one table per group, including Repechage).
  - **Finals** = all Sunday matches (QF, SF, 3rd place, Final).
- Matches listed in time order; matches in the same slot appear together
  (Court 1 / Court 2).
- **Each match card shows** (everything in the screenshots):
  - day + time, court
  - phase/round label (Group A, Repechage, Playoff, QF1, Final…)
  - both teams: seed code (e.g. "A1") + player names; placeholder label if no team yet
  - referee team (seed + names, or placeholder label)
  - when finished: score (single set "21–18"; best of 3 "2–1 (21–18, 19–21, 15–12)")
    with the winner highlighted
  - a **Referee** button (hidden when the match is finished or either team is
    still a placeholder — *my call*)
- **Standings table** per group: team, played, won, lost, points for, points
  against, point difference. Sort: wins → point difference → head-to-head
  (two-way tie) → points for. Only finished matches count.
- **Real-time:** pages are SSR (no caching of tournament data); the calendar
  refreshes itself (e.g. polling a JSON endpoint or re-fetching the page every
  ~15–30 s — builder's choice) so submitted scores appear without manual reload.

### 6.2 Referee screen

Opened from a match's Referee button (own URL per match).

Layout (functional; looks are builder's choice):
```
| Team 1 name |        | Team 2 name |
|     +       |  7 - 5 |      +      |
|     −       |        |      −      |
```
- Header: match label, court, team names. For best-of-3: set number and sets won.
- Big **+** per team adds one point; smaller **−** per team removes one (never below 0).
- Rules engine:
  - Set target = 21 (set 3 of a best-of-3: 15); a set ends when a team reaches
    the target with ≥ 2-point lead (no cap).
  - Single-set match: set end = match end.
  - Best of 3: on set end, record the set and start the next one at 0–0 until a
    team has 2 sets.
- **On match end → "Submit Score" modal** with the final score and two buttons:
  - **Cancel**: close modal, back to scoring (the referee can correct with −;
    the modal reappears whenever the match-end condition is met again).
  - **Submit**: send the set scores to the server; the match is saved in the CMS
    as `finished` with `sets`; redirect back to the calendar showing the result.
- Scoring state lives **only on the device** until Submit (nothing is saved
  per point). Persisting it in browser storage so a reload doesn't lose it is a
  nice-to-have (*my call: do it, it's cheap*).
- No auth, no conflict handling: the last submission wins. Corrections are made
  in the CMS.

### 6.3 Submit endpoint

- Public `POST` endpoint (e.g. `/api/matches/:id/result`) taking `sets`.
- Server validates basic sanity (sets are a valid finished result per the
  match's format) and writes `sets` + `status = finished` into the CMS.

## 7. CMS (admin)

- One admin user (emdash's built-in auth).
- Admin can create/edit Players, Teams, Groups, Sessions, Matches.
- Typical tournament-day tasks:
  - fill repechage group / playoff / QF / SF / Final teams once known
  - set referees for Sunday matches
  - override a match time when things run late
  - correct a score, enter a walkover (21–0), apply a −10 penalty — all by
    editing `sets` directly
- Seed data (§5) is loaded via a script or emdash seed mechanism so it can be
  re-run on a fresh database.

## 8. Left to the builder

Design system and styling, component library, how emdash collections are
modelled exactly, polling vs other refresh mechanism, URL structure, seeding
mechanism, error states, Cloudflare project setup.

## 9. Calls I made (please check)

1. Sunday bracket layout and quarterfinal pairings (§5.3).
2. Sunday start times taken from the organizers' message, not the poster (confirmed).
3. A 3rd-place match exists and is single set to 21.
4. Referee button hidden for finished matches and matches with placeholder teams.
5. "Emilja"/"Emilija" = one person.
6. Standings tiebreak order (wins → diff → head-to-head → points for).
7. Referee screen keeps its in-progress score in browser storage.

8. Admin edits in the CMS (walkover, −10 penalty, corrections) may produce
   `sets` that don't follow the scoring rules. Server validation applies only to
   the public referee endpoint; display, winner logic and standings accept any
   numbers (winner = more sets won; single set = higher score).
9. The schedule is loaded exactly as in the screenshots, including the Women's
   slot-5 clash (A3 referees C1 v C3 while "3rd A" may be playing the repechage
   at the same time). The admin fixes it on the day if needed.

## 10. Resolved decisions

1. **Deadline:** must be live for Sat 17 Oct, 09:00 → build the minimal version
   only (seed data, calendar + standings, referee screen, submit endpoint, CMS).
   Default hosting: the user's Cloudflare account on a `workers.dev` URL unless
   a domain is provided.
2. **Sunday start times:** the organizers' message wins (Mixed 09:30, Women's
   13:30, Men's 16:30).
3. **3rd-place match:** yes, single set to 21.
4. **Quarterfinal pairings** in §5.3: approved.
