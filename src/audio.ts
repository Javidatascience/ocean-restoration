// Tiny synthesised sound set (no audio files): soft pops, chimes and a gentle surf loop.
let ac: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
  if (master && ac) master.gain.setTargetAtTime(m ? 0 : 0.6, ac.currentTime, 0.05);
}

/** Browsers only allow audio after a user gesture, so this is called from the first tap. */
export function unlockAudio(): void {
  if (ac) {
    if (ac.state === 'suspended') void ac.resume();
    return;
  }
  try {
    ac = new AudioContext();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ac.destination);
    ambient();
    brush();
  } catch {
    ac = null;
  }
}

function ambient(): void {
  if (!ac || !master) return;
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; // brownish noise
    data[i] = last * 3;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  const g = ac.createGain();
  g.gain.value = 0.05;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.12;
  const depth = ac.createGain();
  depth.gain.value = 0.035;
  lfo.connect(depth).connect(g.gain);
  src.connect(lp).connect(g).connect(master);
  src.start();
  lfo.start();
}

let brushGain: GainNode | null = null;
/** A soft, continuous brushing noise; louder while you are actually sweeping dirt. */
function brush(): void {
  if (!ac || !master) return;
  const len = ac.sampleRate;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600;
  bp.Q.value = 0.8;
  brushGain = ac.createGain();
  brushGain.gain.value = 0;
  src.connect(bp).connect(brushGain).connect(master);
  src.start();
}
/** 0 = silent, 1 = sweeping at full tilt. */
export function setBrush(level: number): void {
  if (!ac || !brushGain) return;
  brushGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.045, ac.currentTime, 0.08);
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
  if (!ac || !master || muted) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

export const sfx = {
  pop(): void {
    const f = 480 + Math.random() * 240;
    tone(f, 0.1, 'sine', 0.16, f * 1.7);
  },
  buy(): void {
    tone(523, 0.12, 'triangle', 0.16);
    tone(784, 0.2, 'triangle', 0.16, undefined, 0.08);
  },
  unlock(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.14, undefined, i * 0.09));
  },
  deny(): void {
    tone(200, 0.09, 'sine', 0.1, 160);
  },
  power(): void {
    [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.12, 'square', 0.05, undefined, i * 0.05));
  },
  treasure(): void {
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.22, 'sine', 0.1, undefined, i * 0.07));
  },
  tab(): void {
    tone(660, 0.05, 'sine', 0.06);
  },
};
