// All game content lives here as plain data, so new regions / gear can be added without touching systems.

export type UpgradeId = 'grabber' | 'bag' | 'net' | 'sweeper' | 'boots' | 'boat' | 'conveyor';
export type UnitId = 'worker' | 'cleaner' | 'boat' | 'floater' | 'vessel' | 'drone' | 'robot';
export type Branch = 'cleanup' | 'automation' | 'ecology';

export interface UpgradeDef {
  id: UpgradeId;
  group: 'tools' | 'recycling';
  name: string;
  icon: string;
  desc: string;
  baseCost: number;
  growth: number;
  max: number;
  /** Restoration % needed before it can be bought. */
  unlockAt: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'grabber', group: 'tools', name: 'Trash Grabber', icon: '🦾', desc: 'A long-reach grabber. More waste from every piece you pick up.', baseCost: 10, growth: 1.33, max: 50, unlockAt: 0 },
  { id: 'bag', group: 'tools', name: 'Large Collection Bag', icon: '🎒', desc: 'Carry more before recycling: bigger storage and heavier hauls.', baseCost: 35, growth: 1.55, max: 30, unlockAt: 0 },
  { id: 'net', group: 'tools', name: 'Small Fishing Net', icon: '🥅', desc: 'Scoops up floating debris. Boosts every source of collection.', baseCost: 120, growth: 1.5, max: 25, unlockAt: 5 },
  { id: 'sweeper', group: 'tools', name: 'Sweeping Tool', icon: '🧹', desc: 'Broom, rake, vacuum, sweeper cart: a wider sweep area and +20% waste per level.', baseCost: 60, growth: 3, max: 5, unlockAt: 0 },
  { id: 'boots', group: 'tools', name: 'Quick Boots', icon: '👟', desc: 'Walk faster and sweep more ground. +40% speed per level.', baseCost: 40, growth: 2.3, max: 5, unlockAt: 0 },
  { id: 'boat', group: 'tools', name: 'Cleanup Boat', icon: '⛵', desc: 'Lets you sail out and clean the sea sectors. Upgrades make it faster and wider.', baseCost: 900, growth: 5, max: 3, unlockAt: 0 },
  { id: 'conveyor', group: 'recycling', name: 'Conveyor Belts', icon: '⚙️', desc: 'Feeds waste into the recycler faster.', baseCost: 60, growth: 1.5, max: 40, unlockAt: 0 },
];

/** The beach is a grid of sectors. Sector id = row * SECTOR_COLS + col. */
export const SECTOR_COLS = 3;
export const SECTOR_ROWS = 4;
export const SECTOR_COUNT = SECTOR_COLS * SECTOR_ROWS;
/** Sectors that are open from the start (the bottom row, next to the recycling station). */
export const SECTOR_START = [9, 10];
/** Pieces of trash lying in a sector when you open it. */
export const SECTOR_TRASH = 12;
export const SWEEP_TIERS = ['Bare hands', 'Broom', 'Rake', 'Beach vacuum', 'Sweeper cart', 'Mega sweeper'];
export const BOAT_TIERS = ['No boat', 'Rowboat', 'Motorboat', 'Skimmer'];

export interface UnitDef {
  id: UnitId;
  group: 'beach' | 'ocean';
  name: string;
  desc: string;
  baseCost: number;
  /** Waste per second, per unit, before multipliers. */
  rate: number;
  unlockAt: number;
}

export const UNIT_GROWTH = 1.15;

