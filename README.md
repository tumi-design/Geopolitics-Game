# UCT INF4001N Geopolitics Game

**Campus ID / Student number: MNTMAT026**

A single-player strategy web application developed for the University of Cape Town's entrance examination as part of my application to the 2027 BCom Honours in Information Systems programme. Choose a country, compete against nine strategic non-player characters (NPCs), and conquer all ten participating countries.

**Live application:** [Play Geopolitics](https://uct-inf-4001-n.vercel.app)

## How to play

1. **Log in or create an account.** Assessors can use the test account provided separately with my submission.
2. **Choose your country.** Search the country list or select a country on the map. Nine other countries are selected at random to make up the ten participants.
3. **Follow the turn order.** The order is random. NPCs take their turns automatically, and their actions and reasons appear in the activity history. You can pause NPC playback or change its speed to 1×, 2× or 4×.
4. **Take your turn.** From the second round onwards, distribute your reinforcement soldiers first. You can then attack another country or end your turn without attacking.
5. **Attack and roll the dice.** Select one of your countries as the attacker and an opposing country as the target. You can keep rolling through several battle phases or stop the attack. You can start only one attack per turn.
6. **Conquer and occupy.** If you defeat all the defending soldiers, choose how many soldiers to move into the conquered country. You can also transfer soldiers between countries you already own when you are not attacking.
7. **Continue until the game ends.** You win by controlling all ten countries. You lose if all your countries are conquered.

The game automatically saves your progress to Firebase. Use **Saved games** to resume an existing game or start a separate one. Allow a save to finish before closing the page. You can also enable **Allow spectators with this link** and share the link with someone who wants to watch without playing.

**Live Activity** shows what is happening during the game, including NPC decisions and battle results. The separate **Gemini Commentary** section adds AI-generated descriptions of selected battle events. You can also read earlier commentary in its history.

## Game rules

Each game has **one human player, nine NPCs and ten different countries**. I used a catalogue of **55 real-world countries** for country selection. Their population figures are based on [Worldometer's 2026 estimates](https://www.worldometers.info/world-population/population-by-country/). Individual population records and source links are available in [`src/data/populations-2026.json`](src/data/populations-2026.json) and the [country-data guide](src/data/README.md).

### Starting soldiers

The number of soldiers a country starts with depends on its population:

| Population | Starting soldiers |
| --- | ---: |
| Up to 5 million | 1 |
| More than 5 million, up to 10 million | 2 |
| More than 10 million, up to 25 million | 3 |
| More than 25 million, up to 50 million | 4 |
| More than 50 million, up to 75 million | 5 |
| More than 75 million, up to 100 million | 6 |
| More than 100 million, up to 125 million | 7 |
| More than 125 million, up to 150 million | 8 |
| More than 150 million | 9 |

### Turns, battles and reinforcements

- **Turn order:** Countries take turns in a random order. Eliminated players are skipped.
- **Attacking:** A player can start one attack per turn, but it can include several rounds of dice rolls against the same country. Countries do not need to share a border to attack each other.
- **Dice:** The attacker needs at least two soldiers because one must remain behind. Both sides roll the same number of six-sided dice, based on the smaller of the attacker's available soldiers (excluding the one left behind) and the defender's soldiers. Dice are compared in the order rolled. The side with the lower die loses one soldier; ties cause no losses.
- **Winning a battle:** When all defending soldiers are defeated, the attacking country receives bonus soldiers equal to half the conquered country's original starting soldiers, rounded down, or at least two soldiers—whichever is greater. You then choose how many soldiers to move into the conquered country, leaving at least one soldier in each country.
- **Reinforcements:** Starting in round two, players receive **two soldiers for every country they own** at the beginning of their turn. These must be allocated before attacking or ending the turn.
- **Transfers:** Soldiers can be moved between two countries owned by the same player, as long as no attack is in progress and at least one soldier remains in the source country.
- **End of game:** A player is eliminated when they lose all their countries. The human player wins by conquering all ten.

The NPCs follow programmed strategies rather than making random decisions. They consider army strength, possible targets, conquest rewards and opportunities to eliminate opponents. Their decisions and explanations are recorded in the game history. **Gemini does not control the NPCs or decide battle outcomes**; the dice and game rules determine the results.

## Main features

- **Accounts and saved games:** Players can register, log in, create multiple games and resume saved progress. Games are private by default.
- **Automatic saving:** The game saves moves, armies, attacks, occupation choices and battle history to Cloud Firestore. Refreshing restores the last successfully saved state.
- **Spectator links:** A player can share a live, read-only view of a game, including with someone who does not have an account. Spectators cannot make moves, and the owner can turn sharing off again.
- **World map and country search:** Players can choose countries through the map or searchable list and see who controls each territory.
- **NPC activity and battle history:** The game records moves and explanations so players can follow what happened, including during faster playback.
- **AI battle commentary:** Gemini generates commentary for selected battle events. The text is saved with the game and can be viewed again later. Commentary depends on API availability and usage limits, so it may not appear for every battle. Gameplay continues normally without it.

These are **separate single-player games**, not multiplayer matches. Only the game's owner can play their turns and run NPC playback. NPCs do not continue playing in the background after the owner's active game view is closed.

## Technologies used

I built the frontend with **React, JavaScript and Vite**. The world map uses **React Leaflet**, with **Natural Earth** world-atlas map data and local flag icons. I used **Firebase Authentication** for login and **Cloud Firestore** as the NoSQL database for game data. The application is deployed on **Vercel**.

For the AI feature, the application sends requests to a server-side Vercel Function, which uses Google's **Gemini API** through the `@google/genai` SDK (configured as `gemini-3.5-flash-lite`). API credentials are stored on the server rather than included in the frontend. The commentary describes recorded game events; it does not change battle results.

### Where to find the code

| Folder or file | Purpose |
| --- | --- |
| `src/engine/` | Game rules, turns, dice, battles and NPC strategy |
| `src/game/` | Game actions and commentary scheduling |
| `src/components/` | Interface, map, controls and activity panels |
| `src/hooks/` | Login/session handling and live data updates |
| `src/services/gameRepository.js` | Class used to create, update, watch and delete saved games in Firestore |
| `src/services/gameStorage.js` | Checks and prepares saved game data |
| `src/data/`, `public/data/`, `public/flags/` | Country information, maps and flags |
| `api/battle-commentary.js`, `server/` | Server-side Gemini requests and usage limits |
| `tests/` | Automated tests |

I used a **`GameRepository` class** to keep the database operations together instead of spreading Firestore calls throughout the application. It has private fields and methods, with public methods for creating, updating, watching and deleting games. This is one example of how I applied object-oriented programming and encapsulation. More detail is available in [ARCHITECTURE.md](ARCHITECTURE.md).

## How to run the project locally

I used **Node.js 24 and npm** during development. From the project folder, run these commands in a PowerShell terminal:

```powershell
npm.cmd ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Open `.env.local` and add the Firebase web configuration for the project. All six `VITE_FIREBASE_*` values shown in `.env.example` are required for the frontend to connect to Firebase. Private server credentials are not included in the source code.

Start the application:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173/** in a browser.

To use Gemini commentary locally, configure the server-side API and start it in a **second PowerShell terminal**:

```powershell
npm.cmd run dev:api
```

The application works without generating new commentary. Full Firebase and Gemini setup instructions are available in [FIREBASE_SETUP.md](FIREBASE_SETUP.md) and [GEMINI_COMMENTARY.md](GEMINI_COMMENTARY.md). Using real Gemini credentials may consume the project's API allowance.

## Testing

I used automated tests to check the game rules, saving, Firebase integration and browser interactions. The project includes **Node.js tests, Firebase emulator tests, Playwright browser tests and ESLint**.

The main checks can be run with:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

During development, **159 standard tests, 12 Firebase emulator tests and 10 browser tests passed**, with no reported failures. ESLint and the production build also passed. The build produces a non-blocking warning about the size of the JavaScript bundle.

Instructions for running the Firebase emulator and browser tests are available in [FIREBASE_SETUP.md](FIREBASE_SETUP.md). These tests use a demo environment rather than the live database. Real Gemini tests consume API quota.

## Security and access

Games are private unless their owner enables sharing. Firestore security rules restrict who can view or change game data, and spectator access is read-only. Gemini requests are handled on the server using a dedicated account with restricted permissions.

The repository includes an `.env.example` file showing the required configuration names. **The submitted source ZIP contains no private passwords or API secrets.** The assessor's application login credentials and database access details **are provided separately with the submission**, as required by the examination brief.

## Additional documentation

- [REQUIREMENTS_CHECKLIST.md](REQUIREMENTS_CHECKLIST.md) — how the application addresses the examination requirements and marking criteria.
- [ARCHITECTURE.md](ARCHITECTURE.md) — application design and code structure.
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md) — database structure, security rules and testing setup.
- [GEMINI_COMMENTARY.md](GEMINI_COMMENTARY.md) — how Gemini commentary works and how it is configured.
- [src/game/README.md](src/game/README.md) — game engine and actions.
- [src/data/README.md](src/data/README.md) — country catalogue and population sources.
