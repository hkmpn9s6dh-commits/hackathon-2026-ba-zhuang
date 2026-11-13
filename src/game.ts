/** The whole game as one small state machine. No DOM in here. */

import { NIGHTS, WARES } from './sim/data';
import {
  DURATION,
  QUARTERS,
  QUARTER_SECONDS,
  createFire,
  readPeak,
  stepFire,
  targetAt,
  type FireState,
} from './sim/fire';
import { evaluateKiln } from './sim/evaluate';
import { freeSlots, forecast, slotFactor, SLOTS } from './sim/kiln';
import { ending, settle, type Settlement } from './sim/score';
import type { Choice, EventDef, Piece, Ware } from './sim/types';
import { restore, type RunSave } from './save';

export type Phase = 'title' | 'brief' | 'load' | 'fire' | 'open' | 'settle' | 'end';

export type HintTarget = 'tray' | 'slot' | 'seal' | 'feed' | 'vent' | 'shard' | 'next' | null;

export interface ActiveEvent {
  def: EventDef;
  at: number;
}

export interface Shard {
  temp: number;
  verdict: 'raw' | 'ripe' | 'burnt';
  label: string;
}

export interface GameState {
  phase: Phase;
  night: number;
  wares: Ware[];
  /** slots[i] = uid of the ware in chamber i, or null. */
  slots: (number | null)[];
  selected: number | null;
  fire: FireState;
  samples: number[];
  peak: number;
  pieces: Piece[];
  /** Indices into pieces that have been taken out of the kiln. */
  revealed: number[];
  /** Where the fire stood each time a shard came out. */
  shardMarks: { t: number; verdict: Shard['verdict'] }[];
  /** The fire's own history, sampled a few times a second. */
  trace: { t: number; v: number }[];
  /** Everything this player has ever fired, for the 瓷谱. */
  collected: Record<string, { count: number; best: string }>;
  settlement: Settlement | null;
  coins: number;
  rep: number;
  shards: number;
  shard: Shard | null;
  event: ActiveEvent | null;
  /** Indices of events already fired this night. */
  fired: number[];
  log: { text: string; at: number }[];
  toast: string | null;
  toastAt: number;
  lastQuarter: number;
}

const EMPTY_SLOTS = (): (number | null)[] => Array.from({ length: SLOTS }, () => null);

export class Game {
  state: GameState = this.fresh();
  /** Set by the shell so the collection can be written to disk. */
  onCodex: ((codex: GameState['collected']) => void) | null = null;

  private fresh(): GameState {
    return {
      phase: 'title',
      night: 0,
      wares: [],
      slots: EMPTY_SLOTS(),
      selected: null,
      fire: createFire(0),
      samples: [],
      peak: 0,
      pieces: [],
      revealed: [],
      shardMarks: [],
      trace: [],
      collected: {},
      settlement: null,
      coins: 0,
      rep: 0,
      shards: 3,
      shard: null,
      event: null,
      fired: [],
      log: [],
      toast: null,
      toastAt: 0,
      lastQuarter: 0,
    };
  }

  get nightDef() {
    return NIGHTS[this.state.night] ?? NIGHTS[NIGHTS.length - 1];
  }

  reset(): void {
    this.state = this.fresh();
  }

  /** Come back to a night that was interrupted. */
  resume(save: RunSave): boolean {
    const state = restore(save, this.state.collected);
    if (!state) return false;
    this.state = state;
    this.say('回来了。火还在。');
    return true;
  }

  /** Adopt the collection that was on disk. */
  seedCodex(codex: GameState['collected']): void {
    this.state.collected = { ...codex, ...this.state.collected };
  }

  begin(): void {
    this.reset();
    this.state.phase = 'brief';
  }

