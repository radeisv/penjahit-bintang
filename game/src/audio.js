// Procedural sound only: Web Audio oscillators, no audio files, no network.
// The context is created lazily on the first player gesture, so a screenshot
// run (no gesture) never touches audio at all.

const MASTER_GAIN = 0.22;
/** Pentatonic ladder the thread pluck climbs as a chain grows. */
const PLUCK_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context !== null) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
    } catch {
      context = null;
    }
    return context;
  }

  /** Resume (or create) the context from a user gesture. */
  function resume() {
    const ctx = ensure();
    if (ctx !== null && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, duration, type, volume, slideTo) {
    const ctx = ensure();
    if (ctx === null || master === null) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch {
      // Sound is garnish: a failure here must never break the game.
    }
  }

  /** One pluck when a star joins the thread; the pitch climbs with the chain. */
  function pluck(chainLength) {
    const note = PLUCK_NOTES[Math.min(chainLength - 1, PLUCK_NOTES.length - 1)];
    tone(note, 0.22, 'triangle', 0.5);
  }

  /** A bright chord when a constellation is stitched, higher with a bigger combo. */
  function stitch(combo) {
    const base = 523.25 * (1 + Math.min(combo, 8) * 0.06);
    tone(base, 0.35, 'triangle', 0.45);
    tone(base * 1.5, 0.35, 'sine', 0.35);
    tone(base * 2, 0.5, 'sine', 0.22);
  }

  /** The thread snaps: a short dull buzz, no life lost. */
  function snap() {
    tone(140, 0.12, 'sawtooth', 0.25, 70);
  }

  /** A meteor hits the horizon: a low thud. */
  function thud() {
    tone(90, 0.4, 'sine', 0.7, 38);
    tone(55, 0.35, 'triangle', 0.4, 30);
  }

  /** Level clear: a rising four-note arpeggio. */
  function levelUp() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notes.length; i += 1) {
      window.setTimeout(() => tone(notes[i], 0.3, 'triangle', 0.4), i * 90);
    }
  }

  /** The sky is finished: a slow warm fanfare. */
  function win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    for (let i = 0; i < notes.length; i += 1) {
      window.setTimeout(() => tone(notes[i], 0.55, 'triangle', 0.4), i * 140);
    }
  }

  /** A soft click for menus. */
  function click() {
    tone(660, 0.08, 'sine', 0.3);
  }

  return { resume, pluck, stitch, snap, thud, levelUp, win, click };
}
