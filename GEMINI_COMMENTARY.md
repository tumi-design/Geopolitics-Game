# Gemini AI Battle Commentary

I integrated the **Gemini Developer API** into my Geopolitics Game to generate short commentary about selected battle events. The configured model is `gemini-3.5-flash-lite`, accessed through Google's official `@google/genai` SDK.

**Gemini describes battles; it does not control NPCs, roll dice, change soldiers or decide winners.**

## How it works

1. A battle event is saved to Cloud Firestore.
2. The React app identifies an eligible event and sends its game ID and event ID, together with the owner's Firebase authentication token, to the Vercel Function `api/battle-commentary.js`.
3. The server verifies ownership, retrieves the saved event and checks its dice, losses and outcome against the game rules.
4. Gemini generates interpretive commentary. The server rejects responses with unsupported numerical claims, contradictory outcomes or invalid formatting.
5. Accepted commentary is saved against the event ID in Firestore and displayed in the separate **Gemini Commentary** panel.

The server uses saved facts rather than trusting battle information supplied by the browser. Reading old commentary or refreshing a game does not generate it again. Spectators can read saved commentary for shared games but cannot request new text.

## When commentary is generated

Automatic commentary considers the **first casualty-producing ongoing phase** of an attack and completed outcomes such as conquest, a stopped attack or a failed attack. It works independently of 1×, 2× and 4× NPC playback. Owners can also use the available manual Generate/Retry controls.

The commentary panel has its own history. Players can keep an older entry selected and choose **Return to latest saved commentary** to follow new entries.

## Request limits and reliability

| Control | Limit |
| --- | --- |
| Automatic request spacing | At least 30 seconds |
| Pending work | One request in flight and one pending candidate |
| Global requests | 2 attempts/minute; 20 attempts/UTC day |
| Per owner | 8 attempts/UTC day |
| Per event | 2 attempts; at least 1 minute before retrying a failure |

Completed outcomes take priority over ongoing samples. Excess events are skipped rather than queued indefinitely, and failures are not retried automatically. Google's own provider limits may be lower. **Not every battle is guaranteed commentary**, but gameplay continues normally when generation is unavailable.

## Firebase storage and security

```text
games/{gameId}/commentary/{eventId}
  eventId, state, text, model, factsHash, attempts, timestamps
serverConfig/commentary
  writerUid
commentaryQuota/global
commentaryQuota/{ownerUid}
```

I used a dedicated **Firebase Authentication writer account** for server-side commentary persistence, instead of an Admin SDK or service-account JSON file. Firestore rules restrict the writer to commentary and quota records, not game moves. Quota counters and pending event claims reduce duplicate generation across tabs or server instances.

The Gemini API key and writer password remain in server-side environment variables, never in React or browser-exposed `VITE_` variables.

## Configuration and testing

The server uses these environment variables, with real values kept outside the repository:

```text
GEMINI_API_KEY
COMMENTARY_WRITER_EMAIL
COMMENTARY_WRITER_PASSWORD
COMMENTARY_WRITER_UID
COMMENTARY_USE_EMULATORS=false
```

The writer UID must match the administrator-controlled `serverConfig/commentary.writerUid` field. Optional server overrides are `FIREBASE_PROJECT_ID` and `FIREBASE_WEB_API_KEY`; otherwise the server uses the relevant configured Firebase web identifiers. The variables are set in Vercel for the deployed Function, while local private settings are kept in ignored environment files.

For local use, start the frontend and commentary API in separate PowerShell terminals after configuring Firebase and Gemini:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

```powershell
npm.cmd run dev:api
```

Normal tests use mocked Gemini responses and do **not** consume provider quota. Isolated Firebase emulator tests use demo data. During development, a separate opt-in real-provider test also confirmed generation, saved commentary, refresh restoration and spectator visibility. An explicit API check is available through `npm.cmd run check:gemini`, which **does consume real Gemini quota**.

The completed project checks passed **159 standard tests, 12 Firebase emulator tests and 10 browser tests**, as well as ESLint and the production build.

## Main source files

- `api/battle-commentary.js` — Vercel Function entry point.
- `server/` — authentication, verified battle facts, Gemini requests, stored results and quota checks.
- `src/game/commentaryEvents.js` and `commentaryScheduler.js` — eligible events and request pacing.
- `src/hooks/useBattleCommentary.js` — commentary subscriptions and generation requests.
- `src/components/BattleCommentary.jsx` — commentary panel and history.

See [README.md](README.md) for general setup and [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for Firebase configuration and security rules.