  /** Enter the kiln with the tray for the current night. */
  enter(): void {
    const n = this.nightDef;
    const wares: Ware[] = n.tray.map((id, uid) => ({ uid, def: WARES[id] }));
    this.state.wares = wares;
    this.state.slots = EMPTY_SLOTS();
    this.state.selected = null;
    this.state.fire = createFire(n.wood);
    this.state.samples = [];
    this.state.peak = 0;
    this.state.pieces = [];
    this.state.revealed = [];
    this.state.shardMarks = [];
    this.state.trace = [];
    this.state.settlement = null;
    this.state.shards = 3;
    this.state.shard = null;
    this.state.event = null;
    this.state.fired = [];
    this.state.toast = null;
    this.state.lastQuarter = 0;
    this.state.phase = 'load';
    this.say(n.brief);
  }

  say(text: string): void {
    this.state.log.push({ text, at: performance.now() });
    if (this.state.log.length > 40) this.state.log.shift();
  }

  select(uid: number | null): void {
    if (this.state.phase !== 'load') return;
    this.state.selected = this.state.selected === uid ? null : uid;
  }

  /** Put the selected ware into a chamber. Returns false when the move is illegal. */
  place(slot: number): boolean {
    const s = this.state;
    if (s.phase !== 'load') return false;
    if (slot < 0 || slot >= SLOTS) return false;
    if (!s.wares.some((w) => w.uid === s.selected)) return false;
    if (s.slots[slot] !== null) return false;
    s.slots[slot] = s.selected;
    s.selected = null;
    return true;
  }

  unplace(slot: number): void {
    const s = this.state;
    if (s.phase !== 'load') return;
    s.slots[slot] = null;
  }

  filled(): number {
    return SLOTS - freeSlots(this.state.slots);
  }

  /** Seal the kiln and start the fire. Needs at least one ware in. */
  seal(): boolean {
    const s = this.state;
    if (s.phase !== 'load' || this.filled() === 0) return false;
    s.phase = 'fire';
    s.fire.vent = 1;
    s.fire.cursor = 0;
    this.say('封窑。火从窑头起。');
    return true;
  }

  feed(on: boolean): void {
    this.state.fire.feeding = on;
  }

  setVent(v: number): void {
    const s = this.state;
    if (s.phase !== 'fire') return;
    s.fire.vent = Math.max(0, Math.min(3, Math.round(v)));
  }

  pullShard(): Shard | null {
    const s = this.state;
    if (s.phase !== 'fire' || s.shards <= 0 || s.event) return null;
    s.shards -= 1;
    const peak = this.nightDef.curve[QUARTERS - 1];
    const ratio = s.fire.temp / (peak || 1);
    const shard: Shard =
      ratio < 0.82
        ? { temp: s.fire.temp, verdict: 'raw', label: '釉还哑着，边上挂着没熔的釉珠' }
        : ratio > 1.06
          ? { temp: s.fire.temp, verdict: 'burnt', label: '釉已经流到足上，再烧就粘窑' }
          : { temp: s.fire.temp, verdict: 'ripe', label: '釉面流平，光从胎里透出来' };
    s.shard = shard;
    s.shardMarks.push({ t: s.fire.t, verdict: shard.verdict });
    this.say(
      shard.verdict === 'raw' ? '火照子还生。' : shard.verdict === 'burnt' ? '火照子过了。' : '火照子正到。',
    );
    return shard;
  }

  closeShard(): void {
    this.state.shard = null;
  }

  /** What the master says to do with what the shard just told you. */
  shardAdvice(): string {
    const marks = this.state.shardMarks;
    const last = marks[marks.length - 1];
    if (!last) return '';
    if (last.verdict === 'raw') return '火照子还生——回去补柴，把火顶上去。';
    if (last.verdict === 'burnt') return '火照子过了——立刻收火，别再添柴。';
    return '火照子正到——稳住这个火色，等落窑。';
  }

  chooseEvent(index: 0 | 1): boolean {
    const s = this.state;
    if (!s.event) return false;
    const choice: Choice = s.event.def.choices[index];
    const f = s.fire;
    if (choice.wood) f.wood = Math.max(0, f.wood + choice.wood);
    if (choice.fuel) f.fuel = Math.max(0, Math.min(1.2, f.fuel + choice.fuel));
    if (choice.temp) f.temp = Math.max(0, Math.min(1.05, f.temp + choice.temp));
    if (choice.stress) f.stress += choice.stress;
    if (choice.vent !== undefined) f.vent = choice.vent;
    this.say(choice.log);
    s.fired.push(s.event.at);
    s.event = null;
    return true;
  }

