# 🐝 Hive Colony

**A community survival simulation for Reddit.** The whole subreddit shares one colony — every member is a colonist, and the community has to work together to keep it alive, grow it, and build its wonder before someone lets it starve.

Built on [Reddit's Devvit platform](https://developers.reddit.com/), so it runs right inside a Reddit post. No app to install, no account but Reddit's own.

![status](https://img.shields.io/badge/status-in%20development-orange) ![platform](https://img.shields.io/badge/platform-Reddit%20Devvit-ff4500) ![stack](https://img.shields.io/badge/stack-React%20%2B%20TypeScript%20%2B%20Hono-blue)

---

## What it is

Reddit games are usually single-player, played for a minute and forgotten. Hive Colony is different: **there is one colony per subreddit**, and everyone who opens the post is playing in the same world, at the same time, toward the same outcome.

- Pick a role, work shifts, and watch the colony's resources rise or fall in real time.
- Vote with the rest of the subreddit on laws that trade one resource for another.
- Build and upgrade an isometric colony on a shared map that everyone sees change.
- Survive storms, fevers, and meteor showers — or don't, and watch the colony collapse.
- Grow the island, then race to complete **the Great Hive**, a 5-stage wonder that wins the game for everyone who helped build it.

## How to play

1. **Open the post** in your subreddit and tap **Join the Hive**.
2. **Pick a role** — each one feeds the colony differently:

   | Role | What it does |
   |---|---|
   | 🌾 Farmer | Grows food |
   | ⛏️ Miner | Digs up materials (uses a little energy) |
   | 🏗️ Builder | Places and upgrades buildings on the map |
   | 🔬 Scientist | Generates energy and research |
   | 🧭 Explorer | Random finds — food, materials, energy, or a lost colonist |

3. **Work shifts.** Each shift is a quick 10-second tap mini-game — hit your role's target, dodge the 🦂 decoys. Play well for up to ×1.5 output.
4. **Spend stamina.** You get 5 stamina, refilling one point every 4 minutes — enough for a burst of shifts, then a reason to come back later. (Builders spend stamina placing or upgrading instead of playing the mini-game.)
5. **Vote on laws.** A new proposal opens every 6 hours — Food Rationing, Mandatory Overtime, Weekly Festivals, Science First, Austerity — each a real trade-off, decided by majority vote.
6. **Build the map.** Builders place Shelters, Farms, Mines, Solar Arrays, and Labs on a shared isometric map, and can upgrade any building up to level 3.
7. **Survive events.** Storms damage buildings, fevers cost colonists (unless your labs are strong enough), meteor showers and traders bring in resources, refugees show up looking for a home.
8. **Expand the island** once 70% of it is built, growing from 8×8 up to 12×12.
9. **Build the Great Hive.** Unlocks at 30 colonists and 300 research. Five stages, paid for in materials by the whole community. Complete it and:
   - Everyone who worked that colony earns a permanent 🏆 badge.
   - The win is recorded in the subreddit's **Hall of Fame**.
   - Anyone can start **New Game+** — a fresh colony with a permanent production bonus.

If the colony's population hits zero, it collapses — and anyone can found the next one.

## Features

- **Real-time shared state** — every player sees the same colony, synced through Redis, ticking forward every 10 minutes even when no one's looking.
- **Animated isometric map** — hand-drawn buildings on an HTML canvas, no image assets, no game engine. Day/night cycle, weather, growing crops, smoking mines, a pulsing Hive Core.
- **Shift mini-games** — a fast tap challenge themed to each role, with output scaled by how well you play.
- **Community voting** — laws that change the rules for everyone, decided democratically.
- **Procedural audio** — synthesized sound effects and generative background music via the Web Audio API. No audio files.
- **A real endgame** — island expansion and the Great Hive wonder give the colony something to work toward and a way to win, instead of running forever with nothing left to do.
- **New Game+** — completed colonies hand a permanent bonus to the next one.

## Tech stack

| Layer | Tech |
|---|---|
| Platform | [Devvit](https://developers.reddit.com/) (Reddit's developer platform) |
| Client | React 19, TypeScript, Tailwind CSS 4, Vite |
| Server | Hono, running in Devvit's serverless environment |
| State | Redis (via `@devvit/web/server`) |
| Map rendering | HTML5 Canvas (hand-written isometric renderer, no game engine) |
| Audio | Web Audio API (synthesized — no audio files) |

## Project structure

```
src/
  client/
    game.tsx         # main game screen (expanded view)
    splash.tsx        # feed card (inline view)
    MiniGame.tsx       # the tap mini-game
    map/
      IsoMap.tsx       # canvas render loop, input handling
      draw.ts          # procedural building/terrain/weather drawing
      iso.ts           # isometric grid math
    sound.ts           # sound effects (Web Audio)
    music.ts            # generative background music
    useColony.ts        # client-side data/state hook
  server/
    core/
      sim.ts            # the simulation: ticks, shifts, events, votes
      colony.ts          # Redis storage, leaderboards, Hall of Fame
      post.ts            # creates the Reddit post
    routes/
      api.ts             # /api/* endpoints (state, shift, vote, role, refound)
      menu.ts             # subreddit mod menu actions
      triggers.ts          # on-install trigger
  shared/
    game.ts              # game constants, types, and pure derived values
    api.ts                 # shared request/response types
```

The simulation core (`sim.ts`) and all shared game logic (`shared/game.ts`) are plain TypeScript with no Devvit imports, so they can be tested outside the platform.

## Getting started

You'll need **Node.js 22+** and a Reddit account connected to [developers.reddit.com](https://developers.reddit.com/).

```bash
# Install dependencies
npm install

# Log in to Devvit
npm run login

# Start a live playtest (installs to your test subreddit, hot-reloads on save)
npm run dev
```

`npm run dev` prints a playtest link — open it to see and play the game on Reddit.

### Other commands

| Command | What it does |
|---|---|
| `npm run build` | Builds the client and server |
| `npm run deploy` | Uploads a new private app version |
| `npm run launch` | Submits the app for Reddit review (makes it public) |
| `npm run type-check` | Type-checks the whole project |
| `npm run lint` | Lints the whole project |

## How the simulation works

- The colony's clock advances in 10-minute **ticks**. There's no background cron job — instead, whenever anyone loads the colony, the server catches it up on every tick it missed since the last time someone looked (capped at 3 days, so an abandoned colony can't simulate forever in one request).
- Each tick: colonists eat, buildings consume energy, maintenance is due every 6 hours, a random event has a small chance to fire, growth happens if conditions are good, and any law vote that's timed out gets resolved.
- Writes to the shared colony state go through a Redis `WATCH`/`MULTI`/`EXEC` transaction, retried on conflict, so two players acting at the same moment can't silently overwrite each other.

## License

BSD-3-Clause (inherited from the Devvit React starter this project began from).
