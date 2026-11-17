// Penjahit Bintang — boot and the one loop: input is read every frame, the
// world advances in fixed 1/60 s steps, and the renderer paints what is
// there. The game moves between five screens: title, play, paused, game
// over and win. Dragging stitches stars; Space pauses, R restarts.
//
// ?seed=N fixes the falling pattern. ?shot=start|play|win|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BONUS, EVENT_HIT, EVENT_LEVEL, EVENT_OVER, EVENT_SNAP, EVENT_STITCH, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    // A staged scene may carry a pointer (the play shot's mid-drag needle).
    renderer.draw(world.state, scene.screen, scene.best, scene.pointer ?? null);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    screen = SCREEN_PLAY;
    audio.resume();
    audio.click();
    announce(`Bermain. Jahit ${world.state.required} bintang ${['emas', 'cyan', 'mawar'][world.state.targetKind]}. ${LIVES} nyawa.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Langit selesai dijahit! Skor ${world.state.score}. Terbaik ${best}.` : `Game over. Skor ${world.state.score}. Terbaik ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PLAY) {
      // Space pauses mid-game too (it only starts the game on the panels).
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Bermain.');
    }
  }

  function handlePointer() {
    const edges = input.takePointerEdges();
    const pointer = input.pointer;
    if (edges.pressed && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
      return;
    }
    if (edges.pressed && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Bermain.');
      return;
    }
    if (screen !== SCREEN_PLAY) {
      // A stray release after a screen change must not leave a thread open.
      if (edges.released && world.state.chain.active) world.snapChain();
      return;
    }
    const field = renderer.toField(pointer.x, pointer.y);
    if (edges.pressed) {
      audio.resume();
      if (world.startChainAt(field.x, field.y)) audio.pluck(1);
    } else if (pointer.down && pointer.moved) {
      if (world.chainTouchesMeteor(field.x, field.y)) {
        // The thread cuts the meteor apart (+5) instead of just snapping.
        if (world.destroyMeteorAt(field.x, field.y)) audio.thud();
        else audio.snap();
        world.snapChain();
      } else {
        const length = world.addToChain(field.x, field.y);
        if (length > 0) audio.pluck(length);
      }
      pointer.moved = false;
    }
    if (edges.released) {
      const events = world.endChain();
      if (events & EVENT_STITCH) {
        audio.stitch(world.state.combo);
        if (events & EVENT_BONUS) announce(`Bintang harapan! +50 dan 1 nyawa kembali. Skor ${world.state.score}.`);
        else announce(`Dijahit! Skor ${world.state.score}.`);
      }
      if (events & EVENT_SNAP) audio.snap();
      if (events & EVENT_LEVEL) {
        audio.levelUp();
        announce(world.state.banner);
      }
      if (events & EVENT_WIN) {
        audio.win();
        endGame(true);
      }
    }
  }

  function stepWorld() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, true);
      return;
    }
    const events = world.step(STEP, false);
    if (events & EVENT_HIT) {
      audio.thud();
      announce(world.state.lives === 1 ? 'Meteor! 1 nyawa tersisa.' : `Meteor! ${world.state.lives} nyawa tersisa.`);
    }
    if (events & EVENT_OVER) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    // Delta-time clamp from the game skill: a long frame never jumps the world.
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    handleActions();
    handlePointer();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let remaining = dt;
      while (remaining >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        stepWorld();
        remaining -= STEP;
      }
    }
    const pointer = screen === SCREEN_PLAY && input.pointer.down
      ? renderer.toField(input.pointer.x, input.pointer.y)
      : null;
    renderer.draw(world.state, screen, best, pointer);
  }

  // Leaving the tab pauses a running game rather than letting stars fall unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    }
  });

  announce('Penjahit Bintang. Seret mouse untuk menjahit bintang. Spasi untuk mulai.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
