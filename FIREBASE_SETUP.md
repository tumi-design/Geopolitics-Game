# Firebase Setup, Saved Games and Spectator Access

I used **Firebase Authentication** for player accounts and **Cloud Firestore** as the NoSQL database for my Geopolitics Game. The Firebase project is `uct-inf4001n-geopolitics`; the website and Gemini API are hosted on Vercel.

**Live application:** [Play Geopolitics](https://uct-inf-4001-n.vercel.app)

## Configuration

The repository includes `.env.example` with the six Firebase web configuration names:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

For local development, copy `.env.example` to `.env.local` and supply the Firebase project's web configuration. Set `VITE_USE_FIREBASE_EMULATORS=false` when connecting to the real project. The local file is ignored by Git. **Firebase web configuration does not grant database access; Firestore security rules control permissions.**

Firebase Console has Email/Password sign-in enabled, the `(default)` Firestore database, and authorised domains for the relevant development host and deployed website. The [README](README.md) includes the frontend installation and startup commands.

## Database design

```text
games/{gameId}
  ownerUid, title, isShared, deleting, schemaVersion,
  revision, lastMutationId, createdAt, updatedAt,
  core, battleCount, decisionCount
  battles/{sequence}       seq, payload
  decisions/{sequence}     seq, payload
  commentary/{eventId}     state, text, model, factsHash, attempts, timestamps
```

The `core` field contains the playable state: countries, ownership, soldiers, turns, reinforcements, attacks, occupation and winner. Battle and NPC histories are appended to separate subcollections. Commentary is stored separately so generated text cannot overwrite gameplay.

## Saving and reliability

`src/services/gameRepository.js` contains the `GameRepository` class for creating, updating, watching, listing and deleting saved games. `gameStorage.js` validates and serialises the stored state.

I used **Firestore transactions, revision checks and mutation IDs** to prevent stale updates and safely retry uncertain saves. A failed save pauses further actions; **Retry the same save** reuses the original result, including dice rolls. Refreshing restores the last confirmed save, and NPC actions are persisted step by step.

## Authentication and spectator access

Each game belongs to its signed-in owner and is **private by default**. Owners can create, resume, delete or share their own games. Enabling **Allow spectators with this link** allows other visitors to watch live updates, without giving them permission to make moves or generate commentary. The owner can disable sharing.

The source files `firestore.rules` and `firestore.indexes.json` define access restrictions and indexing. Rules validate ownership and permitted document changes; they do not independently run the game's full combat rules. The server's separate commentary writer has restricted permissions for commentary and quota records.

To deploy the tracked Firestore rules and indexes with administrator access:

```powershell
npx.cmd firebase login
npx.cmd firebase deploy --project uct-inf4001n-geopolitics --only "firestore:rules,firestore:indexes"
```

This updates Firestore configuration, **not** the website hosted on Vercel.

## Testing

I used an isolated Firebase emulator project, `demo-uct-inf4001n`, so automated database tests do not modify live game data. Java 21+ is required for the emulators.

```powershell
npm.cmd test
npm.cmd run test:firebase
npm.cmd run lint
npm.cmd run build
```

Browser tests use Playwright with the demo Auth/Firestore emulators and a demo-configured Vite frontend; they are run separately because database integration tests clear demo fixtures. The test setup is in `tests/firebase.browser.test.js` and the `test:browser` package script.

Completed development checks passed **159 standard tests, 12 emulator tests and 10 browser tests**. The browser and integration checks cover login, saved-game recovery, interrupted saves, stale revisions, live spectator access and sharing revocation. ESLint and the production build passed, with a non-blocking bundle-size warning.

Assessor login credentials and database access details are supplied separately with the final submission. Private passwords and API keys are not included in the source ZIP.

See [ARCHITECTURE.md](ARCHITECTURE.md) for code structure and [GEMINI_COMMENTARY.md](GEMINI_COMMENTARY.md) for the restricted commentary writer.
