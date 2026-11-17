// The screenshot scenes behind ?shot=start|play|win|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot (find stars of the pattern's kind, stitch them in
// order, never touch a meteor), so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 30;
const LIMIT_SECONDS = 600;
const SAMPLE = STEP;

/** How many chainable stars sit within one thread-link of `star`. */
function neighbourCount(state, star) {
  let count = 0;
  for (let index = 0; index < state.stars.length; index += 1) {
    const other = state.stars[index];
    if (!other.active || other.chained || other === star) continue;
    if (other.kind !== state.targetKind && other.kind !== 3) continue;
    const dx = other.x - star.x;
    const dy = other.y - star.y;
    if (dx * dx + dy * dy <= 190 * 190) count += 1;
  }
  return count;
}

/** Cut down every meteor in reach, the way a player drags the thread through one. */
function autopilotDefend(world) {
  const state = world.state;
  for (let index = 0; index < state.meteors.length; index += 1) {
    const meteor = state.meteors[index];
    if (meteor.active && meteor.y > 0) world.destroyMeteorAt(meteor.x, meteor.y);
  }
}

/** Stitch one constellation with the world's own drag API, if one is there. */
function autopilotStitch(world) {
  const state = world.state;
  // Pick the star of the pattern's kind with the most chainable neighbours.
  let first = null;
  let firstNeighbours = -1;
  for (let index = 0; index < state.stars.length; index += 1) {
    const star = state.stars[index];
    if (!star.active || star.chained) continue;
    if (star.kind !== state.targetKind && star.kind !== 3) continue;
    const neighbours = neighbourCount(state, star);
    if (neighbours > firstNeighbours) { firstNeighbours = neighbours; first = star; }
  }
  if (first === null || firstNeighbours === 0) return;
  if (!world.startChainAt(first.x, first.y)) return;
  // Keep adding the nearest chainable star until the pattern is complete.
  for (let guard = 0; guard < 12; guard += 1) {
    if (world.chainLength() >= state.required) break;
    const before = world.chainLength();
    // Sweep the pointer across the field near the last chained star.
    const lastId = state.chain.ids[world.chainLength() - 1];
    const last = state.stars[lastId];
    let added = 0;
    for (let index = 0; index < state.stars.length; index += 1) {
      const star = state.stars[index];
      if (!star.active || star.chained) continue;
      if (star.kind !== state.targetKind && star.kind !== 3) continue;
      const dx = star.x - last.x;
      const dy = star.y - last.y;
      if (dx * dx + dy * dy > 190 * 190) continue;
      added = world.addToChain(star.x, star.y);
      if (added > before) break;
    }
    if (added <= before) break;
  }
  world.endChain();
}

/**
 * Stage a mid-drag frame: leave a thread open on 2-3 stars of the target
 * kind (one short of the pattern, so the chain is still being stitched),
 * and return the pointer position the needle should point at. Returns null
 * when no chainable group is on the field, and the caller falls back to
 * the plain play frame.
 */
