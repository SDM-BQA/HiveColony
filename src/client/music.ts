// Generative background music (Web Audio API) — no audio files needed.
// A soft pad + bass + wandering pentatonic melody with echo. The mood follows the colony.
import { getAudioContext } from './sound';

export type Mood = 'calm' | 'tense' | 'triumph';

const STORAGE_KEY = 'hivecolony:music';
const VOLUME = 0.16;
const LOOKAHEAD_S = 0.4;
const TICK_MS = 100;

// MIDI note helpers
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

type Chord = { root: number; notes: number[] }; // MIDI numbers
type Style = {
  bpm: number;
  chords: Chord[]; // each chord lasts 2 bars (16 eighth-notes)
  scale: number[]; // melody notes (MIDI)
  melodyChance: number;
  leadWave: OscillatorType;
};

const STYLES: Record<Mood, Style> = {
  calm: {
    bpm: 76,
    chords: [
      { root: 48, notes: [60, 64, 67] }, // C
      { root: 45, notes: [57, 60, 64] }, // Am
      { root: 41, notes: [57, 60, 65] }, // F
      { root: 43, notes: [55, 59, 62] }, // G
    ],
    scale: [72, 74, 76, 79, 81, 84], // C pentatonic
    melodyChance: 0.32,
    leadWave: 'sine',
  },
  tense: {
    bpm: 62,
    chords: [
      { root: 45, notes: [57, 60, 64] }, // Am
      { root: 41, notes: [57, 60, 65] }, // F
      { root: 38, notes: [53, 57, 62] }, // Dm
      { root: 40, notes: [56, 59, 64] }, // E
    ],
    scale: [69, 71, 72, 76, 77], // A minor-ish
    melodyChance: 0.2,
    leadWave: 'triangle',
  },
  triumph: {
    bpm: 96,
    chords: [
      { root: 48, notes: [60, 64, 67] }, // C
      { root: 43, notes: [59, 62, 67] }, // G
      { root: 45, notes: [60, 64, 69] }, // Am
      { root: 41, notes: [60, 65, 69] }, // F
    ],
    scale: [72, 74, 76, 79, 81, 84, 86, 88],
    melodyChance: 0.5,
    leadWave: 'triangle',
  },
};

let enabled = (() => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
})();
let mood: Mood = 'calm';
let bus: GainNode | null = null;
let timer: number | undefined;
let nextTime = 0;
let step = 0;
let lastNote = 2;
const listeners = new Set<(on: boolean) => void>();

const ensureBus = (ac: AudioContext): GainNode => {
  if (bus) return bus;
  bus = ac.createGain();
  bus.gain.value = 0;
  // dreamy echo
  const delay = ac.createDelay(1);
  delay.delayTime.value = 0.36;
  const feedback = ac.createGain();
  feedback.gain.value = 0.32;
  const wet = ac.createGain();
  wet.gain.value = 0.35;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  bus.connect(lp).connect(ac.destination);
  bus.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(lp);
  return bus;
};

const voice = (
  ac: AudioContext,
  out: AudioNode,
  freq: number,
  t0: number,
  dur: number,
  vol: number,
  type: OscillatorType,
  attack: number
) => {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
};

/** Schedule one eighth-note step of music at time t. */
const playStep = (
  ac: AudioContext,
  out: GainNode,
  t: number,
  eighth: number
) => {
  const style = STYLES[mood];
  const chordIndex = Math.floor(step / 16) % style.chords.length;
  const chord = style.chords[chordIndex] ?? style.chords[0]!;
  const pos = step % 16;

  // Pad: whole chord, swelling in, held for 2 bars.
  if (pos === 0) {
    for (const n of chord.notes) {
      voice(ac, out, hz(n), t, eighth * 16, 0.07, 'sine', 1.2);
      voice(ac, out, hz(n) * 1.003, t, eighth * 16, 0.04, 'triangle', 1.6); // slight detune for warmth
    }
  }
  // Bass on beats 1 and 3.
  if (pos % 4 === 0)
    voice(ac, out, hz(chord.root), t, eighth * 3, 0.16, 'triangle', 0.02);

  // Melody: a random walk over the scale, favouring small steps.
  const chance = pos % 2 === 0 ? style.melodyChance : style.melodyChance * 0.4; // mostly on the beat
  if (Math.random() < chance) {
    const move = Math.round((Math.random() - 0.5) * 3);
    lastNote = Math.max(0, Math.min(style.scale.length - 1, lastNote + move));
    const note = style.scale[lastNote] ?? 72;
    voice(
      ac,
      out,
      hz(note),
      t,
      eighth * (Math.random() < 0.3 ? 3 : 1.6),
      0.09,
      style.leadWave,
      0.015
    );
  }
  step += 1;
};

const schedule = () => {
  const ac = getAudioContext();
  if (!ac || !bus || ac.state !== 'running') return;
  const eighth = 60 / STYLES[mood].bpm / 2;
  if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05;
  while (nextTime < ac.currentTime + LOOKAHEAD_S) {
    playStep(ac, bus, nextTime, eighth);
    nextTime += eighth;
  }
};

const fadeTo = (value: number, seconds: number) => {
  const ac = getAudioContext();
  if (!ac || !bus) return;
  const now = ac.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  bus.gain.linearRampToValueAtTime(value, now + seconds);
};

const start = () => {
  if (!enabled || timer !== undefined || document.hidden) return;
  const ac = getAudioContext();
  if (!ac) return;
  ensureBus(ac);
  nextTime = ac.currentTime + 0.1;
  timer = window.setInterval(schedule, TICK_MS);
  fadeTo(VOLUME, 2.5);
};

const stop = () => {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
  fadeTo(0, 0.6);
};

export const isMusicOn = (): boolean => enabled;

export const setMusicOn = (on: boolean): void => {
  enabled = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    // storage blocked — session only
  }
  if (on) start();
  else stop();
  listeners.forEach((fn) => fn(on));
};

export const onMusicChange = (fn: (on: boolean) => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const setMood = (m: Mood): void => {
  if (m === mood) return;
  mood = m;
  step = 0; // restart the progression in the new key
};

/**
 * Browsers only allow audio after a user gesture: start on the first tap,
 * and pause while the tab is hidden.
 */
export const initMusic = (): (() => void) => {
  const onGesture = () => start();
  const onVisibility = () => {
    const ac = getAudioContext();
    if (document.hidden) {
      stop();
      void ac?.suspend();
    } else {
      void ac?.resume();
      start();
    }
  };
  window.addEventListener('pointerdown', onGesture);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('pointerdown', onGesture);
    document.removeEventListener('visibilitychange', onVisibility);
    stop();
  };
};
