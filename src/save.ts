/**
 * Saving. Two separate things live in localStorage:
 *
 *  - `codex`: what the player has fired, for ever. Survives 重新开始.
 *  - `run`:   a snapshot of the night in progress, so closing the tab does not
 *             cost the player five minutes. Cleared when the run ends.
 *
 * Versioned, because a saved run from an older build may not fit the current
 * state shape; anything that does not parse is dropped rather than crashing.
 */

import { NIGHTS, WARES } from './sim/data';
import { evaluateKiln } from './sim/evaluate';
import { createFire, type FireState } from './sim/fire';
import type { Settlement } from './sim/score';
import type { NightDef, Piece, Verdict } from './sim/types';
import type { GameState, Phase } from './game';

const RUN_KEY = 'ba-zhuang.run.v1';
const CODEX_KEY = 'ba-zhuang.codex.v1';
const VERSION = 1;

export interface RunSave {
  v: number;
  savedAt: number;
  night: number;
  phase: Phase;
  wares: string[];
  slots: (number | null)[];
  selected: number | null;
  fire: FireState;
  samples: number[];
  trace: { t: number; v: number }[];
  peak: number;
  pieces: { uid: number; slot: number; factor: number; verdict: Verdict; quality: number; note: string }[];
  revealed: number[];
  shardMarks: { t: number; verdict: 'raw' | 'ripe' | 'burnt' }[];
  settlement: {
    coins: number;
    rep: number;
    orders: { have: number; done: boolean; reward: number }[];
    breakdown: { label: string; value: number }[];
  } | null;
  coins: number;
  rep: number;
  shards: number;
  fired: number[];
  eventAt: number | null;
}

export type Codex = Record<string, { count: number; best: string }>;

const hasStorage = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
};

function read<T>(key: string): T | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T & { v?: number };
    if (parsed && typeof parsed === 'object' && 'v' in parsed && parsed.v !== VERSION) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode: the game still plays, it just will not remember.
  }
}

// ── codex ────────────────────────────────────────────────

export function loadCodex(): Codex {
  const wrapped = read<{ v: number; codex: Codex }>(CODEX_KEY);
  return wrapped?.codex ?? {};
}

export function saveCodex(codex: Codex): void {
  write(CODEX_KEY, { v: VERSION, codex });
}

// ── run ──────────────────────────────────────────────────

export function clearRun(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function hasRun(): boolean {
  return read<RunSave>(RUN_KEY) !== null;
}

export function loadRun(): RunSave | null {
  const save = read<RunSave>(RUN_KEY);
  if (!save) return null;
  if (save.phase === 'title' || save.phase === 'end') return null;
  if (!NIGHTS[save.night]) return null;
  return save;
}

/** Snapshot of a live state. Pieces and orders are flattened to plain data. */
export function snapshot(s: GameState): RunSave {
  return {
    v: VERSION,
    savedAt: Date.now(),
    night: s.night,
    phase: s.phase,
    wares: s.wares.map((w) => w.def.id),
    slots: s.slots.slice(),
    selected: s.selected,
    fire: { ...s.fire },
    samples: s.samples.slice(),
    trace: s.trace.slice(),
    peak: s.peak,
    pieces: s.pieces.map((p) => ({
      uid: p.ware.uid,
      slot: p.slot,
      factor: p.factor,
      verdict: p.verdict,
      quality: p.quality,
      note: p.note,
    })),
    revealed: s.revealed.slice(),
    shardMarks: s.shardMarks.map((m) => ({ t: m.t, verdict: m.verdict })),
    settlement: s.settlement
      ? {
          coins: s.settlement.coins,
          rep: s.settlement.rep,
          orders: s.settlement.orders.map((o) => ({ have: o.have, done: o.done, reward: o.reward })),
          breakdown: s.settlement.breakdown.map((b) => ({ label: b.label, value: b.value })),
        }
      : null,
    coins: s.coins,
    rep: s.rep,
    shards: s.shards,
    fired: s.fired.slice(),
    eventAt: s.event ? s.event.at : null,
  };
}

export function saveRun(s: GameState): void {
  write(RUN_KEY, snapshot(s));
}

/** Rebuild a live state from a save. Returns null if the save is inconsistent. */
export function restore(save: RunSave, collected: Codex): GameState | null {
  const night: NightDef | undefined = NIGHTS[save.night];
  if (!night) return null;
  const wares = save.wares.map((id, uid) => {
    const def = WARES[id];
    return def ? { uid, def } : null;
  });
  if (wares.some((w) => w === null)) return null;

  const pieces: Piece[] = save.pieces
    .map((p) => {
      const ware = wares[p.uid];
      if (!ware) return null;
      return { ware, slot: p.slot, factor: p.factor, verdict: p.verdict, quality: p.quality, note: p.note };
    })
    .filter((p): p is Piece => p !== null);

  let settlement: Settlement | null = null;
  if (save.settlement) {
    settlement = {
      coins: save.settlement.coins,
      rep: save.settlement.rep,
      orders: save.settlement.orders.map((o, i) => ({
        order: night.orders[i],
        have: o.have,
        done: o.done,
        reward: o.reward,
      })),
      breakdown: save.settlement.breakdown,
    };
  }

  const eventDef = save.eventAt !== null ? night.events.find((e) => e.at === save.eventAt) : undefined;

  return {
    phase: save.phase,
    night: save.night,
    wares: wares as GameState['wares'],
    slots: save.slots.slice(),
    selected: save.selected,
    fire: { ...createFire(night.wood), ...save.fire },
    samples: save.samples.slice(),
    peak: save.peak,
    pieces,
    revealed: save.revealed.slice(),
    shardMarks: save.shardMarks.slice(),
    trace: save.trace.slice(),
    collected,
    settlement,
    coins: save.coins,
    rep: save.rep,
    shards: save.shards,
    shard: null,
    event: eventDef ? { def: eventDef, at: eventDef.at } : null,
    fired: save.fired.slice(),
    log: [],
    toast: null,
    toastAt: 0,
    lastQuarter: Math.floor(save.fire.t / 18) + 1,
  };
}

/** Only used by tests: recompute what the kiln produced, to check a save agrees. */
export function reevaluate(state: GameState): Piece[] {
  const firing = {
    peak: state.peak,
    stress: state.fire.stress,
    shock: state.fire.shock,
    inBand: state.fire.inBand,
    duration: state.fire.t,
  };
  return evaluateKiln(state.wares, state.slots, firing, 20261201 + state.night, state.night === 2);
}

/** A short line for the title screen: “第二夜 · 烧窑中 · 还剩 3 分”. */
export function describe(save: RunSave): string {
  const labels: Record<Phase, string> = {
    title: '未开始',
    brief: '看夜次',
    load: '满窑',
    fire: '烧窑中',
    open: '开窑',
    settle: '清点',
    end: '已收工',
  };
  const night = ['第一夜', '第二夜', '第三夜'][save.night] ?? '第？夜';
  const left = Math.max(0, Math.round((216 - save.fire.t) / 60));
  const tail = save.phase === 'fire' ? ` · 还剩约 ${left} 分钟` : '';
  return `${night} · ${labels[save.phase] ?? ''}${tail}`;
}
