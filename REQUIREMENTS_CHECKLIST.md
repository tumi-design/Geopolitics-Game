# UCT INF4001N — Marksheet Requirements Checklist

Deadline: 6 November 2026, 23:00

Status key:
- [ ] Not started
- [x] Implemented and verified

## A. Core game requirements

- [ ] Create a new game with 10 countries, including the player's country.
- [ ] Randomly select the other 9 countries.
- [ ] Allocate starting soldiers according to population.
- [ ] Randomise the first player and manage turn order.
- [ ] Implement attack and skip-turn actions.
- [ ] Implement dice combat, soldier losses and ties.
- [ ] Enforce the requirement to leave at least one soldier behind.
- [ ] Implement voluntary stopping of attacks.
- [ ] Implement conquest and soldier rewards.
- [ ] Implement soldier transfers between controlled countries.
- [ ] Award reinforcements from round two onwards.
- [ ] Implement player elimination and victory conditions.
- [ ] Display every country and its soldier count.
- [ ] Display battles, dice rolls, losses and outcomes.
- [ ] Keep battle information visible during fast-forward.

## B. NPC requirements

- [ ] NPCs evaluate the board and choose strategic actions.
- [ ] NPCs choose attack targets and decide when to stop.
- [ ] NPCs allocate reinforcements.
- [ ] NPCs can transfer soldiers between controlled countries.
- [ ] Display each NPC decision with a brief justification.
- [ ] Display NPC decisions during fast-forward.

## C. AI requirements

- [ ] Integrate an LLM/AI to generate dynamic battle commentary.
- [ ] Keep AI commentary separate from the game rules.
- [ ] Verify that AI failures do not corrupt the game state.

## D. Accounts and access control

- [ ] Allow visitors to sign up.
- [ ] Allow authenticated users to play their own games.
- [ ] Allow visitors to view shared gameplay.
- [ ] Prevent visitors from taking another player's turn.
- [ ] Apply appropriate database permissions.

## E. Database and architecture

- [ ] Use a NoSQL database.
- [ ] Separate database operations from the rest of the application.
- [ ] Connect the application to an online database.
- [ ] Design a suitable database structure.
- [ ] Use clear, maintainable code and appropriate
      object-oriented concepts.
- [ ] Validate inputs and handle errors.
- [ ] Support saving and retrieving game data.

## F. Interface and usability

- [ ] Provide a clear, navigable user interface.
- [ ] Display country ownership and soldier counts clearly.
- [ ] Support viewing, listing and selecting games or countries.
- [ ] Implement searching and filtering where appropriate.
- [ ] Keep game actions and results understandable.

## G. Deployment and submission

- [ ] Deploy the application online.
- [ ] Test the deployed application.
- [ ] Prepare the source-code ZIP.
- [ ] Provide the deployed application URL.
- [ ] Provide application login credentials.
- [ ] Provide the required assessor database access.
- [ ] Prepare the README with setup and running instructions.
- [ ] Verify all submission files.
- [ ] Submit through the INF4001N Amathuba assignment folder.

## H. Marking rubric — 14 criteria, 56 marks

- [ ] Database layer
- [ ] Connection to database
- [ ] Database design
- [ ] Coding structure
- [ ] Object-oriented concepts
- [ ] Data validation, controls and security
- [ ] Functionality
- [ ] Lists, searching, filtering and viewing
- [ ] User interface
- [ ] Ease of navigation
- [ ] Authentication and authorisation
- [ ] Sophistication and complexity
- [ ] AI application
- [ ] Overall evidence of effort

## I. Optional bonus feature

- [ ] Decide whether time permits one additional feature.