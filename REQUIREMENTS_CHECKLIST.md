# UCT INF4001N — Project Requirements and Marking Criteria

This document shows how my **Geopolitics Game** addresses the entrance examination requirements and where the assessor can find evidence in the source code.

**Live application:** [Play Geopolitics](https://uct-inf-4001-n.vercel.app)

## Implemented requirements

- **Game setup:** One human player chooses a country; nine NPC countries are selected randomly from a catalogue of 55. Starting soldiers follow the prescribed population thresholds, and turn order is randomised.
- **Gameplay:** The game supports one initiated attack per turn, consecutive dice phases, soldier losses and ties, stopping an attack, conquest rewards, occupation, transfers, reinforcements from round two, elimination and victory.
- **NPCs:** Opponents assess army strength and potential targets, allocate soldiers, transfer armies and decide whether to continue attacking. Their actions and explanations are recorded, including during 1×, 2× and 4× playback.
- **AI:** Gemini generates commentary for selected saved battle events. It does not control NPCs, roll dice or change game outcomes. Commentary is subject to API limits; gameplay continues without it.
- **Accounts and saving:** Firebase Authentication manages accounts. Cloud Firestore saves game state and histories, including ongoing attacks, and restores saved sessions after refresh.
- **Spectators:** Owners can enable a live, read-only sharing link. Other viewers cannot take turns, edit a game or request commentary.
- **Interface:** The app provides a world map, searchable country catalogue, soldier counts, game controls, saved-game selection and battle/NPC/commentary histories.

The detailed rules and instructions for playing are in [README.md](README.md).

## Marking criteria and evidence

| Criterion | Evidence in my application |
| --- | --- |
| **1. Database layer** | `src/services/gameRepository.js` manages Firestore operations. |
| **2. Database connection** | Firebase SDK, live listeners and transactions connect games to Cloud Firestore. |
| **3. Database design** | Versioned game documents and separate battle, NPC and commentary subcollections; `gameStorage.js`. |
| **4. Coding structure** | Separate `components/`, `hooks/`, `game/`, `engine/`, `services/` and `server/` modules. |
| **5. Object-oriented concepts** | `GameRepository` uses a class, private members, encapsulation and dependency injection. |
| **6. Validation and security** | Input/state checks, Firestore rules, ownership restrictions and server-side commentary validation. |
| **7. Functionality** | Complete turn, attack, conquest, reinforcement, saving and victory workflows. |
| **8. Lists, search, filtering and viewing** | Country search, saved-game list, world map and activity/commentary histories. |
| **9. User interface** | Interactive map, flags, soldier counts, battle controls and activity panels. |
| **10. Navigation** | Game setup, saved sessions, gameplay controls and accessible history selection. |
| **11. Authentication and authorisation** | Firebase login, owner-only changes and read-only spectators. |
| **12. Complexity** | Strategic NPCs, multi-phase combat, reliable cloud saves and live spectator updates. |
| **13. AI application** | Gemini commentary through `api/battle-commentary.js`, with validated events and saved results. |
| **14. Evidence of effort** | Working deployment, modular code, sourced country data, automated tests and documentation. |

## Testing and deployment

Completed development checks passed **159 standard tests, 12 Firebase emulator tests and 10 browser tests**, as well as ESLint and the production build. The build reports a non-blocking bundle-size warning.

The application is deployed on Vercel at the link above. Application login credentials and assessor database access are supplied separately with the submission.

For implementation details, see [ARCHITECTURE.md](ARCHITECTURE.md), [FIREBASE_SETUP.md](FIREBASE_SETUP.md) and [GEMINI_COMMENTARY.md](GEMINI_COMMENTARY.md). This document identifies evidence for assessment.
