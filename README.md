# UCT INF4001N Geopolitics Game

A single-player strategy web application developed for the University of Cape
Town INF4001N Honours entrance examination for 2027. Choose a country, compete
against nine strategic NPCs, and conquer all ten participating countries.

**Live application:** [Play Geopolitics](https://uct-inf-4001-n.vercel.app).
The deployment address is supplied by the project owner. Repository verification
and local tests do not certify the current production configuration or deployed
commit; complete the acceptance checks below before submission.

## Quick start for an assessor

1. Open the live application. Register an Email/Password account, or use the
   assessment account supplied privately with the submission. No credentials are
   included in this repository.
2. Search the country catalogue by name, alternative name, ISO code or region;
   select a country using the map or accessible country list, then create a game.
3. The initial turn order is random. NPCs act automatically while their decisions
   and explanations appear. Pause or select 1x, 2x or 4x playback to inspect play.
4. On your turn, allocate any reinforcements, then attack an enemy or skip. Select
   an owned source and enemy target in the action controls. Roll successive
   combat phases, or stop the attack and end your turn.
5. After defeating the defenders, choose occupation soldiers and complete the
   conquest. Transfers between your countries are available outside an attack.
6. Use **Saved games** to create and resume independent sessions. Wait for the
   saved confirmation before closing. Refresh restores the server-confirmed game.
7. Enable **Allow spectators with this link**, copy the link and open it in an
   incognito window. Visitors can watch live updates but cannot make moves.
8. Inspect **Live activity**, the standalone **Gemini Commentary** panel and the
   collapsible battle/NPC histories. Selecting old commentary pins it while play
   advances; **Return to latest saved commentary** resumes following new text.

Multiple saved sessions are **separate single-player games**, not multiplayer
matches. Only the owner plays the human turn and runs NPC playback; spectators
are read-only. NPC turns stop when the owner's active game view is closed. If the
human is eliminated, playback stops at defeat rather than simulating the remaining
NPCs to a final winner.

## Implemented rules and country data

Each game contains exactly ten distinct countries: the human's selection and nine
random opponents. The supported catalogue contains **55 real-world countries**,
not every country in the world. Population figures are a local snapshot of
Worldometer's **2026 annual estimates**, with individual source URLs documented
in [the country-data guide](src/data/README.md) and
[src/data/populations-2026.json](src/data/populations-2026.json).

| Population | Initial soldiers |
| --- | ---: |
| Up to 5 million | 1 |
| Over 5 million, up to 10 million | 2 |
| Over 10 million, up to 25 million | 3 |
| Over 25 million, up to 50 million | 4 |
| Over 50 million, up to 75 million | 5 |
| Over 75 million, up to 100 million | 6 |
| Over 100 million, up to 125 million | 7 |
| Over 125 million, up to 150 million | 8 |
| Over 150 million | 9 |

- Turn order is shuffled. Eliminated players are skipped.
- At most one attack is initiated per turn, with repeated phases against that
  target. Location and adjacency never restrict attacks.
- The attacker requires at least two soldiers and reserves one. Both sides roll
  `min(attacker soldiers - 1, defender soldiers)` six-sided dice. Corresponding
  dice are paired in their rolled order; the lower die loses one soldier, and
  ties cause no losses. This is not Risk's sorted-dice rule.
- An attack ends when the attacker stops, reaches one soldier, or completes
  conquest. Surviving countries retain their remaining armies.
- Conquest awards `max(2, floor(original soldier value / 2))` soldiers to the
  attacking source. The chosen occupation must leave at least one soldier in
  both countries. Completing conquest ends the turn unless it declares victory.
- From round two, each player receives two reinforcements per owned country at
  the beginning of their turn. Allocate all pending soldiers before attacking
  or ending the turn. Partial allocations are supported.
- Transfers require two different owned countries, no attack in progress, and
  at least one soldier remaining in the source. Transfers do not end the turn.
- Losing all countries eliminates a player. Controlling all ten wins.

All NPCs use the same deterministic strategy: build a strong army, select
favourable targets using relative strength, conquest rewards and elimination
opportunities, transfer when useful, and reassess whether to continue each phase.
Every decision has a recorded explanation. NPC choices are not made by an LLM;
dice remain random. Fast-forward preserves each visible action and save.

## Technology and architecture

React and Vite provide the JavaScript frontend. React Leaflet/Leaflet display
local world-atlas/Natural Earth geography; local flag-icons SVGs provide flags.
Firebase Authentication handles accounts, and Cloud Firestore is the NoSQL
store. Vercel serves the frontend and a server-side commentary Function using
the official `@google/genai` SDK. Node's test runner, Firebase emulators,
Playwright and ESLint provide validation.

| Location | Responsibility |
| --- | --- |
| `src/engine/` | Population/dice rules, state, turn/combat engine and NPC strategy |
| `src/game/` | UI action routing, commentary sampling and bounded scheduling |
| `src/components/` | Setup, map, controls, accounts, saved games and activity/history |
| `src/hooks/` | Authentication/session listeners, save coordination and commentary |
| `src/services/gameRepository.js` | Encapsulated Firestore repository class |
| `src/services/gameStorage.js` | Versioned state validation and serialization |
| `src/data/`, `public/data/`, `public/flags/` | Population catalogue, map and flag assets |
| `api/battle-commentary.js`, `server/` | Authorised generation, fact checks, quotas and persistence |
| `tests/` | Emulator, browser and commentary integration coverage |

`GameRepository` demonstrates classes and encapsulation. Its constructor receives
Firestore through **dependency injection**. `#database`, `#games()` and
`#gameRef()` are language-enforced private members. Callers use `create`, `update`,
`watch`, `watchList` and `remove`; methods remain bound when passed as callbacks.
The compatibility factory `createGameRepository(database)` and configured
`gameRepository` singleton serve existing callers. Each watch keeps separate
local subscription state. Private fields organise code; database security still
comes from Firestore rules. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Accounts, cloud saves and sharing

Email/Password registration, login, logout and restored authentication sessions
are implemented. Games are private by default. Each game's owner controls its
sharing setting and may delete that session after confirmation.

Firestore stores a versioned core game document and append-only battle and NPC
history subcollections. All necessary gameplay state is saved, including active
attacks and pending occupation. Transactions use revision checks and mutation IDs
to prevent stale overwrites and duplicate retries. A failed save pauses editing;
**Retry the same save** retains the original dice result. Refresh restores the
last server-confirmed position, not an unconfirmed local action.

Saved commentary has its own subcollection. Anonymous visitors may read shared
games and commentary through live listeners, but cannot make moves or generate
commentary. Other authenticated accounts are also spectators of another owner's
shared game. Sharing off revokes subsequent access, not copies already viewed.
See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for schema, rules and acceptance checks.

## Gemini commentary and limits

The configured model is `gemini-3.5-flash-lite`; access and provider allowances
must be checked for the configured Gemini project. Requests go through the
server Function, never directly from React. The server authenticates the owner,
loads saved events, validates dice/losses and generates short interpretive prose.
The exact deterministic battle result remains authoritative.

Automatic sampling considers the first casualty-producing **ongoing** phase per
attack and completed conquests, stopped attacks and failed attacks, at every
playback speed. A local scheduler allows one request in flight and one pending
candidate, with a minimum 30-second interval between automatic starts. Completed
outcomes have priority; excess candidates are coalesced rather than backlogged.

Successful text is persisted against its immutable event ID, visible after
refresh and to spectators. Reading history, restoring a game and changing the
selected commentary do not generate old events. Failures never change gameplay;
there are no automatic retries of failed events. Owners may use the existing
manual Generate/Retry controls when allowed. Manual requests share the in-flight
lock but use the server's retry limits rather than automatic pacing.

Application limits are **two attempts/minute globally, 20/UTC day globally,
eight/UTC day per owner, and two attempts per event**, with at least a one-minute
retry cooldown. Failed generations count. Provider limits may be lower. Thus
commentary improves coverage as battles unfold but is **not guaranteed for every
battle or before a fast battle ends**. Gameplay continues when commentary is
unavailable. See [GEMINI_COMMENTARY.md](GEMINI_COMMENTARY.md) for detailed setup.

## Local installation and configuration

Use **Node.js 24 with npm** (the tested runtime), Git or a source checkout, and a
modern browser. Java 21+ is needed only for Firebase emulator tests. Browser tests
also need Playwright Chromium or an installed Chrome executable.

Run from the repository root in VS Code's Windows PowerShell terminal:

```powershell
npm.cmd ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Edit your own `.env.local` locally; do not overwrite an existing configuration.
Obtain the Firebase web configuration from the administrator/Firebase Console.
**All six** variables below must be non-empty for this frontend to initialise:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

`VITE_USE_FIREBASE_EMULATORS` selects demo emulators when `true`; use `false`
for real-project development. Having only the project ID and API key is insufficient:
`firebase.js` rejects any falsy field in its six-field configuration.

The commentary server additionally uses these **server-only** variable names:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Gemini Developer API credential |
| `COMMENTARY_WRITER_EMAIL` | Dedicated Firebase Auth writer account |
| `COMMENTARY_WRITER_PASSWORD` | Writer password; never a player's password |
| `COMMENTARY_WRITER_UID` | Expected writer UID, matching `serverConfig/commentary.writerUid` |
| `COMMENTARY_USE_EMULATORS` | `true` only for isolated demo setup; otherwise `false` |
| `FIREBASE_PROJECT_ID` | Optional server override; otherwise the Vite project ID is used |
| `FIREBASE_WEB_API_KEY` | Optional server override; otherwise the Vite Firebase API key is used |

No service-account credentials are required. The restricted writer account and
Console-managed `writerUid` must be configured by an administrator, following
[GEMINI_COMMENTARY.md](GEMINI_COMMENTARY.md#real-firebase-project-manual-administrator-steps).
Do not create another production writer just to follow a fresh-checkout guide.

### Run the frontend and local commentary API

After configuring the intended Firebase project, use two terminals:

```powershell
# Terminal 1: frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

```powershell
# Terminal 2: local Vercel Function adapter
npm.cmd run dev:api
```

Open **http://127.0.0.1:5173/**, not the API URL. Vite proxies `/api` to the
adapter at `127.0.0.1:3001`, which runs the same handler as Vercel. Restart both
processes after changing environment settings. Stop them with Ctrl+C.

Vite alone does not run the Gemini endpoint. Starting the API server itself does
not generate commentary, but playing eligible new battles with valid provider
credentials can consume real Gemini quota automatically. For isolated development,
use the complete demo-emulator setup in the Firebase/Gemini guides. Ordinary
browser regression tests mock this endpoint and need no running commentary API.
A build preview (`npm.cmd run preview`) serves frontend assets only, not Functions.

## Automated verification

Safe local checks (do not enable real-provider tests):

```powershell
$env:RUN_LIVE_GEMINI='false'
Remove-Item Env:UI_TEST_URL -ErrorAction SilentlyContinue
Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

| Command/suite | Requirements and side effects |
| --- | --- |
| `npm.cmd test` | Standard unit/mocked tests; emulator/browser/live suites skip unless explicitly enabled |
| `npm.cmd run test:firebase` | Java 21+; starts demo Auth/Firestore emulators, writes/clears demo fixtures, then stops them |
| `npm.cmd run test:browser` | Running demo emulators and demo-configured Vite; set `UI_TEST_URL` and install Chromium or set `CHROME_PATH`; API responses are mocked |
| `npm.cmd run check:gemini` | **Real quota-consuming SDK request**; optional, never part of safe routine checks |
| `tests/commentary.live.test.js` | **Real quota-consuming browser test**, enabled only by `RUN_LIVE_GEMINI=true`; needs demo Firebase and local API setup |

Run emulator integration tests **before**, not concurrently with, browser tests:
the integration suite clears demo data/configuration. Never point automated tests
at production. Exact PowerShell browser instructions are in
[FIREBASE_SETUP.md](FIREBASE_SETUP.md#6-automated-checks-and-local-emulators).

Latest completed implementation verification: **159 standard tests, 12 emulator
integration tests and 8 mocked browser tests passed (179 total, zero failures)**.
ESLint and build passed, with a non-blocking large-JavaScript-chunk warning.
These are local results from the repository-class milestone, not a claim of
current live-production acceptance or a fresh provider check during documentation.

## Production deployment and verification

The application is deployed at [uct-inf-4001-n.vercel.app](https://uct-inf-4001-n.vercel.app).
The following explains reproduction/maintenance, not actions performed by this guide:

1. Use Vercel's Vite preset, repository root, build command `npm run build` and
   output directory `dist`; configure a compatible Node runtime. Root `api/`
   contains the commentary Function; `vercel.json` sets its 60-second duration.
2. Configure **all six frontend variables**, both emulator flags as `false`,
   and the server-only commentary variables in the appropriate Vercel environment.
   Environment changes require a new deployment; existing local secrets are not
   automatically uploaded. Never prefix Gemini/writer secrets with `VITE_`.
3. Confirm Firebase Email/Password authentication, the Firestore database and
   the deployed hostname in Authentication's authorised domains. Verify the
   dedicated writer/configuration and actual deployed Firestore rules/indexes.
   Rule deployment is a separate administrator operation, not a Vite build;
   see [FIREBASE_SETUP.md](FIREBASE_SETUP.md#3-deploy-the-rules-and-index-exemptions-manually).
4. After an explicitly authorised deployment, verify registration/login, two
   independent saves, active-attack refresh, conflict/error handling, private
   access denial, shared incognito viewing and sharing revocation. Verify the
   deployed commit includes the repository class and ongoing-commentary sampler.
5. A deliberate live Gemini acceptance check consumes quota. Arrange it
   separately; do not mistake saved old commentary or mocked tests for proof of
   fresh production generation.

This implementation does not require a Firebase billing upgrade. Firebase,
Vercel and Gemini each have finite service limits; the source does not guarantee
free-tier availability, remaining quota or uninterrupted hosting.

## Security and submission handover

- Never commit, paste into documentation, or package `.env.local`, writer
  credentials, API secrets, tokens or privileged database credentials.
  `.gitignore` and `.vercelignore` exclude local environment files; `.env.example`
  is the placeholder template. Manually review any future submission archive.
- `VITE_` variables are embedded in browser assets. Firebase web configuration
  identifies the application; security depends on deployed rules and owner checks.
- Only owners may change their games. The dedicated writer may write commentary
  and quota records, not gameplay. Client private fields are not a security rule.
- Game rules run on the client; Firestore rules validate access/document shape,
  not the full semantics of serialized gameplay. Do not claim server-authoritative
  anti-cheating, multiplayer turns or LLM-controlled NPCs.

Before the UCT Amathuba submission, prepare and verify:

- [ ] A source-code ZIP, excluding secrets, `node_modules`, build/test artifacts
      and local tool state; retain the source, lockfile, assets and documentation.
- [x] The live application URL, recorded above.
- [ ] A working assessment application account, with credentials supplied privately.
- [ ] Assessor database access according to the original brief, through the
      administrator's access arrangements; never publish writer/admin credentials.
- [x] This README and the linked technical guides.
- [ ] Final production acceptance evidence and confirmation of the deployed commit.
- [ ] All required files and access information submitted to the INF4001N Amathuba
      assignment folder before the official deadline.

The checklist does not assert that outstanding private access arrangements or
submission uploads have occurred. No submission ZIP is included by this update.
See [REQUIREMENTS_CHECKLIST.md](REQUIREMENTS_CHECKLIST.md) for implementation evidence.
