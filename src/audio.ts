/** All sound is synthesised. No files, no network. */

type Sfx = 'feed' | 'vent' | 'door' | 'clink' | 'seal' | 'shard' | 'place' | 'lift' | 'load';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let fireGain: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

function makeNoise(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 2);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = 0.96 * last + 0.04 * white;
    data[i] = last * 3.2;
  }
  return buf;
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (muted) return null;
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  noise = makeNoise(ctx);

  // Continuous fire bed: filtered noise, gain driven by the flame.
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 720;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 120;
  fireGain = ctx.createGain();
  fireGain.gain.value = 0;
  src.connect(lp).connect(hp).connect(fireGain).connect(master);
  src.start();
  return ctx;
}

export function unlockAudio(): void {
  ensure();
}

export function mute(on: boolean): void {
  muted = on;
  if (master && ctx) master.gain.value = on ? 0 : 0.9;
}

export function setFireLevel(level: number): void {
  if (!fireGain || !ctx) return;
  const target = Math.max(0, Math.min(1, level)) * 0.16;
  fireGain.gain.setTargetAtTime(target, ctx.currentTime, 0.25);
}

export function sfx(name: Sfx): void {
  const ac = ensure();
  if (!ac || !master || !noise) return;
  const t = ac.currentTime;

  if (name === 'feed') {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 + Math.random() * 600;
    bp.Q.value = 0.9;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.24);
    return;
  }

  if (name === 'shard') {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.5);
    bp.Q.value = 4;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.62);
    return;
  }

  const tone = (freq: number, type: OscillatorType, dur: number, gain: number, slideTo?: number) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(master as GainNode);
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  switch (name) {
    case 'vent':
      tone(320, 'square', 0.06, 0.05, 220);
      break;
    case 'door':
      tone(96, 'sine', 0.5, 0.18, 62);
      break;
    case 'seal':
      tone(70, 'sine', 0.7, 0.26, 48);
      tone(140, 'triangle', 0.2, 0.08);
      break;
    case 'clink':
      tone(1180, 'sine', 0.5, 0.09, 900);
      break;
    case 'place':
      tone(520, 'triangle', 0.1, 0.07, 420);
      break;
    case 'lift':
      tone(700, 'sine', 0.08, 0.05, 820);
      break;
    case 'load':
      tone(180, 'triangle', 0.25, 0.1, 120);
      break;
    default:
      break;
  }
}
