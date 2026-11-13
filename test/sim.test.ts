import { describe, expect, it } from 'vitest';
import { NIGHTS, WARES } from '../src/sim/data';
import { DURATION, QUARTER_SECONDS, createFire, readPeak, stepFire, targetAt, type FireState } from '../src/sim/fire';
import { evaluateKiln, evaluatePiece, mulberry32 } from '../src/sim/evaluate';
import { forecast, slotFactor, SLOTS, freeSlots } from '../src/sim/kiln';
import { ending, orderProgress, pieceValue, settle, VERDICT_LABEL } from '../src/sim/score';
import type { FiringResult, NightDef, Ware } from '../src/sim/types';

const wares = (ids: string[]): Ware[] => ids.map((id, uid) => ({ uid, def: WARES[id] }));
const firing = (peak: number, stress = 0, shock = 0): FiringResult => ({
  peak,
  stress,
  shock,
  inBand: 0,
  duration: DURATION,
});

/** A careful stoker: chase the curve, waste nothing. */
function stoke(night: NightDef, ventCap = 3, feedLag = 0.002) {
  const s = createFire(night.wood);
  const samples: number[] = [];
  const dt = 0.1;
  while (s.t < DURATION - 1e-9) {
    const target = targetAt(night.curve, s.t);
    const gap = target - s.temp;
    s.vent = gap > 0.12 ? Math.min(3, ventCap) : gap > 0.04 ? Math.min(2, ventCap) : gap > 0.005 ? Math.min(1, ventCap) : 0;
    s.feeding = gap > feedLag;
    stepFire(s, dt, night.curve);
    if (Math.abs(s.t / QUARTER_SECONDS - Math.round(s.t / QUARTER_SECONDS)) < dt / QUARTER_SECONDS / 2) {
      samples.push(s.temp);
    }
  }
  return { state: s, peak: readPeak(samples) };
}

describe('kiln geometry (AC-2, AC-3)', () => {
  it('has twelve chambers', () => {
    expect(SLOTS).toBe(12);
    expect(freeSlots(Array(12).fill(null))).toBe(12);
  });

  it('窑头上 is the hottest chamber and 窑尾底 the coolest', () => {
    expect(slotFactor(0)).toBeCloseTo(1.16 * 1.06, 6);
    expect(slotFactor(11)).toBeCloseTo(0.86 * 0.88, 6);
    expect(slotFactor(0)).toBeGreaterThan(slotFactor(11));
  });

  it('forecast splits over / fit / under for 影青 at peak 0.5', () => {
    const bowl = WARES['yingqing-bowl'];
    expect(forecast(bowl, 0.5, slotFactor(0))).toBe('over');
    expect(forecast(bowl, 0.5, slotFactor(5))).toBe('fit');
    expect(forecast(bowl, 0.5, slotFactor(11))).toBe('under');
  });
});

describe('fire (AC-5)', () => {
  it('interpolates the curve across twelve 时辰', () => {
    const c = NIGHTS[0].curve;
    expect(targetAt(c, 0)).toBeCloseTo(c[0], 6);
    expect(targetAt(c, QUARTER_SECONDS * 11.5)).toBeCloseTo((c[11] + c[11]) / 2, 6);
    expect(targetAt(c, DURATION)).toBeCloseTo(c[11], 6);
  });

  it('full fuel and wide vent approach the top of the scale', () => {
    const s = createFire(999);
    s.vent = 3;
    s.fuel = 1.2;
    s.feeding = true;
    for (let i = 0; i < 600; i++) stepFire(s, 0.1, NIGHTS[1].curve);
    expect(s.temp).toBeGreaterThan(0.95);
    expect(s.temp).toBeLessThanOrEqual(1.05);
  });

  it('cutting the wood drops the heat by at least 0.15 in 20 s', () => {
    const s = createFire(999);
    s.vent = 2;
    s.fuel = 1.2;
    s.feeding = true;
    for (let i = 0; i < 400; i++) stepFire(s, 0.1, NIGHTS[1].curve);
    const hot = s.temp;
    s.feeding = false;
    for (let i = 0; i < 200; i++) stepFire(s, 0.1, NIGHTS[1].curve);
    expect(hot - s.temp).toBeGreaterThan(0.15);
  });

  it('burns through the night stock without running dry when played well', () => {
    for (const night of NIGHTS) {
      const r = stoke(night);
      expect(r.state.wood).toBeGreaterThan(0);
      expect(r.peak).toBeCloseTo(night.curve[11], 1);
    }
  });

  it('a careless stoker (wide open all night) overshoots badly', () => {
    const night = NIGHTS[0];
    const s = createFire(night.wood);
    s.vent = 3;
    s.feeding = true;
    for (let i = 0; i < DURATION * 10; i++) stepFire(s, 0.1, night.curve);
    expect(s.temp).toBeGreaterThan(night.curve[11] + 0.25);
  });
});