export const UNITS: UnitDef[] = [
  { id: 'worker', group: 'beach', name: 'Beach Worker', desc: 'A friendly volunteer who combs the sand all day.', baseCost: 25, rate: 0.4, unlockAt: 0 },
  { id: 'cleaner', group: 'beach', name: 'Electric Beach Cleaner', desc: 'A quiet little machine that sifts the sand by itself.', baseCost: 300, rate: 2, unlockAt: 12 },
  { id: 'boat', group: 'ocean', name: 'Cleanup Boat', desc: 'Trawls the shallows with a fine net.', baseCost: 2500, rate: 9, unlockAt: 22 },
  { id: 'floater', group: 'ocean', name: 'Floating Trash Collector', desc: 'A drifting boom that funnels debris day and night.', baseCost: 22000, rate: 40, unlockAt: 34 },
  { id: 'vessel', group: 'ocean', name: 'Industrial Cleanup Vessel', desc: 'A big ship built to haul tonnes of plastic.', baseCost: 250000, rate: 180, unlockAt: 46 },
  { id: 'drone', group: 'ocean', name: 'Autonomous Cleanup Drone', desc: 'Spots and lifts debris from the air, tirelessly.', baseCost: 3000000, rate: 900, unlockAt: 60 },
  { id: 'robot', group: 'ocean', name: 'Ocean Cleanup Robot', desc: 'A gentle submersible that cleans the seabed.', baseCost: 40000000, rate: 5000, unlockAt: 74 },
];

export interface RecyclerDef {
  name: string;
  desc: string;
  cost: number;
  /** Waste per second it can process. */
  throughput: number;
  /** Coins paid per unit of waste. */
  value: number;
}

export const RECYCLERS: RecyclerDef[] = [
  { name: 'Basic Recycling Bin', desc: 'A humble bin. It all starts here.', cost: 0, throughput: 1.5, value: 1 },
  { name: 'Small Recycling Station', desc: 'A wooden hut with a proper sorting table.', cost: 200, throughput: 6, value: 1.6 },
  { name: 'Recycling Center', desc: 'Sorts plastics, metal and glass separately.', cost: 6000, throughput: 40, value: 2.6 },
  { name: 'Advanced Recycling Factory', desc: 'Turns waste into high-quality materials.', cost: 180000, throughput: 350, value: 4.2 },
  { name: 'Automated Recycling Complex', desc: 'Solar powered, fully automatic, nothing wasted.', cost: 6000000, throughput: 30000, value: 7 },
];

export interface ResearchDef {
  id: string;
  branch: Branch;
  tier: number;
  name: string;
  icon: string;
  desc: string;
  cost: number;
}

export const BRANCHES: { id: Branch; name: string; color: string }[] = [
  { id: 'cleanup', name: 'Cleanup', color: '#3aa8e8' },
  { id: 'automation', name: 'Automation', color: '#f2a03d' },
  { id: 'ecology', name: 'Ecology', color: '#4cc27a' },
];

const TIER_COST = [2, 5, 10, 18, 30];
const r = (branch: Branch, tier: number, name: string, icon: string, desc: string): ResearchDef => ({
  id: `${branch[0]}${tier + 1}`, branch, tier, name, icon, desc, cost: TIER_COST[tier]!,
});

export const RESEARCH: ResearchDef[] = [
  r('cleanup', 0, 'Ergonomic Grips', '🧤', 'Your taps collect twice as much waste.'),
  r('cleanup', 1, 'Tide Reading', '🌊', 'Trash drifts ashore twice as fast and each piece is worth 50% more.'),
  r('cleanup', 2, 'Helping Hands', '🤝', 'Every tap also brings in 1.5 seconds of your automated collection.'),
  r('cleanup', 3, 'Efficient Hulls', '⛵', 'Boats, floating collectors and vessels collect twice as much.'),
  r('cleanup', 4, 'Deep Nets', '🕸️', 'All collection +50% and storage is five times larger.'),
  r('automation', 0, 'Shift Schedules', '📋', 'Beach workers and electric cleaners work three times as fast.'),
  r('automation', 1, 'Smart Sorting', '🧠', 'The recycler processes waste twice as fast.'),
  r('automation', 2, 'Night Crew', '🌙', 'Offline production rises from 50% to 100%, for up to 16 hours.'),
  r('automation', 3, 'Fleet Network', '📡', 'Every 10 automated units you own boost all automation by 5%.'),
  r('automation', 4, 'Autonomous Swarm', '🛰️', 'Drones and ocean robots collect three times as much.'),
  r('ecology', 0, 'Seagrass Nursery', '🌱', 'The beach recovers 30% faster.'),
  r('ecology', 1, 'Eco-tourism', '📸', 'Coins +1% for every 1% of the beach you have restored.'),
  r('ecology', 2, 'Wildlife Sanctuary', '🪺', 'Earn 50% more Ocean Reputation.'),
  r('ecology', 3, 'Coral Gardening', '🪸', 'The beach recovers a further 60% faster.'),
  r('ecology', 4, 'Ocean Ambassador', '🌍', 'Reputation doubled, coins +50%, and the route to the Coral Reef can be charted.'),
];

