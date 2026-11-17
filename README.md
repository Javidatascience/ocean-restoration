# Ocean Restoration 🏝️

A cozy, mobile-first incremental / idle game. You start on a small polluted beach, pick up trash by hand,
recycle it into coins, buy better gear, automate the cleanup and watch the ecosystem come back to life.

The point is not just bigger numbers: the water turns turquoise, palms and seagrass grow back, coral appears
and twelve animals return one by one as the beach recovers.

## Play

- **Sweep**: touch and drag to walk; you pick up every piece of trash inside your tool's reach (the dashed ring).
  Waste goes to storage, the recycler turns it into coins.
- **Sectors**: the coast is a 3×4 grid. You start with two sectors; tap the fog to open a neighbouring one.
  Sweep a sector completely clean for a bonus. Cleaned sectors keep getting a little tide trash.
- **Equipment**: sweeping tools (broom → mega sweeper), quick boots, a boat (rowboat → skimmer) that opens the
  sea sectors, plus grabber, bag, net and five tiers of recycling infrastructure.
- **Automation**: workers, electric beach cleaners, boats, floating collectors, vessels, drones and ocean robots.
  Every unit you buy is visible working in the scene. Buy ×1, ×10 or Max.
- **Research**: spend Ocean Reputation in three branches (Cleanup, Automation, Ecology).
- **Goals**: a chain of small objectives at the bottom of the screen; tap to claim the coin reward.
- **Message in a bottle**: now and then a glowing bottle drifts in. Tap it for a coin bonus.
- **Ocean Map**: the Tropical Beach is fully playable; the other five regions are locked destinations.
- **Offline**: helpers keep working while you are away (50% for up to 8 h; research raises it to 100% / 16 h).

No timers, energy, ads or daily-login pressure. Progress is saved in the browser (`localStorage`).

## Develop

Requires Node 22.18+.

```bash
npm install
npm run dev       # local dev server
npm test          # unit tests for the economy
npm run balance   # bot that plays the economy and prints a progression timeline
npm run build     # type-check + production build into dist/
```

Pushing to `main` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).

## Structure

```
src/core/content.ts   all game data: upgrades, units, recyclers, research, animals, regions
src/core/sim.ts       pure rules: rates, costs, purchases, restoration, offline progress
src/core/state.ts     save format + localStorage persistence
src/scene/sprites.ts  procedural canvas sprites (no image assets)
src/scene/scene.ts    the living beach: trash, units, animals, effects
src/ui/               HUD, bottom navigation, sheets, toasts, modals
src/audio.ts          synthesised sound effects and ambient surf
tools/balance.ts      economy simulator
```

Adding a region means adding data in `content.ts` and a scene for it; the rules in `sim.ts` are region-agnostic
apart from the restoration target.
