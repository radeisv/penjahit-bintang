// Penjahit Bintang: every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720, horizonY: 668 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const LIVES = 3;

/** Star kinds: 0 gold, 1 cyan, 2 rose, 3 hope (a rare bonus star). */
export const KIND_GOLD = 0;
export const KIND_CYAN = 1;
export const KIND_ROSE = 2;
export const KIND_HOPE = 3;
export const KIND_COUNT = 3;

export const KIND_NAMES = ['emas', 'cyan', 'mawar'];
export const KIND_COLORS = ['#ffd166', '#4ecdc4', '#ff6b9d'];
export const KIND_HOPE_COLOR = '#fff3c4';

/** One level's goal: score to reach, chain length the pattern asks for, kind to stitch. */
export const LEVELS = [
  { target: 120, required: 3, kind: KIND_GOLD },
  { target: 280, required: 3, kind: KIND_CYAN },
  { target: 480, required: 4, kind: KIND_GOLD },
  { target: 720, required: 4, kind: KIND_ROSE },
  { target: 1000, required: 5, kind: KIND_CYAN },
];
export const MAX_LEVEL = 5;

export const STAR = {
  radius: 22,
  grabRadius: 52,
  linkRadius: 190,
  fallSpeed: 44,
  fallPerLevel: 9,
  fallJitter: 26,
  /** Seconds a star lives before it fades away, unstitched. */
  life: 20,
  fadeLast: 3,
  spawnInterval: 0.38,
  spawnScale: 0.92,
  minInterval: 0.28,
  points: 10,
  chainBonus: 5,
  hopePoints: 50,
  /** Chance a newly spawned star is a hope star. */
  hopeChance: 0.06,
};

export const METEOR = {
  radius: 19,
  speed: 125,
  speedPerLevel: 12,
  interval: 11,
  intervalScale: 0.88,
  minInterval: 6,
  /** Points for destroying a meteor with the thread. */
  destroyPoints: 5,
};

/** How many falling things can exist at once; the pools are allocated once, at boot. */
export const STAR_POOL = 72;
export const METEOR_POOL = 8;

/** Combo multiplier grows 0.25 a stitch, capped here. */
export const COMBO_STEP = 0.25;
export const COMBO_MAX = 3;

export const PALETTE = {
  backdrop: '#070a1c',
  skyTop: '#0b1026',
  skyBottom: '#1c2450',
  horizon: '#2a2f5e',
  thread: '#7df9e8',
  threadGlow: '#4ecdc4',
  needle: '#eef1f5',
  meteor: '#3a1420',
  meteorRim: '#ff5a5a',
  panel: '#141a38',
  panelEdge: '#4ecdc4',
  text: '#f4f1e6',
  muted: '#aab3d6',
  gold: '#ffd166',
  danger: '#ff5a5a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'penjahit-bintang.best';
