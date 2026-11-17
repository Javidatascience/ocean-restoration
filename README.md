# Ocean Restoration 🏝️

A cozy, mobile-first cleaning game seen from above. A huge coast is covered in grime and litter, every last patch of
it. You start with a tiny dustpan and the camera right down at your feet. Each patch you sweep pays a few coins;
coins buy bigger tools, and as your tool grows the camera pulls back so you see (and clean) more of the coast at once.

## Play

- **Move**: touch anywhere and drag (a floating joystick), or tap a spot to walk there. Arrow keys / WASD on desktop.
- **Sweep**: everything inside your dashed ring is cleaned as you move. Clean sand and clear water show through.
- **Litter**: bottles, cans, tyres, barrels and ghost nets lie on top of the dirt and pay a bonus. The big ones need
  a bigger tool (a 🔒 badge tells you which).
- **Sectors**: the coast is a 10×20 grid (200 sectors). Tap a fenced sector next to your area to open it. Further
  sectors cost more and pay more. Get a sector to 97% and the last specks are swept for you, plus a bonus.
- **The sea**: the top third of the map is water. Buy the boat and you switch to it as soon as you drive in.
  Sea sectors pay 50% more.
- **Tools** (10): dustpan → hand broom → rake → push sweeper → sand sifter → buggy → tractor rake → sweeper truck →
  mega sifter → titan cleaner. Plus Quick Boots (speed), Sorting Skills (coins) and the Trash Magnet.
- **Helpers**: Sand Bots and Sea Drones clean open sectors by themselves, also while you are away (50%, up to 8 h).
- **Map**: the whole coast at a glance; tap to open sectors or walk to one. **Life**: 12 animals return as the coast
  gets cleaner, and you meet them on clean sand and in clear water.

No timers, energy, ads or daily-login pressure. Progress (including the dirt grid) is saved in the browser.

## Develop

Requires Node 22.18+.

```bash
npm install
npm run dev       # local dev server
npm test          # unit tests for the rules
npm run balance   # bot that plays the real grid and prints a progression timeline
npm run build     # type-check + production build into dist/
```

Pushing to `main` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).

## Structure

```
src/core/world.ts     map geometry: sectors, shoreline, dirt grid size, litter placement
src/core/content.ts   tools, upgrades, helpers, animals, goals
src/core/sim.ts       rules: sweeping, litter, costs, purchases, sector completion, offline helpers
src/core/state.ts     save format (dirt grid as a bitset) + localStorage
src/scene/scene.ts    camera, dirt layer (cell mask + debris texture), input, helpers, animals, minimap
src/scene/sprites.ts  procedural canvas sprites (no image assets)
src/ui/               HUD, minimap, bottom navigation, sheets, toasts, modals
tools/balance.ts      progression simulator
```
