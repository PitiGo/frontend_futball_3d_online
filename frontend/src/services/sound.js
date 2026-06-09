/**
 * Lightweight sound engine using the Web Audio API.
 * No binary assets: every effect is synthesized at runtime (oscillators + noise),
 * so it adds zero bytes to the bundle and works offline.
 */

const STORAGE_KEY = 'fb3d_muted';

let ctx = null;
let muted = false;

try {
  muted = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';
} catch (_) {
  muted = false;
}

function getCtx() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) {
    try {
      ctx = new AudioCtx();
    } catch (_) {
      ctx = null;
    }
  }
  return ctx;
}

/** Resume the audio context. Must be called from a user gesture (click/tap/key). */
export function initAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') {
    c.resume().catch(() => {});
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = !!value;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    }
  } catch (_) {
    /* ignore storage errors */
  }
  return muted;
}

export function toggleMuted() {
  return setMuted(!muted);
}

function tone({ freq, type = 'sine', dur = 0.15, gain = 0.2, freqEnd, delay = 0 }) {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noiseBurst({ dur = 0.2, gain = 0.3, filterFreq = 1000, type = 'lowpass' }) {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime;
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

/** Ball kick / shot: punchy thud + airy whoosh. */
export function playKick() {
  tone({ freq: 320, freqEnd: 90, type: 'square', dur: 0.12, gain: 0.16 });
  noiseBurst({ dur: 0.12, gain: 0.1, filterFreq: 1800, type: 'highpass' });
}

/** Soft bounce against walls/posts. */
export function playBounce() {
  tone({ freq: 180, freqEnd: 110, type: 'sine', dur: 0.08, gain: 0.09 });
}

/** Goal celebration: ascending arpeggio + sparkle. */
export function playGoal() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.18, gain: 0.2, delay: i * 0.09 }));
  noiseBurst({ dur: 0.4, gain: 0.07, filterFreq: 3000, type: 'highpass' });
}

/** Ball steal / tackle: short gritty thud. */
export function playTackle() {
  tone({ freq: 220, freqEnd: 60, type: 'sawtooth', dur: 0.12, gain: 0.14 });
  noiseBurst({ dur: 0.14, gain: 0.12, filterFreq: 900, type: 'lowpass' });
}

/** Speed item pickup: bright ascending sparkle. */
export function playItem() {
  tone({ freq: 880, freqEnd: 1320, type: 'triangle', dur: 0.12, gain: 0.16 });
  tone({ freq: 1320, type: 'sine', dur: 0.1, gain: 0.12, delay: 0.07 });
}

/** Referee whistle for kickoff. */
export function playWhistle() {
  tone({ freq: 2200, type: 'sine', dur: 0.16, gain: 0.14 });
  tone({ freq: 2200, type: 'sine', dur: 0.18, gain: 0.14, delay: 0.2 });
}

/** Crowd roar after a goal: a swelling band-passed noise wash. */
export function playCrowdCheer() {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime;
  const dur = 1.6;
  const bufferSize = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(700, t0);
  filter.frequency.linearRampToValueAtTime(1100, t0 + 0.4);
  filter.frequency.linearRampToValueAtTime(500, t0 + dur);
  filter.Q.value = 0.7;
  const g = c.createGain();
  // Attack → sustain → release: simulates the stadium "swell".
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.18);
  g.gain.setValueAtTime(0.22, t0 + 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

/** Short tick for the kickoff countdown digits. */
export function playCountdownTick() {
  tone({ freq: 880, type: 'square', dur: 0.07, gain: 0.08 });
}

/** Bright "GO!" cue when the countdown finishes. */
export function playCountdownGo() {
  tone({ freq: 1175, type: 'square', dur: 0.18, gain: 0.12 });
  tone({ freq: 1760, type: 'triangle', dur: 0.22, gain: 0.1, delay: 0.04 });
}
