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
  { name: 'Recogedor', desc: 'Un recogedor diminuto con su escobilla. Todo viaje empieza por algo.', radius: 4, speed: 1, cost: 0, look: 'hand' },
  { name: 'Escoba', desc: 'Una escoba de verdad. Llega el doble que el recogedor.', radius: 6, speed: 1, cost: 150, look: 'hand' },
  { name: 'Rastrillo', desc: 'Púas anchas que peinan la arena de una pasada.', radius: 9, speed: 1.05, cost: 1200, look: 'hand' },
  { name: 'Barredora', desc: 'Cepillos giratorios sobre ruedas. Empuja y mira cómo brilla la arena.', radius: 13, speed: 1.1, cost: 8000, look: 'hand' },
  { name: 'Cribadora', desc: 'Una maquinita eléctrica que criba la arena mientras rueda.', radius: 18, speed: 1.25, cost: 45000, look: 'machine' },
  { name: 'Buggy barredor', desc: 'Un buggy de playa con una barra barredora delante.', radius: 25, speed: 1.4, cost: 250000, look: 'machine' },
  { name: 'Tractor rastrillo', desc: 'Un tractor que arrastra un rastrillo enorme. Dunas enteras en minutos.', radius: 34, speed: 1.6, cost: 1.4e6, look: 'machine' },
  { name: 'Camión barredor', desc: 'Una barredora industrial adaptada para la arena.', radius: 46, speed: 1.8, cost: 7e6, look: 'machine' },
  { name: 'Megacribadora', desc: 'Una fábrica sobre ruedas que deja la playa impecable.', radius: 62, speed: 2, cost: 3.5e7, look: 'machine' },
  { name: 'Limpiadora Titán', desc: 'La limpiadora de playas más grande jamás construida.', radius: 84, speed: 2.2, cost: 1.6e8, look: 'machine' },
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
  { id: 'boots', name: 'Botas rápidas', icon: '👟', desc: 'Muévete más rápido, a pie y al volante. +12% de velocidad por nivel.', baseCost: 60, growth: 2.1, max: 15 },
  { id: 'sorting', name: 'Saber reciclar', icon: '♻️', desc: 'Separa lo que barres para poder venderlo mejor. +15% de monedas por nivel.', baseCost: 100, growth: 1.95, max: 25 },
  { id: 'magnet', name: 'Imán de basura', icon: '🧲', desc: 'Atrae hacia ti la basura cercana. Más alcance por nivel.', baseCost: 400, growth: 3, max: 6 },
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
  { id: 'bot', name: 'Robot de arena', desc: 'Un robotito que limpia solo los sectores de playa cercanos, incluso cuando no estás.', baseCost: 600, growth: 1.6, max: 20, sea: false },
  { id: 'drone', name: 'Dron marino', desc: 'Limpia el agua de los sectores de mar cercanos, de día y de noche.', baseCost: 60000, growth: 1.6, max: 20, sea: true },
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
  { id: 'crab', name: 'Cangrejo ermitaño', desc: 'El primero en volver. Le encanta corretear por la arena limpia.', at: 2, sea: false },
  { id: 'sandpiper', name: 'Correlimos', desc: 'Corre por la arena limpia buscando algo que picar.', at: 6, sea: false },
  { id: 'gull', name: 'Gaviota', desc: 'Planea sobre la playa ahora que hay peces en vez de plástico.', at: 12, sea: false },
  { id: 'starfish', name: 'Estrella de mar', desc: 'Lenta pero segura. Señal de que la orilla vuelve a estar sana.', at: 20, sea: false },
  { id: 'sardine', name: 'Sardinas plateadas', desc: 'Un banco brillante que solo visita el agua limpia.', at: 30, sea: true },
  { id: 'clownfish', name: 'Pez payaso', desc: 'Pequeño, valiente y muy protector con su anémona.', at: 40, sea: true },
  { id: 'seahorse', name: 'Caballito de mar', desc: 'Se agarra a las algas con su cola rizada.', at: 50, sea: true },
  { id: 'turtle', name: 'Tortuga marina', desc: 'Ha viajado muchísimo para nadar en tu mar limpio.', at: 60, sea: true },
  { id: 'octopus', name: 'Pulpo', desc: 'Un vecino curioso que cambia las rocas de sitio por la noche.', at: 70, sea: true },
  { id: 'dolphin', name: 'Delfín', desc: 'Salta de alegría en el agua turquesa y limpia.', at: 80, sea: true },
  { id: 'manta', name: 'Manta raya', desc: 'Se desliza por el agua como una sombra tranquila.', at: 90, sea: true },
  { id: 'whale', name: 'Ballena jorobada', desc: 'La gigante amable. Su regreso significa que el océano vuelve a estar vivo.', at: 99, sea: true },
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
  { text: 'Barre 300 parcelas de suciedad', type: 'cleaned', n: 300, reward: 40 },
  { text: 'Compra una escoba', type: 'tool', n: 1, reward: 60 },
  { text: 'Recoge 3 trozos de basura', type: 'items', n: 3, reward: 80 },
  { text: 'Botas rápidas a nivel 2', type: 'upgrade', id: 'boots', n: 2, reward: 120 },
  { text: 'Deja limpio tu primer sector', type: 'done', n: 1, reward: 300 },
  { text: 'Barre 5.000 parcelas de suciedad', type: 'cleaned', n: 5000, reward: 400 },
  { text: 'Compra un rastrillo', type: 'tool', n: 2, reward: 600 },
  { text: 'Fabrica un robot de arena', type: 'helper', id: 'bot', n: 1, reward: 800 },
  { text: 'Limpia 3 sectores', type: 'done', n: 3, reward: 2000 },
  { text: 'Saber reciclar a nivel 5', type: 'upgrade', id: 'sorting', n: 5, reward: 3000 },
  { text: 'Compra una barredora', type: 'tool', n: 3, reward: 5000 },
  { text: 'Limpia el 5% de la costa', type: 'pct', n: 5, reward: 8000 },
  { text: 'Recoge 40 trozos de basura', type: 'items', n: 40, reward: 15000 },
  { text: 'Compra el barco', type: 'boat', n: 1, reward: 25000 },
  { text: 'Compra una cribadora', type: 'tool', n: 4, reward: 40000 },
  { text: 'Fabrica un dron marino', type: 'helper', id: 'drone', n: 1, reward: 60000 },
  { text: 'Limpia 15 sectores', type: 'done', n: 15, reward: 150000 },
  { text: 'Compra un buggy barredor', type: 'tool', n: 5, reward: 300000 },
  { text: 'Limpia el 30% de la costa', type: 'pct', n: 30, reward: 800000 },
  { text: 'Compra un tractor rastrillo', type: 'tool', n: 6, reward: 2.5e6 },
  { text: 'Limpia 30 sectores', type: 'done', n: 30, reward: 6e6 },
  { text: 'Compra un camión barredor', type: 'tool', n: 7, reward: 2e7 },
  { text: 'Limpia el 60% de la costa', type: 'pct', n: 60, reward: 6e7 },
  { text: 'Compra una megacribadora', type: 'tool', n: 8, reward: 1.5e8 },
  { text: 'Limpia 50 sectores', type: 'done', n: 50, reward: 5e8 },
  { text: 'Compra la Limpiadora Titán', type: 'tool', n: 9, reward: 1.2e9 },
  { text: 'Limpia toda la costa', type: 'pct', n: 100, reward: 5e9 },
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
  { id: 'shell', name: 'Concha bonita', icon: '🐚', desc: 'Rosa y nacarada, perfecta para escuchar el mar.', value: 60, weight: 30 },
  { id: 'glass', name: 'Cristal de mar', icon: '💎', desc: 'Una botella vieja, pulida por años de olas.', value: 90, weight: 24 },
  { id: 'coin', name: 'Moneda antigua', icon: '🪙', desc: 'Gastada y verdosa. Nadie sabe cuántos años tiene.', value: 150, weight: 18 },
  { id: 'bottle', name: 'Mensaje en una botella', icon: '🍾', desc: 'Con letra cuidadosa: «A quien encuentre esto: gracias por limpiar nuestra playa. Con cariño, las tortugas».', value: 220, weight: 12 },
  { id: 'star', name: 'Estrella dorada', icon: '⭐', desc: 'Una estrella de mar que brilla como el sol. Muy rara.', value: 300, weight: 9 },
  { id: 'pearl', name: 'Perla', icon: '🦪', desc: 'Una perla perfecta, todavía dentro de su ostra.', value: 450, weight: 7 },
  { id: 'compass', name: 'Brújula de latón', icon: '🧭', desc: 'Todavía señala el norte. Casi siempre.', value: 600, weight: 5 },
  { id: 'anchor', name: 'Ancla diminuta', icon: '⚓', desc: 'De un barco de maqueta, o de uno muy pequeño.', value: 800, weight: 4 },
  { id: 'watch', name: 'Reloj de bolsillo', icon: '⌚', desc: 'Se paró a las tres y cuarto, hace mucho tiempo.', value: 1200, weight: 3 },
  { id: 'ring', name: 'Anillo perdido', icon: '💍', desc: 'Alguien se alegrará muchísimo de recuperarlo.', value: 1800, weight: 2 },
  { id: 'key', name: 'Llave antigua', icon: '🗝️', desc: 'Seguro que abre algo, en algún lugar de esta costa.', value: 2600, weight: 1.4 },
  { id: 'chest', name: 'Cofre pirata', icon: '🏴‍☠️', desc: '¡La leyenda era cierta! Lleno de doblones de oro.', value: 6000, weight: 0.6 },
];