  /** Advance the clock. Events pause the fire. */
  update(dt: number): void {
    const s = this.state;
    if (s.phase !== 'fire' || s.event || s.shard) return;
    const step = Math.min(dt, 0.05);
    const n = this.nightDef;

    stepFire(s.fire, step, n.curve);

    const last = s.trace[s.trace.length - 1];
    if (!last || s.fire.t - last.t >= 0.4) s.trace.push({ t: s.fire.t, v: s.fire.temp });

    const q = Math.floor(s.fire.t / QUARTER_SECONDS) + 1;
    if (q !== s.lastQuarter && s.fire.t < DURATION) {
      s.lastQuarter = Math.min(QUARTERS, q);
      if (s.fire.t >= QUARTER_SECONDS * (s.samples.length + 1) - 1e-6) {
        s.samples.push(s.fire.temp);
      }
    }

    if (s.fire.t >= DURATION && s.samples.length < QUARTERS) {
      s.samples.push(s.fire.temp);
    }

    const due = n.events.find((e) => !s.fired.includes(e.at) && s.fire.t >= e.at * QUARTER_SECONDS);
    if (due) {
      s.event = { def: due, at: due.at };
      s.fire.feeding = false;
      return;
    }

    if (s.fire.t >= DURATION) this.openKiln();
  }

  private openKiln(): void {
    const s = this.state;
    s.peak = readPeak(s.samples);
    const firing = { peak: s.peak, stress: s.fire.stress, shock: s.fire.shock, inBand: s.fire.inBand, duration: s.fire.t };
    s.pieces = evaluateKiln(s.wares, s.slots, firing, 20261201 + s.night, s.night === 2);
    s.revealed = [];
    s.phase = 'open';
    s.fire.feeding = false;
    this.say('落窑。等火退。');
  }

  /** Pull one specific piece out of the kiln. */
  revealPiece(index: number): boolean {
    const s = this.state;
    if (s.phase !== 'open') return false;
    if (index < 0 || index >= s.pieces.length || s.revealed.includes(index)) return false;
    s.revealed.push(index);
    const p = s.pieces[index];
    this.say(`${p.ware.def.name}：${p.note}`);
    if (s.revealed.length === s.pieces.length) this.toSettle();
    return true;
  }

  revealNext(): void {
    const s = this.state;
    if (s.phase !== 'open') return;
    const next = s.pieces.findIndex((_, i) => !s.revealed.includes(i));
    if (next >= 0) {
      this.revealPiece(next);
      return;
    }
    this.toSettle();
  }

  /** Take everything out at once. */
  revealAll(): void {
    const s = this.state;
    if (s.phase !== 'open') return;
    s.pieces.forEach((_, i) => {
      if (!s.revealed.includes(i)) s.revealed.push(i);
    });
    this.toSettle();
  }

  private toSettle(): void {
    const s = this.state;
    this.onCodex?.(s.collected);
    const rank = ['over', 'under', 'cracked', 'good', 'excellent', 'flambe'];
    for (const p of s.pieces) {
      const id = p.ware.def.id;
      const prev = s.collected[id];
      const best = prev && rank.indexOf(prev.best) > rank.indexOf(p.verdict) ? prev.best : p.verdict;
      s.collected[id] = { count: (prev?.count ?? 0) + 1, best };
    }
    const firing = { peak: s.peak, stress: s.fire.stress, shock: s.fire.shock, inBand: s.fire.inBand, duration: s.fire.t };
    s.settlement = settle(this.nightDef, s.pieces, firing);
    s.coins += s.settlement.coins;
    s.rep += s.settlement.rep;
    s.phase = 'settle';
  }

