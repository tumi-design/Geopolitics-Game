# Gameplay and presentation

This folder connects the game's interface to its rules and controls how turns, NPC playback and battle commentary are presented. The [main README](../../README.md) explains how to install and play the application.

## How the gameplay works

Each game has one human player and nine computer-controlled opponents (NPCs). The ten participating countries take turns in a random order.

- **Your turn:** From round two, allocate your reinforcements before attacking or ending your turn. You may transfer soldiers between countries you own when you are not attacking.
- **Attacking:** Select one of your countries and an opposing country. You can start one attack per turn, roll through multiple combat phases, or stop the attack. Countries do not need to share a border.
- **Conquest:** Defeating all defenders earns bonus soldiers. Choose how many soldiers occupy the captured country, leaving at least one soldier in each country.
- **End of game:** You win by controlling all ten countries. If you lose your last country, your game ends in defeat.

## NPCs and game activity

NPCs use programmed strategies to decide where to attack, reinforce and transfer soldiers. Their actions and reasons appear in **Live Activity** and the saved history; Gemini does not control their decisions.

NPC turns play step by step. You can pause playback or change its speed to **1×, 2× or 4×** without skipping the underlying actions. Battle history preserves dice rolls, soldier losses and outcomes as new events appear. NPC playback runs while the owner's active game is open; it does not continue on a server after the owner closes the game.

Game progress and histories are saved in **Cloud Firestore** and can be restored from **Saved games**. Spectators can follow a shared game but cannot make moves.

The separate **Gemini Commentary** panel displays AI-generated descriptions of selected ongoing and completed battles. Saved commentary can be revisited, but generation depends on scheduling and API limits. It does not affect the actual battle results. See [GEMINI_COMMENTARY.md](../../GEMINI_COMMENTARY.md).

## Main files

| File | Purpose |
| --- | --- |
| `gameSession.js` | Connects interface actions to the game engine and checks which actions are allowed. |
| `commentaryEvents.js` | Selects battle events that are eligible for commentary. |
| `commentaryScheduler.js` | Manages automatic commentary requests and pacing. |
| `../hooks/useGameSession.js` | Coordinates the active game, saved state and NPC playback. |
| `../components/TurnControls.jsx` | Provides reinforcement, attack, occupation and transfer controls. |
| `../components/PlaybackControls.jsx` | Provides pause and speed controls and displays playback status. |
| `../components/GameActivity.jsx` | Displays battles, dice results and NPC decisions. |
| `../engine/` | Contains the game rules, combat logic and NPC strategy. |

Country information and population sources are documented in the [country-data guide](../data/README.md). For the overall system design, see [ARCHITECTURE.md](../../ARCHITECTURE.md).