export interface AnimalDef {
  id: string;
  name: string;
  desc: string;
  /** Restoration % at which it returns. */
  at: number;
}

export const ANIMALS: AnimalDef[] = [
  { id: 'crab', name: 'Hermit Crab', desc: 'First to come back. Loves a tidy patch of sand to scuttle across.', at: 8 },
  { id: 'sandpiper', name: 'Sandpiper', desc: 'Chases the waves back and forth looking for snacks.', at: 16 },
  { id: 'sardine', name: 'Silver Sardines', desc: 'A shimmering school that only visits clear shallows.', at: 24 },
  { id: 'gull', name: 'Seagull', desc: 'Circles overhead now that there is fish instead of plastic.', at: 32 },
  { id: 'clownfish', name: 'Clownfish', desc: 'Tiny, bold and very protective of its anemone.', at: 40 },
  { id: 'starfish', name: 'Starfish', desc: 'Slow and steady. A sign the seabed is healthy again.', at: 48 },
  { id: 'seahorse', name: 'Seahorse', desc: 'Holds on to the seagrass with its curly tail.', at: 56 },
  { id: 'turtle', name: 'Sea Turtle', desc: 'Travelled a very long way to nest on your beach.', at: 64 },
  { id: 'octopus', name: 'Octopus', desc: 'A curious neighbour who rearranges the rocks at night.', at: 72 },
  { id: 'dolphin', name: 'Dolphin', desc: 'Leaps for joy in the clean turquoise water.', at: 80 },
  { id: 'manta', name: 'Manta Ray', desc: 'Glides over the reef like a quiet shadow.', at: 90 },
  { id: 'whale', name: 'Humpback Whale', desc: 'The gentle giant. Its return means the ocean is truly alive.', at: 100 },
];

export const MILESTONES: { pct: number; rep: number; title: string; text: string }[] = [
  { pct: 25, rep: 5, title: 'The water is clearing', text: 'Most of the plastic is gone and the sea looks a little bluer.' },
  { pct: 50, rep: 10, title: 'Green shoots', text: 'Plants are back on the dunes and seagrass sways in the shallows.' },
  { pct: 75, rep: 15, title: 'A living reef', text: 'Coral is growing and the beach is full of life again.' },
  { pct: 100, rep: 25, title: 'Beach restored!', text: 'Your Tropical Beach is a thriving paradise.' },
];

export interface RegionDef {
  id: string;
  name: string;
  icon: string;
  teaser: string;
  features: string;
}

export const REGIONS: RegionDef[] = [
  { id: 'beach', name: 'Tropical Beach', icon: '🏝️', teaser: 'Where it all begins.', features: 'Bottles, bags and cans · turtles, dolphins, whales' },
  { id: 'reef', name: 'Coral Reef', icon: '🪸', teaser: 'A bleached reef tangled in ghost nets.', features: 'Ghost nets · reef sharks, parrotfish · coral nurseries' },
  { id: 'mangrove', name: 'Mangrove Forest', icon: '🌿', teaser: 'Roots choked with debris from the river.', features: 'River waste · herons, mudskippers · root planting' },
  { id: 'open', name: 'Open Ocean', icon: '🌊', teaser: 'A drifting garbage patch far from shore.', features: 'Microplastics · tuna, albatross · giant booms' },
  { id: 'arctic', name: 'Arctic Waters', icon: '🧊', teaser: 'Fragile ice and old fishing gear.', features: 'Frozen debris · seals, narwhals · icebreakers' },
  { id: 'deep', name: 'Deep Ocean', icon: '🌌', teaser: 'What sank out of sight is still there.', features: 'Sunken waste · anglerfish, giant squid · deep robots' },
];

