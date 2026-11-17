// Penjahit Bintang's rules and state, with no drawing and no browser in it:
// falling stars, the thread that stitches them into constellations, void
// meteors, score, combo, lives and levels. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react (sound,
// announcements) without the world knowing about screens or sound.
// Nothing here allocates after createWorld returns.

import {
  COMBO_MAX, COMBO_STEP, FIELD, KIND_COUNT, KIND_HOPE, LEVELS, LIVES,
  MAX_LEVEL, METEOR, METEOR_POOL, STAR, STAR_POOL,
} from './config.js';

export const EVENT_STITCH = 1;
export const EVENT_HIT = 2;
export const EVENT_OVER = 4;
export const EVENT_LEVEL = 8;
export const EVENT_WIN = 16;
export const EVENT_BONUS = 32;
export const EVENT_SNAP = 64;

function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const stars = [];
  for (let index = 0; index < STAR_POOL; index += 1) {
    stars.push({ active: false, id: index, kind: 0, x: 0, y: 0, vy: 0, radius: STAR.radius, age: 0, phase: 0, chained: false });
  }
  const meteors = [];
  for (let index = 0; index < METEOR_POOL; index += 1) {
    meteors.push({ active: false, x: 0, y: 0, vy: 0, radius: METEOR.radius, spin: 0 });
  }
  // The thread: the stars stitched so far in this drag, in order.
  const chain = { active: false, kind: 0, ids: [], tipX: 0, tipY: 0 };
  for (let index = 0; index < STAR_POOL; index += 1) chain.ids.push(-1);
  let chainLength = 0;

  const state = {
    stars, meteors, chain,
    score: 0, lives: LIVES, level: 1, combo: 0, bestCombo: 0,
    target: LEVELS[0].target, required: LEVELS[0].required, targetKind: LEVELS[0].kind,
    elapsed: 0, starTimer: 0, meteorTimer: 0, stitched: 0, won: false,
    banner: '', bannerTimer: 0, shake: 0, flash: 0,
  };

  function levelSpec() {
    return LEVELS[Math.min(state.level, MAX_LEVEL) - 1];
  }

  function reset() {
    for (const star of stars) { star.active = false; star.chained = false; }
    for (const meteor of meteors) meteor.active = false;
    chain.active = false;
    chainLength = 0;
    state.score = 0;
    state.lives = LIVES;
    state.level = 1;
    state.combo = 0;
    state.bestCombo = 0;
    state.target = LEVELS[0].target;
    state.required = LEVELS[0].required;
    state.targetKind = LEVELS[0].kind;
    state.elapsed = 0;
    state.starTimer = 0.4;
    state.meteorTimer = METEOR.interval;
    state.stitched = 0;
    state.won = false;
    state.banner = '';
    state.bannerTimer = 0;
    state.shake = 0;
    state.flash = 0;
  }

  function freeStar() {
    for (let index = 0; index < stars.length; index += 1) if (!stars[index].active) return stars[index];
    return null;
  }

  function freeMeteor() {
    for (let index = 0; index < meteors.length; index += 1) if (!meteors[index].active) return meteors[index];
    return null;
  }

  function spawnStar() {
    const star = freeStar();
    if (star === null) return;
    star.active = true;
    star.chained = false;
    star.kind = random() < STAR.hopeChance ? KIND_HOPE : Math.floor(random() * KIND_COUNT);
    star.radius = star.kind === KIND_HOPE ? STAR.radius + 6 : STAR.radius;
    star.x = 40 + random() * (FIELD.width - 80);
    star.y = -star.radius;
    star.vy = STAR.fallSpeed + STAR.fallPerLevel * (state.level - 1) + random() * STAR.fallJitter;
    star.age = 0;
    star.phase = random() * Math.PI * 2;
  }

  function spawnMeteor() {
    const meteor = freeMeteor();
    if (meteor === null) return;
    meteor.active = true;
    meteor.x = 50 + random() * (FIELD.width - 100);
    meteor.y = -meteor.radius;
    meteor.vy = METEOR.speed + METEOR.speedPerLevel * (state.level - 1);
    meteor.spin = random() * Math.PI * 2;
  }

  function starInterval() {
    return Math.max(STAR.minInterval, STAR.spawnInterval * STAR.spawnScale ** (state.level - 1));
  }

  function meteorInterval() {
    return Math.max(METEOR.minInterval, METEOR.interval * METEOR.intervalScale ** (state.level - 1));
  }

  function starById(id) {
    return stars[id];
  }

  /** Begin a thread on the star nearest (x, y), if one is close enough. */
  function startChainAt(x, y) {
    let best = null;
    let bestDist = STAR.grabRadius * STAR.grabRadius;
    for (let index = 0; index < stars.length; index += 1) {
      const star = stars[index];
      if (!star.active || star.chained) continue;
      const d = distanceSq(x, y, star.x, star.y);
      if (d < bestDist) { bestDist = d; best = star; }
    }
    if (best === null) return false;
    chain.active = true;
    chain.kind = best.kind === KIND_HOPE ? state.targetKind : best.kind;
    chainLength = 1;
    chain.ids[0] = best.id;
    best.chained = true;
    chain.tipX = x;
    chain.tipY = y;
    return true;
  }

  /** Grow the thread toward (x, y): add a star of the chain's kind, or a hope star. */
  function addToChain(x, y) {
    if (!chain.active || chainLength === 0) return 0;
    chain.tipX = x;
    chain.tipY = y;
    const last = starById(chain.ids[chainLength - 1]);
    let best = null;
    let bestDist = STAR.grabRadius * STAR.grabRadius;
    for (let index = 0; index < stars.length; index += 1) {
      const star = stars[index];
      if (!star.active || star.chained) continue;
      if (star.kind !== chain.kind && star.kind !== KIND_HOPE) continue;
      if (distanceSq(last.x, last.y, star.x, star.y) > STAR.linkRadius * STAR.linkRadius) continue;
      const d = distanceSq(x, y, star.x, star.y);
      if (d < bestDist) { bestDist = d; best = star; }
    }
    if (best === null) return 0;
    best.chained = true;
    chain.ids[chainLength] = best.id;
    chainLength += 1;
    return chainLength;
  }

  /** Touching a meteor with the thread snaps it: combo lost, no life lost. */
  function chainTouchesMeteor(x, y) {
    for (let index = 0; index < meteors.length; index += 1) {
      const meteor = meteors[index];
      if (!meteor.active) continue;
      if (distanceSq(x, y, meteor.x, meteor.y) < (meteor.radius + 14) * (meteor.radius + 14)) return true;
    }
    return false;
  }

  /**
   * Destroy the meteor nearest (x, y) with the thread: +5 points, and the
   * meteor never reaches the horizon. This is the player's answer to
   * meteors — without it, a meteor that falls is a life no one can save.
   */
  function destroyMeteorAt(x, y) {
    for (let index = 0; index < meteors.length; index += 1) {
      const meteor = meteors[index];
      if (!meteor.active) continue;
      if (distanceSq(x, y, meteor.x, meteor.y) < (meteor.radius + 26) * (meteor.radius + 26)) {
        meteor.active = false;
        state.score += METEOR.destroyPoints;
        return true;
      }
    }
    return false;
  }

  function clearChain() {
    for (let index = 0; index < chainLength; index += 1) {
      stars[chain.ids[index]].chained = false;
      chain.ids[index] = -1;
    }
    chain.active = false;
    chainLength = 0;
  }

  function snapChain() {
    clearChain();
    state.combo = 0;
    return EVENT_SNAP;
  }

  /**
   * Finish the drag. A chain of the pattern's length stitches a constellation:
   * score, combo and maybe a level or the win. A short chain just snaps.
   */
  function endChain() {
    if (!chain.active) return 0;
    let events = 0;
    if (chainLength < state.required) {
      return snapChain();
    }
    let hasHope = false;
    for (let index = 0; index < chainLength; index += 1) {
      const star = stars[chain.ids[index]];
      if (star.kind === KIND_HOPE) hasHope = true;
      star.active = false;
      star.chained = false;
      chain.ids[index] = -1;
    }
    chain.active = false;
    const stitchedNow = chainLength;
    chainLength = 0;
    state.combo += 1;
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;
    const multiplier = 1 + COMBO_STEP * (state.combo - 1);
    if (multiplier > COMBO_MAX) { /* capped below by Math.min */ }
    const scored = Math.round((stitchedNow * STAR.points + Math.max(0, stitchedNow - state.required) * STAR.chainBonus) * Math.min(multiplier, COMBO_MAX));
    state.score += scored;
    state.stitched += stitchedNow;
    events |= EVENT_STITCH;
    if (hasHope) {
      state.score += STAR.hopePoints;
      if (state.lives < LIVES) state.lives += 1;
      events |= EVENT_BONUS;
    }
    if (state.level === MAX_LEVEL && state.score >= state.target) {
      state.won = true;
      events |= EVENT_WIN;
      return events;
    }
    if (state.score >= state.target) {
      state.level = Math.min(MAX_LEVEL, state.level + 1);
      const spec = levelSpec();
      state.target = spec.target;
      state.required = spec.required;
      state.targetKind = spec.kind;
      state.banner = `Level ${state.level} — pola baru: jahit ${spec.required} bintang ${['emas', 'cyan', 'mawar'][spec.kind]}`;
      state.bannerTimer = 2.4;
      events |= EVENT_LEVEL;
    }
    return events;
  }

  /**
   * One fixed step. `harmless` is the title screen's backdrop: stars fall and
   * fade, but nothing scores and no meteor can hurt anyone.
   */
  function step(dt, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.bannerTimer > 0) state.bannerTimer = Math.max(0, state.bannerTimer - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 3);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2);

    state.starTimer -= dt;
    if (state.starTimer <= 0) {
      spawnStar();
      state.starTimer += starInterval();
    }
    if (!harmless) {
      state.meteorTimer -= dt;
      if (state.meteorTimer <= 0) {
        spawnMeteor();
        state.meteorTimer += meteorInterval();
      }
    }

    for (let index = 0; index < stars.length; index += 1) {
      const star = stars[index];
      if (!star.active) continue;
      star.y += star.vy * dt;
      star.age += dt;
      if (star.age > STAR.life || star.y > FIELD.horizonY + star.radius) {
        if (star.chained) {
          // A chained star fading out snaps the thread.
          events |= snapChain();
        }
        star.active = false;
        star.chained = false;
      }
    }

    for (let index = 0; index < meteors.length; index += 1) {
      const meteor = meteors[index];
      if (!meteor.active) continue;
      meteor.y += meteor.vy * dt;
      meteor.spin += dt * 2;
      if (meteor.y > FIELD.horizonY) {
        meteor.active = false;
        if (harmless) continue;
        state.lives -= 1;
        state.combo = 0;
        state.shake = 1;
        state.flash = 1;
        events |= EVENT_HIT;
        if (state.lives <= 0) {
          state.lives = 0;
          events |= EVENT_OVER;
          return events;
        }
      }
    }
    return events;
  }

  reset();
  return {
    state, reset, step, startChainAt, addToChain, endChain, snapChain,
    chainTouchesMeteor, destroyMeteorAt,
    /** How many stars the current thread holds (0 when no thread). */
    chainLength() { return chainLength; },
  };
}
