// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 playfield is scaled to fit the window and centred, the margin
// filled with the backdrop colour. Flat vector shapes, glow circles and
// canvas text for the HUD and the panels. Text that holds a number is rebuilt
// only when the number changes, so a frame allocates nothing.

import { FIELD, FONT, KIND_COLORS, KIND_HOPE_COLOR, KIND_NAMES, LIVES, PALETTE } from './config.js';
import { KIND_HOPE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** The panel's width; its height grows with its lines. */
const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };
const LIFE_SIZE = 26;
const LIFE_GAP = 10;

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function starColor(star) {
  return star.kind === KIND_HOPE ? KIND_HOPE_COLOR : KIND_COLORS[star.kind];
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Skor ');
  const levelLabel = cachedLabel('Level ');
  const finalLabel = cachedLabel('Skor ');
  const bestLabel = cachedLabel('Terbaik ');
  const comboLabel = cachedLabel('Kombo x');

  // The background stars never move: one seeded scatter, drawn every frame.
  const backgroundStars = [];
  let seed = 1234567;
  function nextSeeded() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  // The HUD occupies the top band (score / level / lives, pattern and the
  // progress bar, y 18-104): a background star there reads as punctuation
  // on the text — a stray dot before "Level". Keep the scatter below it.
  const HUD_BOTTOM = 120;
  for (let i = 0; i < 110; i += 1) {
    backgroundStars.push({
      x: nextSeeded() * FIELD.width,
      y: HUD_BOTTOM + nextSeeded() * (FIELD.height - 120 - HUD_BOTTOM),
      r: 0.8 + nextSeeded() * 1.8,
      phase: nextSeeded() * Math.PI * 2,
      speed: 0.6 + nextSeeded() * 1.4,
    });
  }

  let skyGradient = null;
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
    skyGradient = null;
  }

  /** Convert a client (mouse) position into playfield coordinates. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.scale,
      y: (clientY - rect.top - view.y) / view.scale,
    };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawSparkle(x, y, radius, color, alpha) {
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.beginPath();
    // A four-point star: two long spikes and two short ones.
    context.moveTo(x, y - radius);
    context.quadraticCurveTo(x, y, x + radius * 0.32, y - radius * 0.32);
    context.lineTo(x + radius, y);
    context.quadraticCurveTo(x, y, x + radius * 0.32, y + radius * 0.32);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x - radius * 0.32, y + radius * 0.32);
    context.lineTo(x - radius, y);
    context.quadraticCurveTo(x, y, x - radius * 0.32, y - radius * 0.32);
    context.closePath();
    context.fill();
    context.globalAlpha = 1;
  }

  function drawGlow(x, y, radius, color, alpha) {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.globalAlpha = alpha;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }

  function drawSky(state, now) {
    if (skyGradient === null) {
      skyGradient = context.createLinearGradient(0, 0, 0, FIELD.height);
      skyGradient.addColorStop(0, PALETTE.skyTop);
      skyGradient.addColorStop(1, PALETTE.skyBottom);
    }
    context.fillStyle = skyGradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Two soft nebula blobs, fixed in place.
    drawGlow(240, 180, 260, 'rgba(78, 205, 196, 0.10)', 1);
    drawGlow(1040, 320, 300, 'rgba(255, 107, 157, 0.08)', 1);
    drawGlow(700, 90, 220, 'rgba(255, 209, 102, 0.07)', 1);
    // Twinkling background stars.
    for (let i = 0; i < backgroundStars.length; i += 1) {
      const star = backgroundStars[i];
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(now * 0.001 * star.speed + star.phase));
      context.globalAlpha = twinkle * 0.8;
      context.fillStyle = '#dfe6ff';
      context.beginPath();
      context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // The horizon the stars are stitched above: a loom line.
    context.fillStyle = PALETTE.horizon;
    context.fillRect(0, FIELD.horizonY, FIELD.width, FIELD.height - FIELD.horizonY);
    context.fillStyle = PALETTE.threadGlow;
    context.fillRect(0, FIELD.horizonY, FIELD.width, 3);
  }

  function drawStars(state, now) {
    for (let index = 0; index < state.stars.length; index += 1) {
      const star = state.stars[index];
      if (!star.active) continue;
      let alpha = 1;
      const ageLeft = 15 - star.age;
      if (ageLeft < 3) alpha = 0.25 + 0.75 * Math.abs(Math.sin(now * 0.012));
      const color = starColor(star);
      const twinkle = 1 + 0.12 * Math.sin(now * 0.006 + star.phase);
      drawGlow(star.x, star.y, star.radius * 2.1, color, 0.28 * alpha);
      drawSparkle(star.x, star.y, star.radius * twinkle, color, alpha);
      if (star.kind === KIND_HOPE) {
        context.strokeStyle = '#ffffff';
        context.globalAlpha = alpha;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(star.x, star.y, star.radius + 7, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;
      }
      if (star.chained) {
        context.strokeStyle = PALETTE.thread;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(star.x, star.y, star.radius + 4, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  function drawMeteors(state) {
    for (let index = 0; index < state.meteors.length; index += 1) {
      const meteor = state.meteors[index];
      if (!meteor.active) continue;
      context.strokeStyle = 'rgba(255, 90, 90, 0.5)';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(meteor.x, meteor.y - meteor.radius * 3);
      context.lineTo(meteor.x, meteor.y - meteor.radius);
      context.stroke();
      context.fillStyle = PALETTE.meteor;
      context.beginPath();
      context.arc(meteor.x, meteor.y, meteor.radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.meteorRim;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(meteor.x, meteor.y, meteor.radius, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = PALETTE.meteorRim;
      context.beginPath();
      context.arc(meteor.x - 5, meteor.y - 5, 4, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawThread(state, pointer) {
    const chain = state.chain;
    if (!chain.active) return;
    context.strokeStyle = PALETTE.thread;
    context.lineWidth = 4;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.beginPath();
    let first = true;
    // Rebuild the polyline from the world's chain order.
    const ids = chain.ids;
    for (let i = 0; i < ids.length; i += 1) {
      if (ids[i] === -1) break;
      const star = state.stars[ids[i]];
      if (first) { context.moveTo(star.x, star.y); first = false; }
      else context.lineTo(star.x, star.y);
    }
    if (pointer !== null) context.lineTo(pointer.x, pointer.y);
    context.stroke();
    // The needle at the pointer: a small silver triangle.
    if (pointer !== null) {
      context.fillStyle = PALETTE.needle;
      context.beginPath();
      context.moveTo(pointer.x + 14, pointer.y - 14);
      context.lineTo(pointer.x - 6, pointer.y + 2);
      context.lineTo(pointer.x + 2, pointer.y - 6);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.threadGlow;
      context.beginPath();
      context.arc(pointer.x + 8, pointer.y - 8, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawLifeStar(x, y, size, filled) {
    drawSparkle(x, y, size, filled ? PALETTE.gold : '#3a4066', filled ? 1 : 0.9);
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 30, PALETTE.text, 'left');
    text(levelLabel(state.level), FIELD.width / 2, 18, 30, PALETTE.text, 'center');
    const firstLife = FIELD.width - 24 - LIVES * (LIFE_SIZE + LIFE_GAP) + LIFE_GAP;
    text('Nyawa', firstLife - 14, 20, 26, PALETTE.text, 'right');
    for (let life = 0; life < LIVES; life += 1) {
      drawLifeStar(firstLife + life * (LIFE_SIZE + LIFE_GAP) + LIFE_SIZE / 2, 32, LIFE_SIZE / 2, life < state.lives);
    }
    // The pattern the player must stitch, and progress to the level target.
    const pattern = `Jahit ${state.required} bintang ${KIND_NAMES[state.targetKind]}`;
    text(pattern, 24, 58, 24, KIND_COLORS[state.targetKind], 'left');
    const barX = 24;
    const barY = 92;
    const barW = 320;
    const progress = Math.min(1, state.score / state.target);
    context.fillStyle = '#232a4d';
    context.fillRect(barX, barY, barW, 12);
    context.fillStyle = KIND_COLORS[state.targetKind];
    context.fillRect(barX, barY, barW * progress, 12);
    text(`Target ${state.target}`, barX + barW + 12, 86, 22, PALETTE.muted, 'left');
    if (state.combo >= 2) {
      text(comboLabel(state.combo), FIELD.width - 24, 58, 26, PALETTE.gold, 'right');
    }
    if (state.bannerTimer > 0 && state.banner !== '') {
      context.globalAlpha = Math.min(1, state.bannerTimer);
      text(state.banner, FIELD.width / 2, 130, 28, PALETTE.gold, 'center');
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 24, PALETTE.gold, 'center');
  }

  /** Paint one frame: sky, stars, meteors, thread, then HUD or a panel. */
  function draw(state, screen, best, pointer) {
    const now = performance.now();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    let shakeX = 0;
    let shakeY = 0;
    if (state.shake > 0) {
      shakeX = (Math.random() - 0.5) * 14 * state.shake;
      shakeY = (Math.random() - 0.5) * 14 * state.shake;
    }
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawSky(state, now);
    drawStars(state, now);
    drawMeteors(state);
    if (screen === SCREEN_PLAY) drawThread(state, pointer);
    if (screen === SCREEN_TITLE) {
      drawPanel('Penjahit Bintang', [
        'Seret mouse untuk menjahit bintang jadi konstelasi.',
        'Jahit bintang yang diminta sebelum jatuh — potong meteor dengan benangmu.',
        'Bintang harapan putih mengembalikan 1 nyawa.',
        'Spasi: jeda  •  R: mulai lagi  •  3 nyawa tiap permainan.',
        bestLabel(best),
      ], 'Klik atau tekan Spasi untuk mulai');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Jeda', ['Bintangnya menunggu di langit.'], 'Spasi atau P untuk lanjut');
    } else if (screen === SCREEN_OVER) {
      drawPanel('Langit Robek', [finalLabel(state.score), bestLabel(best), 'Bintangnya habis sebelum selesai dijahit.'], 'Spasi atau klik untuk main lagi');
    } else if (screen === SCREEN_WIN) {
      drawPanel('Langit Selesai Dijahit!', [finalLabel(state.score), bestLabel(best), 'Semua konstelasi bersinar — kamu penjahit langit sejati.'], 'Spasi atau klik untuk main lagi');
    }
    if (state.flash > 0) {
      context.globalAlpha = state.flash * 0.12;
      context.fillStyle = PALETTE.danger;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      context.globalAlpha = 1;
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField };
}
