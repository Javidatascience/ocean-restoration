// All game content as plain data: tools, upgrades, helpers, animals and goals.

export interface ToolDef {
  name: string;
  desc: string;
  /** Sweep radius in world pixels. */
  radius: number;
  /** Speed multiplier (bigger machines drive faster). */
  speed: number;
  cost: number;
  /** How the player looks while using it. */
  look: 'hand' | 'machine';
}

export const TOOLS: ToolDef[] = [
  { name: 'Dustpan', desc: 'A tiny dustpan and brush. Every journey starts somewhere.', radius: 4, speed: 1, cost: 0, look: 'hand' },
  { name: 'Hand Broom', desc: 'A proper broom. Twice the reach of the dustpan.', radius: 6, speed: 1, cost: 150, look: 'hand' },
  { name: 'Beach Rake', desc: 'Wide teeth that comb the sand clean in one pass.', radius: 9, speed: 1.05, cost: 1200, look: 'hand' },
  { name: 'Push Sweeper', desc: 'Spinning brushes on wheels. Push and watch the sand shine.', radius: 13, speed: 1.1, cost: 12000, look: 'hand' },
  { name: 'Sand Sifter', desc: 'A little electric machine that sifts the sand as it rolls.', radius: 18, speed: 1.25, cost: 70000, look: 'machine' },
  { name: 'Buggy Sweeper', desc: 'A beach buggy with a sweeper bar bolted on the front.', radius: 25, speed: 1.4, cost: 400000, look: 'machine' },
  { name: 'Tractor Rake', desc: 'A tractor towing a huge rake. Whole dunes in minutes.', radius: 34, speed: 1.6, cost: 2.2e6, look: 'machine' },
  { name: 'Sweeper Truck', desc: 'An industrial street sweeper, retrofitted for sand.', radius: 46, speed: 1.8, cost: 1.1e7, look: 'machine' },
  { name: 'Mega Sifter', desc: 'A rolling factory that leaves the beach spotless.', radius: 62, speed: 2, cost: 5.5e7, look: 'machine' },
  { name: 'Titan Cleaner', desc: 'The biggest beach cleaner ever built.', radius: 84, speed: 2.2, cost: 2.5e8, look: 'machine' },
];

export type UpgradeId = 'boots' | 'sorting' | 'magnet';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  desc: string;
  baseCost: number;
  growth: number;
  max: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'boots', name: 'Quick Boots', icon: '👟', desc: 'Move faster, on foot and at the wheel. +12% speed per level.', baseCost: 60, growth: 2.1, max: 15 },
  { id: 'sorting', name: 'Sorting Skills', icon: '♻️', desc: 'Separate what you sweep so more of it can be sold. +15% coins per level.', baseCost: 100, growth: 1.95, max: 25 },
  { id: 'magnet', name: 'Trash Magnet', icon: '🧲', desc: 'Pulls nearby pieces of litter towards you. Bigger pull per level.', baseCost: 400, growth: 3, max: 6 },
];

/** The boat lets you clean the sea. */
export const BOAT_COST = 40000;

export type HelperId = 'bot' | 'drone';

export interface HelperDef {
  id: HelperId;
  name: string;
  desc: string;
  baseCost: number;
  growth: number;
  max: number;
  /** Where it works. */
  sea: boolean;
}

export const HELPERS: HelperDef[] = [
  { id: 'bot', name: 'Sand Bot', desc: 'A little robot that cleans the beach sectors near you on its own, even while you are away.', baseCost: 600, growth: 1.6, max: 20, sea: false },
  { id: 'drone', name: 'Sea Drone', desc: 'Skims the water in the sea sectors near you, all day and all night.', baseCost: 60000, growth: 1.6, max: 20, sea: true },
];

export interface AnimalDef {
  id: string;
  name: string;
  desc: string;
  /** Percent of the whole map that must be clean. */
  at: number;
  /** Lives on clean sand or in clean water. */
  sea: boolean;
}

export const ANIMALS: AnimalDef[] = [
  { id: 'crab', name: 'Hermit Crab', desc: 'First to come back. Loves a tidy patch of sand to scuttle across.', at: 2, sea: false },
  { id: 'sandpiper', name: 'Sandpiper', desc: 'Runs about on the clean sand looking for snacks.', at: 6, sea: false },
  { id: 'gull', name: 'Seagull', desc: 'Circles overhead now that there is fish instead of plastic.', at: 12, sea: false },
  { id: 'starfish', name: 'Starfish', desc: 'Slow and steady. A sign the shore is healthy again.', at: 20, sea: false },
  { id: 'sardine', name: 'Silver Sardines', desc: 'A shimmering school that only visits clear water.', at: 30, sea: true },
  { id: 'clownfish', name: 'Clownfish', desc: 'Tiny, bold and very protective of its anemone.', at: 40, sea: true },
  { id: 'seahorse', name: 'Seahorse', desc: 'Holds on to the seagrass with its curly tail.', at: 50, sea: true },
  { id: 'turtle', name: 'Sea Turtle', desc: 'Travelled a very long way to swim in your clean sea.', at: 60, sea: true },
  { id: 'octopus', name: 'Octopus', desc: 'A curious neighbour who rearranges the rocks at night.', at: 70, sea: true },
  { id: 'dolphin', name: 'Dolphin', desc: 'Leaps for joy in the clean turquoise water.', at: 80, sea: true },
  { id: 'manta', name: 'Manta Ray', desc: 'Glides through the water like a quiet shadow.', at: 90, sea: true },
  { id: 'whale', name: 'Humpback Whale', desc: 'The gentle giant. Its return means the ocean is truly alive.', at: 99, sea: true },
];

export interface GoalDef {
  text: string;
  type: 'cleaned' | 'tool' | 'upgrade' | 'done' | 'helper' | 'boat' | 'pct' | 'items';
  id?: string;
  n: number;
  reward: number;
}

