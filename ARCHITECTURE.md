# UCT INF4001N — Web Application Architecture

## 1. Project objective

Develop a deployed, single-player geopolitical strategy game
that meets the INF4001N entrance-exam requirements.

The player competes against strategic non-player characters
(NPCs) to conquer ten countries.

## 2. Technology stack

- Frontend: React
- Development and build tool: Vite
- Language: JavaScript
- Code quality: ESLint
- Version control: Git
- Source-code hosting: GitHub
- Authentication: Firebase Authentication
- NoSQL database: Cloud Firestore
- Application hosting: Vercel
- Server-side AI integration: Vercel Functions
- AI-generated battle commentary: Gemini Developer API via the official
  `@google/genai` SDK, with fact validation and bounded sampling.

## 3. Application structure

```text
src/
  components/   Reusable interface components
  hooks/        Authentication, saved sessions and commentary coordination
  game/         UI action routing and commentary sampling/scheduling
  engine/       Game rules, combat and NPC strategy
  services/     Database, authentication and API services
  data/         Country and population data

api/
  battle-commentary.js   Server-side AI commentary endpoint
server/        Commentary validation, generation, quotas and Firebase REST
scripts/       Local API adapter, emulator setup and explicit provider checks
```

## 4. Core design principles

- Separate the user interface from the game rules.
- Separate database operations from the rest of the application.
- Use classes and encapsulation where appropriate.
- Keep game rules deterministic except for explicitly random
  mechanics such as country selection and dice rolls.
- Keep AI-generated commentary separate from game logic.
- Validate actions before changing the game state.
- Handle loading states, errors and invalid actions.
- Never expose AI API keys or other secrets in frontend code.
- Enforce authentication and authorisation through database
  security rules, not merely through interface controls.

## 5. Main application components

Game engine:
Manages game state, turn order, combat, soldier transfers,
reinforcements, conquest, elimination and victory.

NPC strategy:
Evaluates the board and selects strategic actions.
Displays a brief justification for each NPC decision.

Database service:
Creates, retrieves and updates saved games in Firestore.

Authentication service:
Supports account creation, login and logout.

Battle commentary service:
Sends battle-event information to a server-side endpoint
that requests dynamic commentary from an LLM.

User interface:
Displays countries, soldier counts, actions, combat results,
NPC decisions, battle commentary and fast-forward controls.

## 6. Access control

- Visitors may view a shared game.
- Authenticated users may play their own games.
- Visitors may not modify another player's game.
- Database rules must restrict game modifications to the
  authorised owner.
- API secrets must remain server-side.

## 7. Deployment

Live application: [uct-inf-4001-n.vercel.app](https://uct-inf-4001-n.vercel.app),
as supplied by the project owner. These are maintenance/verification steps;
local test results do not establish the currently deployed commit or settings.

- Develop and test locally using Vite.
- Store source code in the private GitHub repository.
- Deploy the application through Vercel.
- Connect the deployed application to Firebase.
- Configure production environment variables securely.
- Test the deployed application before submission.

## 8. Implementation status

### Object-oriented database access

`src/services/gameRepository.js` exports the `GameRepository` class. Each instance
represents one game-storage service and receives its Firestore connection through
`constructor(database)`. This is dependency injection: the application supplies its
configured connection, while tests supply isolated emulator connections. A missing
dependency fails immediately instead of failing during a later save.

The connection is held in `#database`. JavaScript enforces the privacy of this
field and the `#games()` / `#gameRef(id)` helpers: callers cannot read or replace
them through ordinary object properties. Public methods `create`, `update`,
`watch`, `watchList` and `remove` provide the service's interface. Their existing
arguments, results and errors are preserved. Constructor binding lets these
methods be passed as callbacks without losing their instance, and keeps the
existing browser tests' temporary method replacement possible.

This demonstrates a class combining private state with related behaviour, rather
than putting gameplay functions into a cosmetic class. The previous factory
already encapsulated its connection through a closure; the class now makes the
repository's contract and encapsulation explicit. `createGameRepository(database)`
still returns a configured instance, and the `gameRepository` singleton keeps
existing React callers unchanged. Subscription state stays local inside each
`watch()` invocation, so concurrent game listeners and their unsubscribe functions
remain independent.

Private fields organise client code; Firestore rules still enforce authorisation.
The refactoring leaves transactions, revision checks, idempotent retries, staged
deletion, stored data, engine rules, NPC strategy and Gemini services unchanged.

The tested engine, strategic NPCs, 55-country catalogue and playable React map
interface are implemented. Firebase integration now lives in `src/services/`:
`firebase.js` configures the SDK, `gameStorage.js` encodes/restores the engine
state, and `gameRepository.js` owns Firestore queries, transactions and listeners.
`useAuth.js` restores account sessions; `useGameSession.js` connects the existing
engine to serialized cloud saves and step-by-step NPC playback. Account, library
and save/sharing controls are separate React components.

Games are separate single-player sessions, each with one human and nine NPCs;
sharing adds read-only spectators, not multiplayer turn-taking. They have
private owner-controlled core documents and append-only battle/NPC
history subcollections. Shared games expose read-only live listeners; only the
owner can edit. Rules are tracked in `firestore.rules`; production rule/settings
verification and real-project acceptance checks are administrator tasks, not
implied by a local build. See `FIREBASE_SETUP.md` for
the schema, emulator tests, deployment commands and limitations.

Gemini battle commentary now uses `api/battle-commentary.js` with server helpers
in `server/`. A dedicated restricted Auth writer persists commentary in its own
subcollection, independently of engine saves. See `GEMINI_COMMENTARY.md` for
authorization, quotas, local setup and deployment verification. Automatic sampling
includes the first casualty-producing ongoing phase per attack and completed
outcomes at every playback speed, with one in-flight/one pending request and
30-second automatic pacing. Saved reading selection is independent of generation;
provider latency and quotas prevent guaranteed commentary for every battle.

The website is deployed at the address above. Final acceptance evidence, source
ZIP, private assessor access and Amathuba submission still need confirmation.
The assessor-facing entry point and setup instructions are in [README.md](README.md).
