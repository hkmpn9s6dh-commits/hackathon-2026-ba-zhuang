/** Kiln geometry: twelve chambers, each with a fire position factor. */

import type { WareDef } from './types';

export const COLS = 3;
export const ROWS = 4;
export const SLOTS = COLS * ROWS;

/** 窑头 (next to the firebox) is hottest, 窑尾 (next to the chimney) coolest. */
export const COL_F = [1.16, 1.0, 0.86] as const;
/** Upper chambers run hotter than the floor of the chamber. */
export const ROW_F = [1.06, 1.0, 0.94, 0.88] as const;

export const COL_NAMES = ['窑头', '窑身', '窑尾'] as const;
export const ROW_NAMES = ['上', '中', '下', '底'] as const;

export const slotCol = (i: number): number => Math.floor(i / ROWS);
export const slotRow = (i: number): number => i % ROWS;

export function slotFactor(i: number): number {
  return COL_F[slotCol(i)] * ROW_F[slotRow(i)];
}

export function slotName(i: number): string {
  return `${COL_NAMES[slotCol(i)]}${ROW_NAMES[slotRow(i)]}`;
}

export type Fit = 'over' | 'fit' | 'under';

/** What the master expects if this ware sits in this chamber and the night peaks at `peak`. */
export function forecast(def: WareDef, peak: number, factor: number): Fit {
  const eff = peak * factor;
  if (eff > def.mid + def.half + 0.02) return 'over';
  if (eff < def.mid - def.half - 0.02) return 'under';
  return 'fit';
}

/** Where the ware would land, 0..1, for the little bar on the card. */
export function effectiveHeat(peak: number, factor: number): number {
  return peak * factor;
}

/** Count how many chambers are still free. */
export function freeSlots(slots: readonly (number | null)[]): number {
  return slots.reduce<number>((n, s) => (s === null ? n + 1 : n), 0);
}