/** Always one clear next step, claimed in order. */
export const GOALS: GoalDef[] = [
  { text: 'Sweep 300 patches of dirt', type: 'cleaned', n: 300, reward: 40 },
  { text: 'Buy a Hand Broom', type: 'tool', n: 1, reward: 60 },
  { text: 'Pick up 3 pieces of litter', type: 'items', n: 3, reward: 80 },
  { text: 'Quick Boots to Lv 2', type: 'upgrade', id: 'boots', n: 2, reward: 120 },
  { text: 'Sweep the first sector clean', type: 'done', n: 1, reward: 300 },
  { text: 'Sweep 5,000 patches of dirt', type: 'cleaned', n: 5000, reward: 400 },
  { text: 'Buy a Beach Rake', type: 'tool', n: 2, reward: 600 },
  { text: 'Build a Sand Bot', type: 'helper', id: 'bot', n: 1, reward: 800 },
  { text: 'Clean 3 sectors', type: 'done', n: 3, reward: 2000 },
  { text: 'Sorting Skills to Lv 5', type: 'upgrade', id: 'sorting', n: 5, reward: 3000 },
  { text: 'Buy a Push Sweeper', type: 'tool', n: 3, reward: 5000 },
  { text: 'Clean 5% of the coast', type: 'pct', n: 5, reward: 8000 },
  { text: 'Pick up 40 pieces of litter', type: 'items', n: 40, reward: 15000 },
  { text: 'Buy the boat', type: 'boat', n: 1, reward: 25000 },
  { text: 'Buy a Sand Sifter', type: 'tool', n: 4, reward: 40000 },
  { text: 'Build a Sea Drone', type: 'helper', id: 'drone', n: 1, reward: 60000 },
  { text: 'Clean 15 sectors', type: 'done', n: 15, reward: 150000 },
  { text: 'Buy a Buggy Sweeper', type: 'tool', n: 5, reward: 300000 },
  { text: 'Clean 30% of the coast', type: 'pct', n: 30, reward: 800000 },
  { text: 'Buy a Tractor Rake', type: 'tool', n: 6, reward: 2.5e6 },
  { text: 'Clean 30 sectors', type: 'done', n: 30, reward: 6e6 },
  { text: 'Buy a Sweeper Truck', type: 'tool', n: 7, reward: 2e7 },
  { text: 'Clean 60% of the coast', type: 'pct', n: 60, reward: 6e7 },
  { text: 'Buy a Mega Sifter', type: 'tool', n: 8, reward: 1.5e8 },
  { text: 'Clean 50 sectors', type: 'done', n: 50, reward: 5e8 },
  { text: 'Buy the Titan Cleaner', type: 'tool', n: 9, reward: 1.2e9 },
  { text: 'Clean the whole coast', type: 'pct', n: 100, reward: 5e9 },
];

export interface TreasureDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Worth, in patches of dirt from the sector it lies in. */
  value: number;
  /** Relative chance of being buried somewhere. */
  weight: number;
}

/** Things buried under the dirt: they show up when you sweep the spot clean. */
export const TREASURES: TreasureDef[] = [
  { id: 'shell', name: 'Pretty Shell', icon: '🐚', desc: 'Pink and pearly, perfect to hold to your ear.', value: 60, weight: 30 },
  { id: 'glass', name: 'Sea Glass', icon: '💎', desc: 'An old bottle, polished smooth by years of waves.', value: 90, weight: 24 },
  { id: 'coin', name: 'Old Coin', icon: '🪙', desc: 'Worn and green. Nobody knows how old it is.', value: 150, weight: 18 },
  { id: 'bottle', name: 'Message in a Bottle', icon: '🍾', desc: 'Inside: thank you for cleaning our beach.', value: 220, weight: 12 },
  { id: 'star', name: 'Golden Starfish', icon: '⭐', desc: 'A starfish that shines like the sun. Very rare.', value: 300, weight: 9 },
  { id: 'pearl', name: 'Pearl', icon: '🦪', desc: 'A perfect pearl, still in its oyster.', value: 450, weight: 7 },
  { id: 'compass', name: 'Brass Compass', icon: '🧭', desc: 'It still points north. Mostly.', value: 600, weight: 5 },
  { id: 'anchor', name: 'Tiny Anchor', icon: '⚓', desc: 'From a model ship, or a very small boat.', value: 800, weight: 4 },
  { id: 'watch', name: 'Pocket Watch', icon: '⌚', desc: 'Stopped at a quarter past three, long ago.', value: 1200, weight: 3 },
  { id: 'ring', name: 'Lost Ring', icon: '💍', desc: 'Someone will be very happy to have this back.', value: 1800, weight: 2 },
  { id: 'key', name: 'Skeleton Key', icon: '🗝️', desc: 'It must open something, somewhere on this coast.', value: 2600, weight: 1.4 },
  { id: 'chest', name: 'Pirate Chest', icon: '🏴‍☠️', desc: 'The legend was true! Full of gold doubloons.', value: 6000, weight: 0.6 },
];

export type PowerId = 'turbo' | 'mega' | 'magnet' | 'gold';
export const POWERS: Record<PowerId, { name: string; icon: string; desc: string; seconds: number }> = {
  turbo: { name: 'Turbo', icon: '⚡', desc: 'Double speed', seconds: 15 },
  mega: { name: 'Mega Brush', icon: '🌀', desc: 'Double reach', seconds: 15 },
  magnet: { name: 'Super Magnet', icon: '🧲', desc: 'Pulls in litter and treasure from far away', seconds: 20 },
  gold: { name: 'Golden Hour', icon: '💰', desc: 'Every patch pays triple', seconds: 15 },
};
