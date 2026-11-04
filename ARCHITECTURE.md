# UCT INF4001N — Web Application Architecture

I built **Geopolitics** as a single-player strategy web application using React, Firebase and Vercel. My main design decision was to separate **game rules, interface components, database access and AI commentary**, so that each part can be tested and maintained independently.

**Live application:** [Play Geopolitics](https://uct-inf-4001-n.vercel.app)

## Technologies and project structure

| Technology | Purpose |
| --- | --- |
| React and JavaScript | Built the interactive game interface and its components |
| Vite | Ran the project locally and created production builds |
| React Leaflet / Leaflet | Displayed the interactive world map |
| Firebase Authentication | Managed account registration, login and authentication sessions |
| Cloud Firestore | Stored games, player progress, histories and commentary in a NoSQL database |
| Vercel | Hosted the web application and its server-side API function |
| Gemini API (`@google/genai`) | Generated commentary based on recorded battle events |
| Node.js tests, Firebase emulators and Playwright | Tested the game logic, database integration and browser behaviour |
| ESLint | Checked the JavaScript code for issues |
| Git and GitHub | Managed changes to the source code |

## Game engine and NPCs

The engine in `src/engine/` manages turn order, soldiers, dice battles, reinforcements, transfers, conquest and victory. It validates actions before updating a game. Randomness is limited to mechanics such as country selection, turn order and dice rolls.

The nine NPCs use programmed strategies to assess targets, army strength and possible rewards. Their decisions and explanations are recorded. **Gemini does not decide NPC moves or battle outcomes.**

## Object-oriented database access

I implemented a `GameRepository` class in `src/services/gameRepository.js`. It receives a Firestore connection through its constructor (**dependency injection**) and keeps its internal state in private members such as `#database` and `#gameRef()`.

Its public `create`, `update`, `watch`, `watchList` and `remove` methods give the rest of the application a consistent way to work with saved games. This demonstrates **encapsulation** while keeping Firestore operations separate from the UI and game engine.

`gameStorage.js` validates and prepares saved game state. Firestore transactions, revision checks and mutation IDs help prevent outdated updates or duplicate saves. Battle and NPC histories are stored in separate subcollections so they can grow without enlarging the main game document indefinitely.

## Authentication and security

Firebase Authentication identifies players. Games are private by default; owners can enable read-only live spectator links. Firestore security rules restrict changes to authorised owners and control access to shared games.

These rules enforce database permissions, **not** the full gameplay logic contained in the saved state. The application is a single-player game with spectators, not a server-authoritative multiplayer system.

## Gemini integration

The React app sends an eligible saved battle event ID to `api/battle-commentary.js`. The server verifies the owner and recorded battle facts, requests Gemini commentary and stores accepted text in a separate Firestore subcollection.

The Gemini API key and restricted commentary writer credentials remain server-side. Commentary is rate-limited, may not be available for every battle and **never changes the game result**.

## Deployment and testing

I used GitHub for source control and Vercel for hosting. Completed checks passed **159 standard tests, 12 Firebase emulator tests and 10 browser tests**, plus ESLint and the production build.

See [README.md](README.md) for gameplay and setup, [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for database details and [GEMINI_COMMENTARY.md](GEMINI_COMMENTARY.md) for AI implementation.
