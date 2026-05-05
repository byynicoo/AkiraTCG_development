# Ascendants TCG

Ascendants TCG is a cyberpunk trading card game prototype inspired by fast tactical card duels. The current build is a browser-first HTML/CSS/JavaScript app with animated battles, local accounts, card collection, deck building, profile progression, bot duels and ranked-ready systems.

The project is currently an alpha prototype. It is playable locally and deployable as a static web app, but true online multiplayer still needs a backend realtime layer.

## Current Status

Version target: `0.1.x alpha`

Core loop status: playable prototype

Hosting target: Vercel static frontend

Online multiplayer status: planned backend work required

Desktop build status: experimental Windows WebView2 build exists, but web deployment is the current priority

## Current Features

- Account shell with signup, login and logout using browser local storage.
- Cyberpunk UI with black, white, neon green and vivid purple visual direction.
- Animated battle screen with card clashes, winner emphasis, loser effects, round banners and game-over modal.
- Background music support with mute toggle in the top HUD.
- Eddies wallet display and local reward logic.
- Profile section with bio, avatar upload, ranked stats, winrate blocks and recent match history.
- Collection section with owned cards, faction filters and card inspector.
- Deck Lab with deck creation, deck renaming, active deck selection, owned-card deck building and favorite cards.
- Store section scaffold with wallet and pack-ready structure.
- Rulings section with ordered rules and mini tutorial cards.
- Bot duels.
- Normal room flow for local/browser-based testing.
- Ranked matchmaking shell using local rooms.
- Leaderboard idea and ranked tier structure.
- Vercel deployment config.

## Current Duel Rules

- Each player uses an 8-card deck.
- At match start, 4 random cards are drawn into the battle hand.
- Matches can last up to 8 rounds.
- Each player starts with 21 Life.
- Each player starts with 18 Pills.
- Each round has a 30-second decision timer.
- If the timer reaches 0, any player who has not chosen a card auto-locks a random card with 0 extra Pills.
- Attack equals `Power * committed Pills`.
- Each card always commits 1 base Pill.
- Extra Pills can be added before locking the card.
- Fury costs 3 Pills and adds 2 damage if the card wins.
- If attacks are tied, there is no star tiebreaker: both players lose 1 Life and the round is a draw.
- If a player reaches 0 Life, the match ends.
- If round 8 resolves and both players are still alive, the player with more Life wins.
- After round 4, if all 4 hand cards were used, cards recycle for rounds 5 to 8.

## Current Card Data

Cards are defined in:

```text
js/data.js
```

Card artwork is loaded from:

```text
img/
```

Current first card:

```text
Jason Tornn
Expansion: XSP-01
Faction: Blaze
Power: 5
Damage: 5
Rarity: 3
Bonus: If this card wins: DMG +1
Ability: If this card loses, your opponent loses 1 Pill.
```

Current starter deck:

```text
8x Jason Tornn
```

This is temporary until the official card set is added.

## Factions

The current founding factions are:

- Blaze
- Flux
- Void Fall
- Edgerunners

Internal legacy IDs may still exist in code for compatibility with saved local decks, but the public-facing faction names should remain the names above.

## Economy

Currency name: `Eddies`

New account starting balance:

```text
100 Eddies
```

Current reward rules:

- Bot match: 0 Eddies
- Normal win: 15 Eddies
- Normal loss: 10 Eddies
- Normal draw: 10 Eddies
- Ranked win: 25 Eddies
- Ranked loss: 10 Eddies
- Ranked draw: 10 Eddies

## Ranked System

Current MMR rules:

- Bot match: 0 MMR
- Normal match: 0 MMR
- Ranked win: +25 MMR
- Ranked loss: -18 MMR
- Ranked draw: 0 MMR

Current tiers:

- 0-150 MMR: Newbie
- 151-215 MMR: Cyber Thug
- 216-315 MMR: Activist
- 316-450 MMR: Hacker
- 451-550 MMR: Noble
- 551-650 MMR: Cyber Commander
- 651+ MMR: Cyber Elite

Ranked wins, losses and played count are tracked locally.

## Crazyart Plan

Crazyart variants are planned as rare alternate art versions for cards with 4 or 5 stars.

Planned behavior:

- Same gameplay card.
- Different collection presentation.
- Purple neon border treatment.
- Shown before normal cards in collection sorting.
- Intended pack drop rate: 2%.

Current status: data/UI concept exists, pack opening is not implemented yet.

## Local Persistence

The current app stores data in browser local storage:

- Users
- Session
- Profile
- Avatar
- Collection
- Decks
- Match history
- Local rooms
- Settings

This is useful for prototyping, but it is not secure and not shared between devices.

## Multiplayer Reality Check

The current multiplayer is not true online multiplayer.

Current sync uses:

- `localStorage`
- `BroadcastChannel`

This works for local testing and same-browser/same-device flows, but it does not connect players across different PCs.

To support real multiplayer online, the project needs an authoritative backend or realtime database.

Recommended backend path:

- Vercel for frontend hosting.
- Supabase for auth, database, realtime rooms, profiles, collections, decks, ranked data and leaderboard.

Alternative backend paths:

- Firebase Realtime Database or Firestore.
- Custom Node.js WebSocket server on Railway, Render, Fly.io or a VPS.

Vercel alone is not ideal for persistent WebSocket game rooms.