describe('evaluation (AC-9)', () => {
  const bowl = WARES['yingqing-bowl'];
  const noRnd = () => 0.5;

  it('overfired when the chamber runs hot', () => {
    expect(evaluatePiece(bowl, slotFactor(0), firing(0.55), noRnd).verdict).toBe('over');
  });

  it('underfired when the chamber runs cold', () => {
    expect(evaluatePiece(bowl, slotFactor(11), firing(0.55), noRnd).verdict).toBe('under');
  });

  it('excellent in the middle of the band, good at its edge', () => {
    const centre = evaluatePiece(bowl, slotFactor(5), firing(0.5), noRnd);
    const edge = evaluatePiece(bowl, slotFactor(6), firing(0.5), noRnd);
    expect(centre.verdict).toBe('excellent');
    expect(edge.verdict).toBe('good');
    expect(centre.quality).toBeGreaterThan(edge.quality);
  });

  it('thin bodies crack when the fire raced while hot', () => {
    const p = evaluatePiece(bowl, slotFactor(4), firing(0.5, 0, 12), noRnd);
    expect(p.verdict).toBe('cracked');
    expect(p.note).toContain('惊纹');
  });

  it('窑变 only shows up on the third night, and is rare', () => {
    const seen = new Set<string>();
    const rnd = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      seen.add(evaluatePiece(bowl, slotFactor(5), firing(0.5), rnd, true).verdict);
    }
    expect(seen.has('flambe')).toBe(true);
    const never = evaluatePiece(bowl, slotFactor(5), firing(0.5), () => 0, false);
    expect(never.verdict).toBe('excellent');
  });

  it('evaluateKiln walks the slots in order and skips empty ones', () => {
    const w = wares(['yingqing-bowl', 'yingqing-bowl']);
    const slots: (number | null)[] = Array(12).fill(null);
    slots[5] = 0;
    slots[6] = 1;
    const pieces = evaluateKiln(w, slots, firing(0.5), 1);
    expect(pieces.map((p) => p.slot)).toEqual([5, 6]);
    expect(pieces[0].verdict).toBe('excellent');
  });
});

describe('settlement (AC-10)', () => {
  it('counts orders by kind and grade', () => {
    const w = wares(['yingqing-bowl', 'yingqing-bowl', 'qinghua-bowl']);
    const slots: (number | null)[] = Array(12).fill(null);
    slots[5] = 0;
    slots[6] = 1;
    slots[7] = 2;
    const pieces = evaluateKiln(w, slots, firing(0.5), 1);
    expect(orderProgress(NIGHTS[0].orders[0], pieces)).toBe(2);
    const s = settle(NIGHTS[0], pieces, firing(0.5));
    expect(s.orders[0].done).toBe(false);
    expect(s.coins).toBeGreaterThan(0);
  });

  it('a full order pays the reward and lifts reputation', () => {
    const w = wares(['yingqing-bowl', 'yingqing-bowl', 'yingqing-bowl']);
    const slots: (number | null)[] = Array(12).fill(null);
    slots[5] = 0;
    slots[6] = 1;
    slots[7] = 2;
    const pieces = evaluateKiln(w, slots, firing(0.5), 1);
    const s = settle(NIGHTS[0], pieces, firing(0.5));
    expect(s.orders[0].done).toBe(true);
    expect(s.orders[0].reward).toBe(30);
    expect(s.rep).toBeGreaterThanOrEqual(5);
  });

  it('pays 窑变 three times the base price and 过火 a pittance', () => {
    const base = WARES['jihong-vase'].price;
    const w = wares(['jihong-vase', 'jihong-vase']);
    const slots: (number | null)[] = Array(12).fill(null);
    slots[0] = 0;
    slots[11] = 1;
    const pieces = evaluateKiln(w, slots, firing(0.3), 1);
    expect(pieces.every((p) => p.verdict === 'under')).toBe(true);
    expect(pieceValue(pieces[0])).toBeLessThan(base * 0.2);
    expect(VERDICT_LABEL.under).toBe('生烧');
  });

  it('ending climbs with reputation', () => {
    expect(ending(1, 100).title).toBe('学徒');
    expect(ending(8, 200).title).toBe('上手');
    expect(ending(13, 400).title).toBe('把桩');
  });
});

describe('night definitions', () => {
  it('three nights, twelve curve points each, every tray ware exists', () => {
    expect(NIGHTS).toHaveLength(3);
    for (const n of NIGHTS) {
      expect(n.curve).toHaveLength(12);
      expect(n.tray.length).toBeLessThanOrEqual(SLOTS);
      for (const id of n.tray) expect(WARES[id]).toBeDefined();
      for (const e of n.events) expect(e.at).toBeGreaterThan(0);
    }
  });

  it('each event has two distinct choices with a log line', () => {
    for (const n of NIGHTS) {
      for (const e of n.events) {
        expect(e.choices).toHaveLength(2);
        expect(e.choices[0].label).not.toBe(e.choices[1].label);
        expect(e.choices[0].log.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('event effects (AC-6)', () => {
  const apply = (s: FireState, c: { wood?: number; fuel?: number; temp?: number }) => {
    if (c.wood) s.wood = Math.max(0, s.wood + c.wood);
    if (c.fuel) s.fuel = Math.max(0, s.fuel + c.fuel);
    if (c.temp) s.temp = Math.max(0, s.temp + c.temp);
  };

  it('湿柴 costs less wood but damps the fire', () => {
    const a = createFire(100);
    const b = createFire(100);
    a.fuel = 0.8;
    b.fuel = 0.8;
    apply(a, NIGHTS[0].events[0].choices[0]);
    apply(b, NIGHTS[0].events[0].choices[1]);
    expect(a.wood).toBeGreaterThan(b.wood);
    expect(a.fuel).toBeLessThan(b.fuel);
  });
});
