/** What comes out of the kiln. Deterministic given a seed, so tests can pin it. */

import { effectiveHeat, forecast, slotFactor } from './kiln';
import type { FiringResult, Piece, Verdict, Ware, WareDef } from './types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PieceOutcome {
  verdict: Verdict;
  quality: number;
  note: string;
}

const CRACK_NOTE = '釉面开了一道惊纹，出窑就听见响。';

/**
 * @param allowFlambe night three only: a perfect piece may come out 窑变.
 */
export function evaluatePiece(
  def: WareDef,
  factor: number,
  firing: FiringResult,
  rnd: () => number,
  allowFlambe = false,
): PieceOutcome {
  const eff = effectiveHeat(firing.peak, factor);
  const fit = forecast(def, firing.peak, factor);
  const quality = Math.max(0, Math.min(1, 1 - Math.abs(eff - def.mid) / def.half));

  if (fit === 'over') return { verdict: 'over', quality, note: def.overNote };
  if (fit === 'under') return { verdict: 'under', quality, note: def.underNote };

  if (firing.shock > 6 && def.body === 'thin' && factor > 1.05) {
    return { verdict: 'cracked', quality, note: CRACK_NOTE };
  }

  if (quality >= 0.74) {
    if (allowFlambe && rnd() < 0.12) {
      return { verdict: 'flambe', quality, note: '釉色在窑里走了一遭，红里透出青——窑变。' };
    }
    return { verdict: 'excellent', quality, note: def.praise };
  }
  return { verdict: 'good', quality, note: '合格。' };
}

/** `slots[i]` holds the uid of the ware in chamber i, or null. */
export function evaluateKiln(
  wares: readonly Ware[],
  slots: readonly (number | null)[],
  firing: FiringResult,
  seed: number,
  allowFlambe = false,
): Piece[] {
  const rnd = mulberry32(seed);
  const byUid = new Map(wares.map((w) => [w.uid, w]));
  const out: Piece[] = [];
  slots.forEach((uid, slot) => {
    if (uid === null) return;
    const ware = byUid.get(uid);
    if (!ware) return;
    const factor = slotFactor(slot);
    const o = evaluatePiece(ware.def, factor, firing, rnd, allowFlambe);
    out.push({ ware, slot, factor, verdict: o.verdict, quality: o.quality, note: o.note });
  });
  return out;
}