## Recommended Online Architecture

Phase 1:

- Keep frontend on Vercel.
- Move users and profiles to Supabase Auth/Postgres.
- Move decks and collection to Supabase tables.
- Move rooms and match state to Supabase Realtime.
- Keep battle resolution in client temporarily.

Phase 2:

- Move battle resolution server-side.
- Add anti-cheat validation for Pills, hand, deck and card ownership.
- Add true matchmaking queues.
- Persist ranked results.
- Build global leaderboard from ranked records.

Phase 3:

- Add pack opening and store inventory.
- Add card ownership transactions.
- Add crazyart drops.
- Add seasons, rewards and ranked resets.

## Vercel Deployment

The project includes:

```text
vercel.json
.vercelignore
```

For Vercel, deploy the static web files:

```text
index.html
styles.css
js/
img/
vercel.json
.vercelignore
```

Do not upload desktop builds, EXE files or `dist/` to Vercel.

If uploading through GitHub web UI, use the prepared lightweight folder:

```text
vercel_upload/
```

That folder contains only the web deployment files.

CLI deployment:

```powershell
cd "C:\Users\nicolo.morando\Documents\New project\tcg_game\vercel_upload"
vercel --prod
```

If deploying from the main project folder:

```powershell
cd "C:\Users\nicolo.morando\Documents\New project\tcg_game"
vercel --prod
```

Make sure the Vercel project root contains `index.html` and `vercel.json`.

## Local Browser Run

Use the local server:

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

If using the bundled Codex Node runtime:

```powershell
& "C:\Users\nicolo.morando\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\server.js
```

## Desktop Build

The desktop build is experimental and separate from web hosting.

Existing desktop-related files:

```text
desktop/
dist/
AkiraTCG.exe
launcher.cs
publish-desktop.ps1
```

These should not be uploaded to Vercel or GitHub unless the repository is explicitly intended to include desktop distribution files.

## Known Limitations

- Online multiplayer is not implemented yet.
- Auth is local only and not secure.
- User data is stored in local storage.
- Leaderboard is not truly global yet.
- Store has no real packs yet.
- Crazyart drop logic is planned but not implemented.
- Only one real card is currently defined.
- Bot AI is simple.
- Match validation is client-side.
- Large tutorial/reference images should be optimized before adding back to the repo.

## Roadmap

### Milestone 1: Web Deployment

- Keep repository lightweight.
- Deploy static frontend to Vercel.
- Confirm all image, CSS and JS paths work in production.
- Remove old Akira references from deployment assets where still present.
- Add production smoke-test checklist.

### Milestone 2: Card Set Foundation

- Add official XSP-01 cards.
- Add card IDs, faction, rarity, power, damage, bonus, ability and art paths.
- Add faction filtering for all new cards.
- Add more balanced starter decks.
- Add card inspector polish for multiple rarities and crazyart variants.

### Milestone 3: Battle Polish

- Improve battle animation timing and readability.
- Add faction-specific animation profiles.
- Add stronger win/loss feedback.
- Add cleaner HUD states for waiting, locked, resolving and finished.
- Add mobile battle layout pass.

### Milestone 4: Backend Prototype

- Add Supabase project.
- Replace local signup/login with Supabase Auth.
- Store profiles in Postgres.
- Store collection and deck data in Postgres.
- Store match history in Postgres.
- Add realtime room state sync.

### Milestone 5: Real Multiplayer

- Create public and private rooms.
- Add ready checks.
- Sync both players across different devices.
- Hide opponent hand until cards are revealed.
- Validate legal card selection and Pills spend.
- Handle disconnect/reconnect.
- Add timeout auto-play server-side.

### Milestone 6: Ranked and Leaderboard

- Add ranked matchmaking queue.
- Persist ranked MMR.
- Persist ranked wins/losses.
- Build global leaderboard with real players only.
- Add tier icons and season metadata.
- Prevent bot/normal matches from changing MMR.

### Milestone 7: Store and Economy

- Add pack definitions.
- Add pack purchase with Eddies.
- Add card drop tables.
- Add crazyart 2% drop logic.
- Add duplicate handling.
- Add transaction history.

### Milestone 8: Production Hardening

- Move battle resolution server-side.
- Add anti-cheat checks.
- Add database row-level security.
- Add rate limits.
- Add error reporting.
- Add automated tests for battle rules.
- Add deployment previews.

## Project Structure

```text
index.html          App entry point
styles.css          Main visual system and animations
server.js           Local static server
js/app.js           UI rendering, interactions and app state
js/data.js          Cards, factions, rules and constants
js/engine.js        Duel engine and round resolution
js/sync.js          Local storage/session/room sync
img/                Card art and UI assets
assets/             Optional reference/tutorial assets
vercel.json         Vercel static hosting config
.vercelignore       Deployment ignore rules
.gitignore          Repository ignore rules
vercel_upload/      Lightweight folder prepared for web upload
```

## Development Notes

- Keep the public name as `Ascendants TCG`.
- Do not reintroduce `Akira` branding into the active web app.
- Keep public faction names as `Blaze`, `Flux`, `Void Fall` and `Edgerunners`.
- Avoid committing desktop build outputs unless specifically preparing a release.
- Optimize large images before adding them to the production repo.
- Treat local storage as prototype-only persistence.
