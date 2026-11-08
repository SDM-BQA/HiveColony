// Tiny synthesized sound effects (Web Audio API) — no audio files needed.

const STORAGE_KEY = 'hivecolony:muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = (() => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
})();

const listeners = new Set<(m: boolean) => void>();

export const isMuted = (): boolean => muted;

export const setMuted = (m: boolean): void => {
  muted = m;
  try {
    window.localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
  } catch {
    // storage blocked — keep the setting for this session only
  }
  listeners.forEach((fn) => fn(m));
};

export const onMuteChange = (fn: (m: boolean) => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Shared AudioContext (also used by the background music). */
export const getAudioContext = (): AudioContext | null => {
  if (typeof window.AudioContext !== 'function') return null;
  try {
    if (!ctx) ctx = new window.AudioContext();
    if (ctx.state === 'suspended' && !document.hidden) void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

const audio = (): { ac: AudioContext; out: GainNode } | null => {
  if (muted) return null;
  const ac = getAudioContext();
  if (!ac) return null;
  if (!master) {
    master = ac.createGain();
    master.gain.value = 0.35;
    master.connect(ac.destination);
  }
  return { ac, out: master };
};

type Wave = OscillatorType;

/** One enveloped tone. `at` is seconds from now. */
const tone = (
  freq: number,
  dur: number,
  type: Wave = 'sine',
  vol = 0.5,
  at = 0,
  slideTo?: number
) => {
  const a = audio();
  if (!a) return;
  const t0 = a.ac.currentTime + at;
  const osc = a.ac.createOscillator();
  const g = a.ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
};

/** Filtered noise burst (thuds, whooshes, thunder). */
const noise = (
  dur: number,
  vol = 0.4,
  freq = 800,
  at = 0,
  type: BiquadFilterType = 'lowpass'
) => {
  const a = audio();
  if (!a) return;
  const t0 = a.ac.currentTime + at;
  const len = Math.max(1, Math.floor(a.ac.sampleRate * dur));
  const buf = a.ac.createBuffer(1, len, a.ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ac.createBufferSource();
  src.buffer = buf;
  const filter = a.ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = a.ac.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(a.out);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
};

const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5]; // C major pentatonic-ish

export const sfx = {
  /** UI tap. */
  click: () => tone(900, 0.05, 'triangle', 0.25),
  /** Mini-game hit; pitch climbs with your streak. */
  hit: (streak: number) =>
    tone(
      NOTES[Math.min(streak, NOTES.length - 1)] ?? 880,
      0.12,
      'triangle',
      0.45
    ),
  /** Tapped a scorpion. */
  bad: () => {
    tone(160, 0.22, 'sawtooth', 0.35, 0, 90);
    noise(0.12, 0.25, 600);
  },
  /** A shift finished successfully. */
  shift: () => {
    tone(659.25, 0.12, 'triangle', 0.4);
    tone(987.77, 0.22, 'triangle', 0.4, 0.09);
  },
  /** Placed a new building. */
  build: () => {
    noise(0.12, 0.5, 300);
    tone(220, 0.1, 'square', 0.18);
    tone(1318.5, 0.18, 'sine', 0.25, 0.08);
    tone(1760, 0.2, 'sine', 0.2, 0.14);
  },
  /** Upgraded a building. */
  upgrade: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, 0.16, 'triangle', 0.35, i * 0.07)
    );
  },
  /** The island grew. */
  expand: () => {
    noise(0.8, 0.35, 250);
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, 0.25, 'triangle', 0.3, 0.1 + i * 0.09)
    );
  },
  /** A Great Hive stage. */
  wonder: () => {
    tone(261.63, 0.5, 'sawtooth', 0.12);
    [523.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, 0.4, 'triangle', 0.3, 0.05 + i * 0.12)
    );
  },
  /** The colony won! */
  victory: () => {
    const fanfare: [number, number, number][] = [
      [523.25, 0, 0.18],
      [523.25, 0.18, 0.12],
      [523.25, 0.3, 0.12],
      [698.46, 0.42, 0.5],
      [783.99, 0.95, 0.18],
      [698.46, 1.13, 0.18],
      [783.99, 1.31, 0.18],
      [1046.5, 1.5, 0.9],
    ];
    fanfare.forEach(([f, at, d]) => {
      tone(f, d, 'square', 0.18, at);
      tone(f * 2, d, 'triangle', 0.15, at);
    });
  },
  /** Vote cast. */
  vote: () => {
    tone(700, 0.06, 'square', 0.15);
    noise(0.05, 0.3, 2000, 0.02, 'highpass');
  },
  /** Something failed. */
  error: () => {
    tone(330, 0.12, 'sine', 0.3);
    tone(247, 0.2, 'sine', 0.3, 0.1);
  },
  /** A random event just happened in the world. */
  event: (text: string) => {
    if (text.startsWith('⛈️')) {
      noise(1.4, 0.6, 180); // thunder
      noise(0.3, 0.3, 1200, 0, 'highpass');
    } else if (text.startsWith('☄️')) {
      tone(1500, 0.8, 'sine', 0.2, 0, 300);
      noise(0.6, 0.3, 400, 0.6);
    } else if (text.startsWith('🤒') || text.startsWith('🔥')) {
      tone(220, 0.5, 'sawtooth', 0.15, 0, 140);
    } else {
      [659.25, 880, 1046.5].forEach((f, i) =>
        tone(f, 0.2, 'sine', 0.25, i * 0.08)
      );
    }
  },
};
