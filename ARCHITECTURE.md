# UCT INF4001N — Application Architecture

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
- AI-generated battle commentary: Gemini API, subject to
  verification of access, limits and acceptable usage.

## 3. Application structure

src/
  components/   Reusable interface components
  pages/        Main application screens
  engine/       Game rules, combat and NPC strategy
  services/     Database, authentication and API services
  data/         Country and population data
  utils/        Shared helper functions

api/
  battle-commentary.js   Server-side AI commentary endpoint

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

- Develop and test locally using Vite.
- Store source code in the private GitHub repository.
- Deploy the application through Vercel.
- Connect the deployed application to Firebase.
- Configure production environment variables securely.
- Test the deployed application before submission.

## 8. Implementation status

Current status:
- React/Vite starter application created and running locally.
- Git repository initialised.
- Starter application pushed to GitHub.
- Requirements checklist created and pushed.

The game, database, authentication, AI integration and
deployment have not yet been implemented or verified.