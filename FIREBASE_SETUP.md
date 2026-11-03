# Firebase accounts, saved games and spectators

The application uses the modular Firebase web SDK, Email/Password Authentication
and the `(default)` Cloud Firestore database. No service account, Admin SDK,
Firebase Cloud Function or paid extension is used. Website hosting and the
commentary API use Vercel at [the live application](https://uct-inf-4001-n.vercel.app).
See [README.md](README.md) for the assessor-facing overview and startup steps.

## 1. Local configuration

An existing developer checkout may have an ignored `.env.local`; a fresh checkout
does not include it. Copy `.env.example` only if `.env.local` does not already
exist, then obtain the web-app configuration privately. All six `VITE_FIREBASE_*`
fields listed in the template must be non-empty. Do not commit `.env.local`.
Vite embeds `VITE_` variables in the browser
bundle: Firebase web configuration identifies the app; **Firestore rules provide
the access control**. Never put service-account or LLM credentials in these
variables.

For the real project, keep `VITE_USE_FIREBASE_EMULATORS=false`. Restart Vite after
changing environment variables. From the VS Code PowerShell terminal:

```powershell
npm.cmd install
npm.cmd run dev
```

Open the address printed by Vite. An account is required to create a game. The
country catalogue can still be explored without signing in.

## 2. Required Firebase Console checks

In project **uct-inf4001n-geopolitics**:

1. Authentication → Sign-in method: confirm Email/Password is enabled.
2. Authentication → Settings → Authorized domains: confirm `localhost` is
   listed for local development. Add `127.0.0.1` if using that hostname. Add the
   deployed hostname `uct-inf-4001-n.vercel.app` for the live application.
3. Firestore Database: confirm the `(default)` database exists. Its production
   mode rules may still deny every request until the rules below are deployed.
4. Authentication → Settings → Password policy: the app checks six characters
   and matching confirmation. Firebase also enforces any stronger policy you
   configure and displays its error. No email verification requirement is added.

These are manual checks. Local files and emulator tests do **not** prove that
your production Console settings or deployed rules have changed.

## 3. Deploy the rules and index exemptions manually

Run these yourself in the repository terminal, using a Google account with
permission to manage this Firebase project:

```powershell
npx.cmd firebase login
npx.cmd firebase deploy --project uct-inf4001n-geopolitics --only "firestore:rules,firestore:indexes"
```

This deploys the tracked `firestore.rules` and `firestore.indexes.json` selected
by `firebase.json`. It does not deploy website hosting. There is no need to run
`firebase init` or overwrite these files. Review the CLI's success messages, then
check Firestore → Rules in the Console for the deployed rules. Index exemptions
keep large serialized payloads out of indexes; the library's owner query uses
the standard single-field `ownerUid` index.

The owner reports that production rules have been deployed. Confirm the actual
deployed version before assessment or after rule changes; this documentation
update neither deploys nor independently certifies it. A permission-denied error
is a reason to check the account, sharing flag and
deployed rules, not to switch to public write access.

## 4. Browser acceptance checks

1. Create an account; try invalid email, short password and mismatched
   confirmation. Sign out and sign in again. Wrong credentials should show a
   readable error.
2. Choose a country and create a game. It contains exactly ten participants.
   Create a second game; both should remain in **Saved games**. Select either
   entry to resume it.
3. Make moves and watch **Saving to Firestore…** become **Saved to Firestore**.
   Refresh during a human turn, including during an attack or pending
   occupation: countries, soldiers, round, active attack and histories must be
   restored, rather than creating a new game.
4. Skip a human turn. NPC decisions still play individually at 1×/2×/4×. Each
   step is saved before the next step starts. Pause playback to inspect it.
5. Enable **Allow spectators with this link** and copy the link. In an incognito
   window, open it without logging in. The map and histories update live; no
   move or NPC playback controls appear. Another signed-in account is also a
   spectator, not a co-owner. Spectators see the owner's human player: existing
   `You` labels on the map refer to that game’s human player.
6. Turn sharing off. The spectator should receive an access error and lose the
   game view. A private game's URL must not grant access to another account or
   an anonymous visitor. Signing out removes editing access immediately.
7. Open the same game in two owner tabs. A stale move must show a conflict
   rather than overwrite the newer saved board. Use **Reload saved position**
   to discard an unconfirmed action, with confirmation, and load the latest.
8. Disconnect while playing. Gameplay pauses while connectivity/save status is
   uncertain. On a failed save, reconnect and use **Retry the same save**. The
   pending result is retained in memory, including the dice; retry does not
   roll again. Do not close the page while a save is pending. A refresh restores
   the last server-confirmed position, not an unconfirmed local candidate.
9. Delete a session: first choose Delete, then Confirm deletion. Other sessions
   must remain. If deletion is interrupted, its library entry offers retry.

Only an owner's open, active game view runs NPC turns. Spectator windows do not
advance the game, and NPC turns do not continue on a server after the owner
closes the page. Refreshing a saved NPC turn continues from its saved step.
Playback pause and speed are local viewing preferences and reset on reload.

## 5. Storage and reliability

```text
games/{gameId}
  ownerUid, title, isShared, deleting, schemaVersion,
  revision, lastMutationId, createdAt, updatedAt,
  core (JSON), battleCount, decisionCount
  battles/{sequence}:   seq, payload (one complete engine event as JSON)
  decisions/{sequence}: seq, payload (one NPC decision and explanation as JSON)
  commentary/{eventId}: state, text, model, factsHash, attempts, timestamps
```

`GameRepository` encapsulates the injected Firestore connection in `#database`,
with private `#games()` and `#gameRef()` helpers and bound public create/update/
watch/watchList/remove methods. The factory and singleton exports are preserved.
Each watch has its own local state and unsubscribe function. See
[ARCHITECTURE.md](ARCHITECTURE.md#object-oriented-database-access).

`core` contains every other engine field, including all countries/players,
ownership, soldiers and original values, turn order/index/counter, current
player, round, reinforcements, attack flags and phase, pending conquest and
winner/status. Histories are append-only and are never truncated. Splitting
them prevents a growing game history from exhausting the board document's
size limit. Each payload is checked against a conservative 700 KB limit and
fails explicitly instead of dropping data. Save format version 1 rejects
unsupported/incomplete data without starting over.

The hook serializes writes and disables moves while saving. Firestore
transactions atomically update the core and append new events, checking the
previous revision. Dice/strategy actions run once outside the transaction;
transaction retries cannot reroll. A mutation ID makes an uncertain
acknowledgement safe to retry. Listeners wait for the board and complete
histories belonging to the same revision before publishing a state. Unrelated
UI selections, inspection, pause/speed changes and renders cause no writes.

Deletion marks the parent as deleting/private first, blocks new moves, removes
history in batches and then removes the parent. An interrupted deletion can be
retried by the owner; it does not require a paid server function.

Rules enforce authenticated ownership, immutable `ownerUid` and creation time,
monotonic revisions, a restricted document shape, read-only spectator access
and append-only history. They do not execute the game engine or validate the
JSON's gameplay semantics. This is an owner-controlled single-player game,
not a server-authoritative anti-cheating system.

## 6. Automated checks and local emulators

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Normal tests include engine, catalogue, session, input-validation and complete
save/restore checks. Emulator/browser suites are intentionally skipped unless
their explicit environment variables are set; they must never use production.
Install Java 21+ and put its `bin` directory on PATH for current emulators:

```powershell
java -version
npm.cmd run test:firebase
```

This starts temporary Auth/Firestore emulators for `demo-uct-inf4001n`, tests
rules and repository behavior, and stops them afterward. If emulators are
already running, run instead:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
node --test tests/firebase.integration.test.js
```

For the browser integration test, start emulators in terminal 1:

```powershell
npx.cmd firebase emulators:start --project demo-uct-inf4001n --only auth,firestore
```

Terminal 2 (environment changes apply only to this terminal):

```powershell
$env:VITE_USE_FIREBASE_EMULATORS='true'
$env:VITE_FIREBASE_PROJECT_ID='demo-uct-inf4001n'
$env:VITE_FIREBASE_API_KEY='demo-key'
$env:VITE_FIREBASE_AUTH_DOMAIN='demo-uct-inf4001n.firebaseapp.com'
$env:VITE_FIREBASE_STORAGE_BUCKET='demo-uct-inf4001n.appspot.com'
$env:VITE_FIREBASE_MESSAGING_SENDER_ID='123'
$env:VITE_FIREBASE_APP_ID='demo-app'
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Terminal 3:

```powershell
npx.cmd playwright install chromium
$env:UI_TEST_URL='http://127.0.0.1:5173/'
npm.cmd run test:browser
```

Alternatively set `$env:CHROME_PATH` to an installed Chrome executable and skip
the Chromium download. The browser test refuses to run against a non-demo
project. Run repository tests before browser tests, not concurrently: the rules
suite clears the demo database. Emulator users/data are temporary and separate
from your real project. Stop emulators and Vite with Ctrl+C; use a fresh
terminal for real-project development so emulator environment overrides are
not accidentally retained.

The values in this demo block are non-secret test identifiers, not production
configuration. Browser tests mock commentary; do not start a real commentary API
or set `RUN_LIVE_GEMINI=true` for this suite. Use Node 24, the tested runtime.

The package override updates Firebase's Node-only `@grpc/grpc-js` dependency to
a patched version; it does not change browser gameplay. See
[the gRPC advisory](https://github.com/advisories/GHSA-m9gg-hp2v-232j).

## 7. Spark plan and remaining assignment work

This uses Firebase services available on Spark, with no billing upgrade.
Every meaningful step writes the board plus only newly appended history
records. New listeners read the complete session/history, and extra spectator
tabs add reads. Inspect Firestore → Usage: the free quota is finite and long
4× playback sessions can consume it. Quota errors pause gameplay and preserve
the pending candidate; they do not discard history or weaken rules.

The website is deployed at the live URL above. Confirm the deployed rules,
configured writer, production acceptance checks and deployed commit before
submission; private assessor access, source archive and Amathuba handover also
require confirmation. Gemini battle
commentary is now implemented separately; see `GEMINI_COMMENTARY.md` for its
server-only credentials, restricted writer configuration and local tests.

References: [Firebase transactions](https://firebase.google.com/docs/firestore/manage-data/transactions),
[rules testing](https://firebase.google.com/docs/rules/unit-tests),
[Firestore quotas](https://firebase.google.com/docs/firestore/quotas),
[Firebase security checklist](https://firebase.google.com/support/guides/security-checklist).

## 8. Validation and file guide

Latest completed implementation checks, at the repository-class milestone on
3 November 2026: **159 regular tests, 12 Firebase emulator integration tests and
8 mocked browser tests passed (179 total, zero failures)**. ESLint and production
build passed; the build retains a non-blocking large-chunk warning. These are
local regression results, not fresh production/provider checks. No dependency
security audit was rerun for this documentation update.

The following file/change record describes the original Firebase milestone:

Created:

- `.env.example`, ignored `.env.local`: web SDK configuration.
- `src/services/firebase.js`: initialize Firebase and optional demo emulators.
- `src/services/authValidation.js`: input validation and readable errors.
- `src/services/gameStorage.js`: versioned, complete game-state encoding and validation.
- `src/services/gameRepository.js`: create/update/watch/list/delete saved games.
- `src/hooks/useAuth.js`: account registration/login/logout and restored sessions.
- `src/components/AccountPanel.jsx`, `SavedGames.jsx`, `SaveStatus.jsx`,
  `account.css`: account, library, connection/save and sharing interface.
- `src/services/authValidation.test.js`, `gameStorage.test.js`,
  `tests/firebase.integration.test.js`, `tests/firebase.browser.test.js`: new tests.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`: local security
  rules, index exemptions and CLI/emulator configuration.
- `FIREBASE_SETUP.md`: this guide.

Modified:

- `src/hooks/useGameSession.js`: save-confirmed actions, safe retries, ownership
  checks, session listeners and one-at-a-time NPC persistence.
- `src/App.jsx`: connect account and session interfaces to the existing game.
- `src/components/GameSetup.jsx`: signed-in creation and cloud-save wording.
- `.gitignore`: exclude emulator logs/state and browser-test artifacts.
- `package.json`, `package-lock.json`: official Firebase SDK, local test tools,
  test commands and patched Node gRPC override.
- `ARCHITECTURE.md`, `README.md`: current architecture and setup-guide link.

Engine rules, NPC strategy, map rendering/styles, flags and population data
were not changed. Existing UCT PDFs remain untracked. No commits, pushes,
production database writes or production rule deployments were performed.