function stageMidDrag(world) {
  const state = world.state;
  const wanted = Math.max(2, state.required - 1);
  // Greedy chain, like the autopilot: each new star only has to sit within
  // one link of the *last* chained star, not of the first — stars are
  // spread out, so demanding a tight cluster of three finds nothing.
  // Try every starting star and keep the widest chain: the first one found
  // can be two stars almost on top of each other, whose thread is invisible.
  let bestIds = null;
  let bestScore = -1;
  for (let index = 0; index < state.stars.length; index += 1) {
    const first = state.stars[index];
    if (!first.active || first.chained || first.age > 12) continue;
    if (first.kind !== state.targetKind && first.kind !== 3) continue;
    if (first.x < 150 || first.x > 1130 || first.y < 180 || first.y > 520) continue;
    if (neighbourCount(state, first) < 1) continue;
    if (!world.startChainAt(first.x, first.y)) continue;
    let span = 0;
    for (let guard = 0; guard < 12 && world.chainLength() < wanted; guard += 1) {
      const before = world.chainLength();
      const lastId = state.chain.ids[world.chainLength() - 1];
      const last = state.stars[lastId];
      let added = 0;
      for (let j = 0; j < state.stars.length; j += 1) {
        const star = state.stars[j];
        if (!star.active || star.chained) continue;
        if (star.kind !== state.targetKind && star.kind !== 3) continue;
        const dx = star.x - last.x;
        const dy = star.y - last.y;
        const d2 = dx * dx + dy * dy;
        // Skip a star sitting on top of the last one: its link is invisible.
        if (d2 > 190 * 190 || d2 < 70 * 70) continue;
        added = world.addToChain(star.x, star.y);
        if (added > before) { span += Math.sqrt(d2); break; }
      }
      if (added <= before) break;
    }
    if (world.chainLength() >= 2) {
      const score = world.chainLength() * 1000 + span;
      if (score > bestScore) {
        bestScore = score;
        bestIds = [];
        for (let k = 0; k < world.chainLength(); k += 1) bestIds.push(state.chain.ids[k]);
      }
    }
    world.snapChain();
  }
  if (bestIds === null) return null;
  // Re-stage the winning chain (positions have not moved since the trial).
  const firstStar = state.stars[bestIds[0]];
  if (!world.startChainAt(firstStar.x, firstStar.y)) return null;
  for (let k = 1; k < bestIds.length; k += 1) {
    const star = state.stars[bestIds[k]];
    if (world.addToChain(star.x, star.y) <= 0) { world.snapChain(); return null; }
  }
  // Point the needle at the next star the drag is heading for, if any.
  const lastId = state.chain.ids[world.chainLength() - 1];
  const last = state.stars[lastId];
  let pointer = { x: Math.min(1240, last.x + 70), y: Math.max(140, last.y - 30) };
  for (let j = 0; j < state.stars.length; j += 1) {
    const star = state.stars[j];
    if (!star.active || star.chained) continue;
    if (star.kind !== state.targetKind && star.kind !== 3) continue;
    const dx = star.x - last.x;
    const dy = star.y - last.y;
    if (dx * dx + dy * dy <= 190 * 190) { pointer = { x: star.x, y: star.y }; break; }
  }
  return pointer;
}

/**
 * Set `world` to the named scene (start, play, win or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'win' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / SAMPLE; index += 1) world.step(SAMPLE, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'end') {
    // Play well for a while, then stop: the meteors finally win.
    let timer = 0;
    let elapsed = 0;
    for (let index = 0; index < LIMIT_SECONDS / SAMPLE; index += 1) {
      timer += SAMPLE;
      elapsed += SAMPLE;
      if (elapsed < 16 && timer >= 0.4) {
        timer = 0;
        autopilotStitch(world);
        autopilotDefend(world);
      }
      if (world.step(SAMPLE, false) & EVENT_OVER) break;
    }
    world.state.flash = 0;
    world.state.shake = 0;
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  if (name === 'win') {
    // Play well until the sky is finished: stitch whenever a pattern is ready.
    let timer = 0;
    for (let index = 0; index < LIMIT_SECONDS / SAMPLE; index += 1) {
      timer += SAMPLE;
      if (timer >= 0.4) {
        timer = 0;
        autopilotStitch(world);
        autopilotDefend(world);
      }
      const events = world.step(SAMPLE, false);
      if (events & EVENT_WIN) break;
      if (events & EVENT_OVER) break;
    }
    const over = world.state.lives === 0;
    world.state.flash = 0;
    world.state.shake = 0;
    world.state.bannerTimer = 0;
    return { screen: world.state.won ? SCREEN_WIN : over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  // Play: stitch for a while, mid-game, HUD full — and freeze the frame
  // the moment a wide mid-drag thread is on the field. A single attempt
  // at the end can find no well-spaced chain at all (stars are spread
  // out), so try at every 0.4 s tick and stop as soon as one is there.
  let timer = 0;
  let pointer = null;
  for (let index = 0; index < PLAY_SECONDS / SAMPLE; index += 1) {
    timer += SAMPLE;
    if (timer >= 0.4) {
      timer = 0;
      pointer = stageMidDrag(world);
      if (pointer !== null) {
        let span = 0;
        for (let k = 1; k < world.chainLength(); k += 1) {
          const a = world.state.stars[world.state.chain.ids[k - 1]];
          const b = world.state.stars[world.state.chain.ids[k]];
          span += Math.hypot(b.x - a.x, b.y - a.y);
        }
        if (world.chainLength() >= 2 && span >= 100) break;
        world.snapChain();
        pointer = null;
      }
      autopilotStitch(world);
      autopilotDefend(world);
    }
    if (world.step(SAMPLE, false) & EVENT_OVER) break;
  }
  const over = world.state.lives === 0;
  world.state.flash = 0;
  world.state.shake = 0;
  world.state.bannerTimer = 0;
  if (!over && pointer === null) pointer = stageMidDrag(world);
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, pointer };
}