export type PowerId = 'turbo' | 'mega' | 'gold';
export const POWERS: Record<PowerId, { name: string; icon: string; desc: string; seconds: number }> = {
  turbo: { name: 'Turbo', icon: '⚡', desc: 'Doble de velocidad', seconds: 15 },
  mega: { name: 'Megacepillo', icon: '🌀', desc: 'Doble de alcance', seconds: 15 },
  gold: { name: 'Hora dorada', icon: '💰', desc: 'Cada parcela paga el triple', seconds: 15 },
};

export interface MissionDef { icon: string; text: string; done: string }

/** A little errand in every sector, depending on its theme (two variants each). */
export const MISSIONS: Record<string, MissionDef[]> = {
  castle: [
    { icon: '🪣', text: 'Encuentra el cubo rojo de un niño', done: 'El cubo vuelve a su dueño. ¡A seguir construyendo castillos!' },
    { icon: '🚩', text: 'Recupera la bandera del castillo', done: 'La bandera ondea otra vez en lo alto del castillo.' },
  ],
  picnic: [
    { icon: '🕶️', text: 'Encuentra las gafas de sol perdidas', done: 'Alguien vuelve a ver el sol sin entrecerrar los ojos.' },
    { icon: '🧺', text: 'Recupera la cesta del picnic', done: 'La merienda está a salvo de las gaviotas.' },
  ],
  dunes: [
    { icon: '🪁', text: 'Rescata la cometa enredada en las dunas', done: 'La cometa vuela de nuevo con el viento.' },
    { icon: '👒', text: 'Encuentra el sombrero que se llevó el viento', done: 'El sombrero vuelve a una cabeza muy agradecida.' },
  ],
  rocks: [
    { icon: '🦀', text: 'Libera al cangrejo atrapado en una lata', done: 'El cangrejo se aleja de lado, muy digno.' },
    { icon: '🔦', text: 'Encuentra la linterna del explorador', done: 'Ahora las rocas se pueden explorar también de noche.' },
  ],
  grove: [
    { icon: '📻', text: 'Encuentra la radio perdida entre las palmeras', done: 'Vuelve la música al palmeral.' },
    { icon: '🥥', text: 'Recoge los cocos para el chiringuito', done: 'Batidos de coco para todo el mundo.' },
  ],
  bar: [
    { icon: '🩴', text: 'Devuelve la chancla perdida', done: 'Por fin un par completo de chanclas.' },
    { icon: '🍹', text: 'Encuentra la sombrillita de los cócteles', done: 'Los cócteles vuelven a llevar su sombrillita.' },
  ],
  drift: [
    { icon: '🪧', text: 'Encuentra el cartel tallado en madera', done: 'Dice: «Gracias por cuidar esta bahía».' },
    { icon: '🐚', text: 'Recupera la concha gigante del museo', done: 'La concha vuelve a su vitrina.' },
  ],
  guard: [
    { icon: '🛟', text: 'Encuentra el salvavidas perdido', done: 'El socorrista ya puede volver a su puesto tranquilo.' },
    { icon: '📣', text: 'Recupera el megáfono del socorrista', done: '«¡Bañistas, el agua está limpísima!»' },
  ],
  pools: [
    { icon: '🐙', text: 'Ayuda al pulpo atrapado en un tarro', done: 'El pulpo se escurre fuera del tarro y te saluda con un tentáculo.' },
    { icon: '⭐', text: 'Devuelve al agua la estrella varada', done: 'La estrella vuelve a su poza.' },
  ],
  surf: [
    { icon: '🏄', text: 'Encuentra la quilla de la tabla de surf', done: 'La tabla vuelve a deslizarse sobre las olas.' },
    { icon: '🩱', text: 'Recupera el bañador que se llevó la marea', done: 'Mejor no preguntar cómo se perdió.' },
  ],
  pier: [
    { icon: '🎣', text: 'Recupera la caña de pescar del abuelo', done: 'El abuelo vuelve a pescar en el muelle.' },
    { icon: '🔔', text: 'Encuentra la campana del muelle', done: 'Ding, ding: el muelle vuelve a sonar.' },
  ],
  shallows: [
    { icon: '🏐', text: 'Rescata el balón que se llevó la corriente', done: 'El partido de vóley puede continuar.' },
    { icon: '🦆', text: 'Rescata el patito de goma', done: 'El patito vuelve a su bañera, feliz.' },
  ],
  coral: [
    { icon: '🎈', text: 'Desenreda el coral de un globo', done: 'El coral respira aliviado.' },
    { icon: '🤿', text: 'Encuentra las gafas de buceo perdidas', done: 'Ahora alguien puede ver este jardín tan bonito.' },
  ],
  kelp: [
    { icon: '🦭', text: 'Libera a la foca atrapada en una red', done: 'La foca da una voltereta de alegría.' },
    { icon: '🐢', text: 'Guía a la tortuguita fuera de las algas', done: 'La tortuguita nada hacia mar abierto.' },
  ],
  wreck: [
    { icon: '🔔', text: 'Rescata la campana del barco hundido', done: 'La campana vuelve al museo del puerto.' },
    { icon: '🧭', text: 'Recupera el timón del capitán', done: 'El capitán estaría orgulloso.' },
  ],
  fishing: [
    { icon: '🦞', text: 'Recupera la nasa perdida de la langosta', done: 'Y la langosta, libre: hoy no hay sopa.' },
    { icon: '🪝', text: 'Saca el anzuelo enganchado en el fondo', done: 'Un peligro menos para los peces.' },
  ],
};