  next(): void {
    const s = this.state;
    if (s.phase === 'brief') {
      this.enter();
      return;
    }
    if (s.phase === 'open') {
      this.revealNext();
      return;
    }
    if (s.phase === 'settle') {
      if (s.night >= NIGHTS.length - 1) {
        s.phase = 'end';
      } else {
        s.night += 1;
        s.phase = 'brief';
      }
    }
  }

  get ending() {
    return ending(this.state.rep, this.state.coins);
  }

  /** Debug/e2e: run the fire forward without a browser frame loop. */
  fastForward(seconds: number): void {
    const until = this.state.fire.t + seconds;
    while (this.state.fire.t < until && this.state.phase === 'fire') {
      this.update(0.05);
      if (this.state.event || this.state.shard) break;
    }
  }

  /** Debug/e2e: place every ware into the best free chamber. */
  autoPlace(): void {
    for (const w of this.state.wares) {
      const peak = this.nightDef.curve[QUARTERS - 1];
      let best = -1;
      let bestScore = -Infinity;
      for (let i = 0; i < SLOTS; i++) {
        if (this.state.slots[i] !== null) continue;
        const fit = forecast(w.def, peak, slotFactor(i));
        const eff = peak * slotFactor(i);
        const score = (fit === 'fit' ? 10 : 0) - Math.abs(eff - w.def.mid);
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best >= 0) this.state.slots[best] = w.uid;
    }
    this.state.selected = null;
  }

  /**
   * The master's next line. Weak, diegetic guidance: one sentence, never a modal.
   * `target` names the control the eye should be on.
   */
  hint(): { text: string; target: HintTarget } {
    const s = this.state;
    const n = this.nightDef;
    switch (s.phase) {
      case 'title':
        return { text: '', target: null };
      case 'brief':
        return { text: '这一窑要烧什么，先看一眼；点「入窑」进去。', target: 'next' };
      case 'load': {
        const placed = this.filled();
        if (s.selected !== null) {
          return { text: '窑头最热、窑尾最凉。把它放进写着「合适」的那一格。', target: 'slot' };
        }
        if (placed === 0) {
          return { text: '先点托盘里的一件器，再点一个窑位。', target: 'tray' };
        }
        if (placed < s.wares.length) {
          return { text: `还有 ${s.wares.length - placed} 件没入窑；不想放了就直接「封窑」。`, target: 'seal' };
        }
        return { text: '窑满了，点「封窑」点火。', target: 'seal' };
      }
      case 'fire': {
        const f = s.fire;
        if (s.event) return { text: '', target: null };
        if (s.shard) return { text: '', target: null };
        const mark = s.shardMarks[s.shardMarks.length - 1];
        if (mark && f.t - mark.t < 9) return { text: this.shardAdvice(), target: null };
        if (s.night === 0 && f.t < 6) {
          return { text: '那张火路图：虚线是这一窑该走的路，实线是你的火，压着它走。', target: 'feed' };
        }
        if (f.t < 2.5) return { text: '按住「投柴」，火才起得来。', target: 'feed' };
        const off = f.temp - this.target;
        if (off < -0.07) return { text: '火头低了：投柴，或者把火眼开大一档。', target: 'feed' };
        if (off > 0.07) return { text: '火头高了：松开柴，把火眼收小一档。', target: 'vent' };
        if (f.t > DURATION * 0.5 && s.shards > 0) {
          return { text: '火候差不多了，拉一片火照子看看釉到没到。', target: 'shard' };
        }
        if (f.t > DURATION * 0.88) return { text: '快落窑了，稳住火路，别贪最后一把柴。', target: null };
        return { text: '跟着火路图走：低了加柴，高了收火。', target: null };
      }
      case 'open':
        return { text: '点窑里的一件器，把它取出来。', target: null };
      case 'settle':
        return { text: s.night >= 2 ? '点「看结局」。' : '点「下一夜」。', target: 'next' };
      default:
        return { text: '', target: null };
    }
    void n;
  }

  get target(): number {
    return targetAt(this.nightDef.curve, this.state.fire.t);
  }
}
