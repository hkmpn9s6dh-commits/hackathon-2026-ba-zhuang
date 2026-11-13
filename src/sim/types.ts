/** Shared vocabulary for the kiln simulation. Pure data types, no DOM. */

export type WareKind = 'yingqing' | 'qinghua' | 'jihong';

/** Thin bodies are the ones that crack when the fire moves too fast. */
export type Body = 'thin' | 'thick';

export interface WareDef {
  id: string;
  kind: WareKind;
  /** Display name, e.g. 影青刻花碗. */
  name: string;
  /** Ideal fired heat, normalised 0..1. */
  mid: number;
  /** Half width of the acceptable band. */
  half: number;
  price: number;
  body: Body;
  /** One line the master says when it comes out well. */
  praise: string;
  /** One line when it is overfired. */
  overNote: string;
  /** One line when it is underfired. */
  underNote: string;
}

export interface Ware {
  uid: number;
  def: WareDef;
}

export type Verdict = 'over' | 'under' | 'good' | 'excellent' | 'flambe' | 'cracked';

export interface Piece {
  ware: Ware;
  slot: number;
  factor: number;
  verdict: Verdict;
  /** 0..1, how close to the middle of the band. */
  quality: number;
  note: string;
}

export interface Order {
  label: string;
  kind: WareKind;
  want: 'good' | 'excellent';
  count: number;
  reward: number;
}

export interface Choice {
  label: string;
  /** Applied to the fire state when picked. */
  wood?: number;
  fuel?: number;
  temp?: number;
  stress?: number;
  vent?: number;
  log: string;
}

export interface EventDef {
  at: number;
  title: string;
  body: string;
  choices: [Choice, Choice];
}

export interface NightDef {
  index: number;
  name: string;
  subtitle: string;
  /** Wares loaded on the tray, in order. */
  tray: string[];
  /** Twelve target heats, one per 时辰. */
  curve: number[];
  wood: number;
  events: EventDef[];
  orders: Order[];
  /** Line shown on the night card. */
  brief: string;
}

export interface FiringResult {
  peak: number;
  stress: number;
  shock: number;
  /** Seconds the fire spent inside the band around the curve. */
  inBand: number;
  duration: number;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