export const REEF_ROUTE_COST = 50;

export interface GoalDef {
  text: string;
  type: 'waste' | 'upgrade' | 'unit' | 'research' | 'recycler' | 'pct' | 'animals' | 'reef';
  id?: string;
  n: number;
  /** Coins handed over when the goal is claimed. */
  reward: number;
}

/** A gentle to-do list: always one clear next step, claimed in order. */
export const GOALS: GoalDef[] = [
  { text: 'Collect 10 pieces of waste', type: 'waste', n: 10, reward: 15 },
  { text: 'Buy a Trash Grabber', type: 'upgrade', id: 'grabber', n: 1, reward: 20 },
  { text: 'Hire a Beach Worker', type: 'unit', id: 'worker', n: 1, reward: 30 },
  { text: 'Complete a research', type: 'research', n: 1, reward: 60 },
  { text: 'Build a Recycling Station', type: 'recycler', n: 1, reward: 120 },
  { text: 'Welcome an animal home', type: 'animals', n: 1, reward: 150 },
  { text: 'Hire 5 Beach Workers', type: 'unit', id: 'worker', n: 5, reward: 250 },
  { text: 'Conveyor Belts to Lv 3', type: 'upgrade', id: 'conveyor', n: 3, reward: 300 },
  { text: 'Restore the beach to 15%', type: 'pct', n: 15, reward: 500 },
  { text: 'Buy an Electric Cleaner', type: 'unit', id: 'cleaner', n: 1, reward: 600 },
  { text: 'Fishing Net to Lv 3', type: 'upgrade', id: 'net', n: 3, reward: 1000 },
  { text: 'Restore the beach to 25%', type: 'pct', n: 25, reward: 2500 },
  { text: 'Launch a Cleanup Boat', type: 'unit', id: 'boat', n: 1, reward: 3000 },
  { text: 'Build a Recycling Center', type: 'recycler', n: 2, reward: 6000 },
  { text: 'Complete 5 researches', type: 'research', n: 5, reward: 8000 },
  { text: 'Own 5 Cleanup Boats', type: 'unit', id: 'boat', n: 5, reward: 15000 },
  { text: 'Restore the beach to 40%', type: 'pct', n: 40, reward: 25000 },
  { text: 'Deploy a Floating Collector', type: 'unit', id: 'floater', n: 1, reward: 30000 },
  { text: 'Welcome 6 animals home', type: 'animals', n: 6, reward: 60000 },
  { text: 'Restore the beach to 50%', type: 'pct', n: 50, reward: 120000 },
  { text: 'Launch a Cleanup Vessel', type: 'unit', id: 'vessel', n: 1, reward: 150000 },
  { text: 'Build a Recycling Factory', type: 'recycler', n: 3, reward: 250000 },
  { text: 'Complete 10 researches', type: 'research', n: 10, reward: 400000 },
  { text: 'Restore the beach to 65%', type: 'pct', n: 65, reward: 1500000 },
  { text: 'Launch a Cleanup Drone', type: 'unit', id: 'drone', n: 1, reward: 2000000 },
  { text: 'Build the Recycling Complex', type: 'recycler', n: 4, reward: 4000000 },
  { text: 'Restore the beach to 80%', type: 'pct', n: 80, reward: 15000000 },
  { text: 'Deploy an Ocean Robot', type: 'unit', id: 'robot', n: 1, reward: 25000000 },
  { text: 'Complete all 15 researches', type: 'research', n: 15, reward: 60000000 },
  { text: 'Restore the beach to 100%', type: 'pct', n: 100, reward: 500000000 },
  { text: 'Chart the Coral Reef route', type: 'reef', n: 1, reward: 1000000000 },
];
