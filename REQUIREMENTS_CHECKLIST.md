# UCT INF4001N — Marksheet Requirements Checklist

Recorded project deadline: 6 November 2026, 23:00. Confirm the official
assignment notice before submission.

Status key:

- [x] Implemented with local test/source evidence, or explicitly supplied deployment information.
- [ ] Outstanding or not yet independently verified.

This is an implementation/handover checklist, not a marking decision. Latest
completed implementation checks: 159 standard tests, 12 emulator tests and
8 mocked browser tests passed (179 total). No production or real-provider
checks were performed during this documentation update. See [README.md](README.md).

## A. Core game requirements

- [x] Create a new game with 10 countries, including the player's country.
- [x] Randomly select the other 9 countries.
- [x] Allocate starting soldiers according to population.
- [x] Randomise the first player and manage turn order.
- [x] Implement attack and skip-turn actions.
- [x] Implement dice combat, soldier losses and ties.
- [x] Enforce the requirement to leave at least one soldier behind.
- [x] Implement voluntary stopping of attacks.
- [x] Implement conquest and soldier rewards.
- [x] Implement soldier transfers between controlled countries.
- [x] Award reinforcements from round two onwards.
- [x] Implement player elimination and victory conditions.
- [x] Display every country and its soldier count.
- [x] Display battles, dice rolls, losses and outcomes.
- [x] Keep battle information visible during fast-forward.

## B. NPC requirements

- [x] NPCs evaluate the board and choose strategic actions.
- [x] NPCs choose attack targets and decide when to stop.
- [x] NPCs allocate reinforcements.
- [x] NPCs can transfer soldiers between controlled countries.
- [x] Display each NPC decision with a brief justification.
- [x] Display NPC decisions during fast-forward.

## C. AI requirements

- [x] Integrate an LLM/AI to generate dynamic battle commentary.
- [x] Keep AI commentary separate from the game rules.
- [x] Verify that AI failures do not corrupt the game state.

A previous milestone recorded a real Gemini response; subsequent verification
uses mocks and demo Firestore. Ongoing-phase sampling and outcomes work at all
playback speeds, but provider latency, coalescing and quotas mean not every
battle receives commentary. Production generation/remaining quota need separate
acceptance evidence; see [GEMINI_COMMENTARY.md](GEMINI_COMMENTARY.md).

## D. Accounts and access control

- [x] Allow visitors to sign up.
- [x] Allow authenticated users to play their own games.
- [x] Allow visitors to view shared gameplay.
- [x] Prevent visitors from taking another player's turn.
- [x] Apply appropriate database permissions.

## E. Database and architecture

- [x] Use a NoSQL database.
- [x] Separate database operations from the rest of the application.
- [x] Connect the application to an online database.
- [x] Design a suitable database structure.
- [x] Use clear, maintainable code and appropriate
      object-oriented concepts.
- [x] Validate inputs and handle errors.
- [x] Support saving and retrieving game data.

## F. Interface and usability

- [x] Provide a clear, navigable user interface.
- [x] Display country ownership and soldier counts clearly.
- [x] Support viewing, listing and selecting games or countries.
- [x] Implement searching and filtering where appropriate.
- [x] Keep game actions and results understandable.

## G. Deployment and submission

- [x] Deploy the application online.
- [ ] Test the deployed application.
- [ ] Prepare the source-code ZIP.
- [x] Provide the deployed application URL.
- [ ] Provide application login credentials.
- [ ] Provide the required assessor database access.
- [x] Prepare the README with setup and running instructions.
- [ ] Verify all submission files.
- [ ] Submit through the INF4001N Amathuba assignment folder.

Live URL supplied by the owner: [uct-inf-4001-n.vercel.app](https://uct-inf-4001-n.vercel.app).
Deployment existence is distinct from final acceptance of the latest commit.
Application credentials and assessor database access must be provided privately,
not embedded in this checklist or source archive.

## H. Marking rubric — 14 criteria, 56 marks

Evidence for all 14 criteria is available below. These entries do not certify
full marks or resolve interpretation questions about commentary coverage or the
curated 55-country selection list.

| Criterion | Repository evidence |
| --- | --- |
| Database layer | `src/services/gameRepository.js`, `firebase.js` |
| Connection to database | Firebase SDK initialization, repository transactions/listeners, emulator tests; live acceptance remains separate |
| Database design | `gameStorage.js`, versioned core, append-only histories, `firestore.indexes.json` |
| Coding structure | Separate components, hooks, engine, services and server modules |
| Object-oriented concepts | `GameRepository`, private fields/helpers, bound public methods and injected database |
| Data validation, controls and security | Engine/storage validation, `firestore.rules`, commentary request/fact checks |
| Functionality | Engine, session and browser regression tests |
| Lists, searching, filtering and viewing | Country filtering, saved-game library, map/list and commentary history |
| User interface | Responsive map, flags, turn controls and activity panels |
| Ease of navigation | Setup/return flow, saved sessions and accessible history controls |
| Authentication and authorisation | `useAuth.js`, owner checks, restricted writer and spectator rules |
| Sophistication and complexity | Combat, strategic NPCs, persisted stepwise playback and live spectators |
| AI application | Server-side Gemini, ongoing/outcome sampling, validation and persistence; coverage is quota-limited |
| Overall evidence of effort | Modular implementation, sourced assets/populations and automated coverage |

## I. Optional bonus feature

Live spectator updates and browsable battle/NPC/commentary histories are
implemented. These are evidence for assessment, not a claim that bonus marks
have been awarded; full game replay, analytics and LLM-controlled NPCs are not implemented.
