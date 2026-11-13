/**
 * The fire itself. One first-order model, tuned so that a careful stoker can
 * follow the night's curve and a careless one can ruin the load.
 *
 *   airflow = 0.55 + 0.22 * vent
 *   burn    = min(1, fuel) * airflow
 *   fuel   -= burn * 0.09 * dt
 *   temp   += (burn * 0.085 - (0.075 * temp + 0.010)) * dt
 */

import { clamp, type FiringResult } from './types';

export const QUARTER_SECONDS = 18;
export const QUARTERS = 12;
export const DURATION = QUARTER_SECONDS * QUARTERS;

export const FEED_FUEL_PER_SEC = 0.55;
export const FEED_WOOD_PER_SEC = 0.7;
export const MAX_FUEL = 1.2;

export interface FireState {
  temp: number;
  fuel: number;
  wood: number;
  vent: number;
  /** Seconds elapsed. */
  t: number;
  stress: number;
  /** Seconds spent moving faster than the clay likes while hot. */
  shock: number;
  inBand: number;
  feeding: boolean;
  maxRate: number;
  /** 时辰 index of the last event already shown. */
  cursor: number;
}

export interface FireStep {
  /** Wood consumed this tick, for the sound and the HUD. */
  fed: number;
  burning: boolean;
}

export function createFire(wood: number): FireState {
  return {
    temp: 0,
    fuel: 0,
    wood,
    vent: 1,
    t: 0,
    stress: 0,
    shock: 0,
    inBand: 0,
    feeding: false,
    maxRate: 0,
    cursor: 0,
  };
}

export function airflow(vent: number): number {
  return 0.55 + 0.22 * vent;
}

/** Linear interpolation of the twelve-point curve. */
export function targetAt(curve: readonly number[], t: number): number {
  const raw = clamp(t, 0, DURATION) / QUARTER_SECONDS;
  const i = Math.min(QUARTERS - 1, Math.floor(raw));
  const frac = raw - i;
  const a = curve[i] ?? 0;
  const b = curve[Math.min(QUARTERS - 1, i + 1)] ?? a;
  return a + (b - a) * frac;
}

export function quarterOf(t: number): number {
  return Math.min(QUARTERS, Math.floor(t / QUARTER_SECONDS) + 1);
}

/**
 * Advance the fire. Mutates `s`. Returns what happened so the caller can play a
 * sound or show a spark.
 */
export function stepFire(s: FireState, dt: number, curve: readonly number[]): FireStep {
  const target = targetAt(curve, s.t);
  const flow = airflow(s.vent);
  const burn = Math.min(1, s.fuel) * flow;

  let fed = 0;
  s.fuel = Math.max(0, s.fuel - burn * 0.09 * dt);
  if (s.feeding && s.wood > 0 && s.t < DURATION) {
    const want = FEED_WOOD_PER_SEC * dt;
    fed = Math.min(s.wood, want);
    s.wood -= fed;
    // Short of wood? The fire gets proportionally less.
    s.fuel = Math.min(MAX_FUEL, s.fuel + FEED_FUEL_PER_SEC * dt * (fed / want));
  }

  const before = s.temp;
  s.temp = clamp(s.temp + (burn * 0.085 - (0.075 * s.temp + 0.01)) * dt, 0, 1.05);
  const rate = (s.temp - before) / dt;
  if (rate > s.maxRate) s.maxRate = rate;

  if (s.temp > 0.45 && Math.abs(rate) > 0.055) s.shock += dt;

  const off = Math.abs(s.temp - target);
  if (off > 0.05) s.stress += (off - 0.05) * dt;
  else s.inBand += dt;

  s.t = Math.min(DURATION, s.t + dt);
  s.cursor = quarterOf(s.t);
  return { fed, burning: burn > 0.02 };
}

/** Average heat over the soak (the last three 时辰) — this is the "peak" of the firing. */
export function readPeak(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const soak = samples.slice(-3);
  return soak.reduce((a, b) => a + b, 0) / soak.length;
}

export function firingResult(s: FireState, peak: number): FiringResult {
  return {
    peak,
    stress: s.stress,
    shock: s.shock,
    inBand: s.inBand,
    duration: s.t,
  };
}
