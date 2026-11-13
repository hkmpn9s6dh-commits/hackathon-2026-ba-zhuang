/** DOM shell: HUD, tray, buttons, cards. Canvas does the scenery only. */

import { Game, type Phase } from '../game';
import { NIGHTS } from '../sim/data';
import { QUARTERS, QUARTER_SECONDS } from '../sim/fire';
import { forecast, slotFactor, SLOTS, COL_NAMES } from '../sim/kiln';
import { VERDICT_LABEL } from '../sim/score';
import type { WareDef } from '../sim/types';
import { computeLayout, paintWareThumb, Scene, slotRect, type Layout } from '../render/scene';
import { drawShard } from '../render/porcelain';
import { sfx, setFireLevel } from '../audio';

const EL = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

interface SlotView {
  el: HTMLDivElement;
  dot: HTMLSpanElement;
  tip: HTMLSpanElement;
}

export class App {
  readonly game = new Game();
  private readonly scene: Scene;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly overlay: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly hudNight: HTMLElement;
  private readonly hudName: HTMLElement;
  private readonly hudQuarters: HTMLElement;
  private readonly hudWood: HTMLElement;
  private readonly hudCoins: HTMLElement;
  private layout: Layout;
  private slots: SlotView[] = [];
  private signature = '';
  private toast: HTMLElement | null = null;
  private toastTimer = 0;
  private reduced = false;
  private last = 0;

  constructor() {
    this.canvas = document.getElementById('scene') as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
    this.overlay = document.getElementById('overlay') as HTMLElement;
    this.bar = document.getElementById('bar') as HTMLElement;
    this.hudNight = document.getElementById('hud-night') as HTMLElement;
    this.hudName = document.getElementById('hud-name') as HTMLElement;
    this.hudQuarters = document.getElementById('hud-quarters') as HTMLElement;
    this.hudWood = document.getElementById('hud-wood') as HTMLElement;
    this.hudCoins = document.getElementById('hud-coins') as HTMLElement;

    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scene = new Scene(this.reduced);
    this.layout = computeLayout(1, 1);

    for (let i = 0; i < QUARTERS; i++) this.hudQuarters.appendChild(EL('i'));
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
    this.bindKeys();
    this.build();
    requestAnimationFrame((t) => this.frame(t));
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.round(r.width));
    const h = Math.max(260, Math.round(r.height));
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout = computeLayout(w, h);
    this.signature = '';
    this.build();
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      const g = this.game;
      if (e.repeat) {
        if (e.code === 'Space') e.preventDefault();
        return;
      }
      if (e.code === 'Space' && g.state.phase === 'fire') {
        e.preventDefault();
        g.feed(true);
        return;
      }
      if (e.key >= '1' && e.key <= '4' && g.state.phase === 'fire') {
        g.setVent(Number(e.key) - 1);
        sfx('vent');
        return;
      }
      if ((e.key === 'q' || e.key === 'Q') && g.state.phase === 'fire') {
        this.pullShard();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        this.advance();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.game.feed(false);
    });
    window.addEventListener('blur', () => this.game.feed(false));
  }

  /** One button for "the obvious next thing" — Enter, or the primary button. */
  private advance(): void {
    const g = this.game;
    const p = g.state.phase;
    if (p === 'title') {
      g.begin();
      sfx('door');
    } else if (p === 'brief') {
      g.enter();
      sfx('load');
    } else if (p === 'load') {
      if (g.seal()) sfx('seal');
    } else if (p === 'open') {
      g.revealNext();
      sfx('clink');
    } else if (p === 'settle') {
      g.next();
      sfx('door');
    } else if (p === 'end') {
      g.reset();
      g.begin();
    }
    this.build();
  }

  private pullShard(): void {
    const shard = this.game.pullShard();
    if (shard) {
      sfx('shard');
      this.toastSay(shard.verdict === 'raw' ? '火照子还生' : shard.verdict === 'burnt' ? '火照子过了' : '火照子正到');
      this.build();
    }
  }

  private frame(now: number): void {
    const dt = this.last === 0 ? 0.016 : Math.min(0.06, (now - this.last) / 1000);
    this.last = now;
    this.game.update(dt);
    this.scene.draw(this.ctx, this.game, this.layout, now, dt);
    this.syncHud();
    const sig = this.sig();
    if (sig !== this.signature) {
      this.signature = sig;
      this.build();
    }
    setFireLevel(this.game.state.phase === 'fire' ? this.game.state.fire.temp * 0.5 : 0.12);
    this.updateToast(now);
    requestAnimationFrame((t) => this.frame(t));
  }

  private sig(): string {
    const s = this.game.state;
    return [
      s.phase,
      s.night,
      s.selected,
      s.shards,
      s.event ? s.event.def.title : '',
      s.shard ? s.shard.verdict : '',
      s.revealed,
      s.settlement ? 's' : '',
      this.game.filled(),
      this.layout.w,
      this.layout.h,
    ].join('|');
  }

  private syncHud(): void {
    const s = this.game.state;
    this.hudNight.textContent = `第${['一', '二', '三'][s.night] ?? '一'}夜`;
    this.hudName.textContent = this.game.nightDef.name;
    this.hudWood.textContent = Math.max(0, Math.round(s.fire.wood)).toString();
    this.hudCoins.textContent = s.coins.toString();
    const q = s.phase === 'fire' || s.phase === 'open' || s.phase === 'settle' ? Math.floor(s.fire.t / QUARTER_SECONDS) : -1;
    const kids = this.hudQuarters.children;
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i] as HTMLElement;
      el.className = i < q ? 'done' : i === q ? 'now' : '';
    }
  }

  private toastSay(text: string): void {
    if (!this.toast) {
      this.toast = EL('div', 'toast');
      this.overlay.appendChild(this.toast);
    }
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastTimer = performance.now() + 2600;
  }

  private updateToast(now: number): void {
    if (this.toast && this.toastTimer > 0 && now > this.toastTimer) {
      this.toast.classList.remove('show');
      this.toastTimer = 0;
    }
  }

  // ── build ───────────────────────────────────────────────

  private build(): void {
    const s = this.game.state;
    const keepToast = this.toast;
    [...this.overlay.children].forEach((c) => {
      if (c !== keepToast) c.remove();
    });
    this.bar.replaceChildren();
    this.slots = [];

    switch (s.phase) {
      case 'title':
        this.buildTitle();
        break;
      case 'brief':
        this.buildBrief();
        break;
      case 'load':
        this.buildLoad();
        break;
      case 'fire':
        this.buildFire();
        break;
      case 'open':
        this.buildOpen();
        break;
      case 'settle':
        this.buildSettle();
        break;
      case 'end':
        this.buildEnd();
        break;
    }
    if (s.event) this.buildEvent();
    if (s.shard) this.buildShard();
  }

  private buildTitle(): void {
    const wrap = EL('div', 'title-wrap');
    const inner = EL('div', 'inner');
    inner.appendChild(EL('div', 'kicker', '景德镇 · 柴窑 · 一夜'));
    inner.appendChild(EL('h1', 'big-title', '把桩'));
    inner.appendChild(EL('p', 'tagline', '一窑火，十二个时辰，一片瓷告诉你火候'));
    const acts = EL('div', 'title-actions');
    const start = EL('button', 'btn btn-primary', '点火');
    start.addEventListener('click', () => this.advance());
    acts.appendChild(start);
    inner.appendChild(acts);
    const keys = EL('div', 'keys');
    keys.innerHTML =
      '<b>空格</b>投柴　<b>1–4</b>火眼　<b>Q</b>拉一片火照子　<b>Enter</b>继续<br>鼠标也能玩：按住「投柴」，点窑位放器。';
    inner.appendChild(keys);
    wrap.appendChild(inner);
    this.overlay.appendChild(wrap);
    setFireLevel(0.12);
  }

  private buildBrief(): void {
    const n = this.game.nightDef;
    const panel = EL('div', 'panel');
    panel.appendChild(EL('div', 'kicker', `第${['一', '二', '三'][this.game.state.night]}夜`));
    panel.appendChild(EL('h2', '', n.name));
    panel.appendChild(EL('p', 'bar-hint', n.subtitle));
    const p = EL('p', '');
    p.style.marginTop = '14px';
    p.textContent = n.brief;
    panel.appendChild(p);
    const orders = EL('p', '');
    orders.style.marginTop = '10px';
    orders.style.color = 'var(--porcelain-faint)';
    orders.style.fontSize = '13px';
    orders.textContent = `本窑：${n.tray.length} 件 · ${n.orders.map((o) => o.label).join('；')} · 柴 ${n.wood} 把`;
    panel.appendChild(orders);
    const row = EL('div', 'row');
    const go = EL('button', 'btn btn-primary', '入窑');
    go.addEventListener('click', () => this.advance());
    row.appendChild(go);
    panel.appendChild(row);
    this.overlay.appendChild(panel);
    this.bar.appendChild(EL('div', 'bar-hint', '看清楚火路，再决定把哪件器放在哪一层。'));
  }

  private buildLoad(): void {
    const s = this.game.state;
    const l = this.layout;

    for (let i = 0; i < SLOTS; i++) {
      const r = slotRect(l, i);
      const el = EL('div', 'slot');
      el.style.left = `${r.x}px`;
      el.style.top = `${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
      el.dataset.index = String(i);
      const dot = EL('span', 'dot');
      const tip = EL('span', 'tip');
      el.append(dot, tip);
      if (s.slots[i] !== null) {
        el.classList.add('occupied');
      } else if (s.selected !== null) {
        el.classList.add('can');
      }
      el.addEventListener('click', () => {
        if (this.game.state.slots[i] !== null) {
          this.game.unplace(i);
          sfx('lift');
        } else if (this.game.place(i)) {
          sfx('place');
        }
        this.signature = '';
        this.build();
      });
      this.overlay.appendChild(el);
      this.slots.push({ el, dot, tip });
    }

    // Column headers above the kiln.
    const heads = EL('div', 'column-heads');
    heads.style.left = `${l.gridX}px`;
    heads.style.top = `${l.gridY - 24}px`;
    heads.style.gridTemplateColumns = `repeat(3, ${l.cell}px)`;
    heads.style.gap = `${l.gap}px`;
    for (const name of COL_NAMES) {
      const c = EL('div', 'col-label', name);
      c.style.position = 'static';
      heads.appendChild(c);
    }
    this.overlay.appendChild(heads);

    this.paintVerdicts();

    // Tray.
    const tray = EL('div', 'tray');
    for (const w of s.wares) {
      if (s.slots.includes(w.uid)) continue;
      tray.appendChild(this.trayCard(w.uid, w.def));
    }
    this.bar.appendChild(tray);

    const sealBtn = EL('button', 'btn btn-primary', '封窑');
    sealBtn.disabled = this.game.filled() === 0;
    sealBtn.addEventListener('click', () => {
      if (this.game.seal()) {
        sfx('seal');
        this.signature = '';
        this.build();
      }
    });
    this.bar.appendChild(sealBtn);
    if (this.game.filled() === 0) this.bar.insertBefore(EL('div', 'bar-hint', '先点一件器，再点一个窑位。'), this.bar.firstChild);
  }

  private trayCard(uid: number, def: WareDef): HTMLElement {
    const s = this.game.state;
    const card = EL('button', 'card');
    card.dataset.kind = def.kind;
    card.dataset.uid = String(uid);
    if (s.selected === uid) card.classList.add('selected');
    const cv = EL('canvas');
    card.appendChild(cv);
    card.appendChild(EL('span', 'cname', def.name));
    const band = EL('span', 'cband');
    const span = EL('span');
    const left = Math.max(0, def.mid - def.half);
    const width = Math.min(1, def.half * 2);
    span.style.left = `${left * 100}%`;
    span.style.width = `${width * 100}%`;
    band.appendChild(span);
    card.appendChild(band);
    requestAnimationFrame(() => paintWareThumb(cv, def, Math.min(2, window.devicePixelRatio || 1)));
    card.addEventListener('click', () => {
      this.game.select(uid);
      sfx('lift');
      this.signature = '';
      this.build();
    });
    return card;
  }

  private paintVerdicts(): void {
    const s = this.game.state;
    if (s.selected === null) {
      for (const v of this.slots) {
        delete v.el.dataset.verdict;
        v.tip.textContent = '';
      }
      return;
    }
    const ware = s.wares.find((w) => w.uid === s.selected);
    if (!ware) return;
    const peak = this.game.nightDef.curve[QUARTERS - 1];
    for (let i = 0; i < this.slots.length; i++) {
      const v = this.slots[i];
      if (s.slots[i] !== null) {
        delete v.el.dataset.verdict;
        continue;
      }
      const fit = forecast(ware.def, peak, slotFactor(i));
      v.el.dataset.verdict = fit;
      v.tip.textContent = fit === 'over' ? '过火' : fit === 'under' ? '生烧' : '合适';
    }
  }

  private buildFire(): void {
    const s = this.game.state;
    this.overlay.appendChild(
      (() => {
        const h = EL('div', 'bar-hint');
        h.style.position = 'absolute';
        h.style.left = '22px';
        h.style.top = '14px';
        h.style.fontSize = '13px';
        h.textContent = '投柴看火色；火照子只有三片。';
        return h;
      })(),
    );

    // Bottom bar: feed, vents, shard.
    const feed = EL('button', 'btn btn-fire', '投柴');
    feed.id = 'feed';
    const down = (e: PointerEvent) => {
      e.preventDefault();
      this.game.feed(true);
      feed.classList.add('on');
      sfx('feed');
    };
    const up = () => {
      this.game.feed(false);
      feed.classList.remove('on');
    };
    feed.addEventListener('pointerdown', down);
    feed.addEventListener('pointerup', up);
    feed.addEventListener('pointercancel', up);
    feed.addEventListener('pointerleave', up);
    this.bar.appendChild(feed);

    const vents = EL('div', 'vents');
    vents.appendChild(EL('span', 'vlabel', '火眼'));
    for (let i = 0; i < 4; i++) {
      const b = EL('button', 'vent', String(i));
      if (s.fire.vent === i) b.classList.add('on');
      b.addEventListener('click', () => {
        this.game.setVent(i);
        sfx('vent');
        this.signature = '';
        this.build();
      });
      vents.appendChild(b);
    }
    this.bar.appendChild(vents);
    this.bar.appendChild(EL('div', 'bar-spacer'));

    const shardBtn = EL('button', 'shard-btn', `火照子 ×${s.shards}`);
    shardBtn.id = 'shard';
    shardBtn.disabled = s.shards <= 0;
    shardBtn.addEventListener('click', () => {
      this.pullShard();
    });
    this.bar.appendChild(shardBtn);

    // Live wood + drift readout.
    const read = EL('div', 'bar-hint');
    read.id = 'fire-read';
    read.style.minWidth = '106px';
    read.style.textAlign = 'right';
    this.bar.appendChild(read);
    const tick = () => {
      if (!read.isConnected) return;
      const f = this.game.state.fire;
      const t = this.game.target;
      const off = f.temp - t;
      read.textContent = off > 0.05 ? '火头偏高' : off < -0.05 ? '火头偏低' : '火路正';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private buildOpen(): void {
    const s = this.game.state;
    const hint = EL('div', 'bar-hint');
    hint.style.marginLeft = 'auto';
    hint.textContent =
      s.revealed < s.pieces.length ? `还剩 ${s.pieces.length - s.revealed} 件` : '窑门开了，清点。';
    this.bar.appendChild(EL('div', 'bar-hint', '开窑。一件一件来。'));
    this.bar.appendChild(EL('div', 'bar-spacer'));
    this.bar.appendChild(hint);
    const b = EL('button', 'btn btn-primary', s.revealed < s.pieces.length ? '出下一件' : '清点');
    b.id = 'next';
    b.addEventListener('click', () => this.advance());
    this.bar.appendChild(b);
  }

  private buildSettle(): void {
    const s = this.game.state;
    const st = s.settlement;
    if (!st) return;
    const panel = EL('div', 'panel');
    panel.appendChild(EL('div', 'kicker', `第${['一', '二', '三'][s.night]}夜 · 结账`));
    panel.appendChild(EL('h2', '', `${this.game.nightDef.name}，这一窑`));
    const grid = EL('div', 'result-grid');
    for (const p of s.pieces) {
      const row = EL('div', 'result-row');
      row.appendChild(EL('span', 'rname', p.ware.def.name));
      const v = EL('span', `rverdict v-${p.verdict}`, VERDICT_LABEL[p.verdict]);
      row.appendChild(v);
      row.appendChild(EL('span', 'bar-hint', p.note));
      grid.appendChild(row);
    }
    panel.appendChild(grid);
    for (const o of st.orders) {
      const line = EL('p', '');
      line.style.fontSize = '13px';
      line.style.color = o.done ? 'var(--celadon)' : 'var(--porcelain-faint)';
      line.textContent = `${o.done ? '✓' : '×'} ${o.order.label}（${o.have}/${o.order.count}）${o.done ? ` +${o.order.reward} 文` : ''}`;
      panel.appendChild(line);
    }
    const score = EL('div', 'score-line');
    const c1 = EL('div');
    c1.append(EL('span', '', '铜钱'), document.createTextNode(`${st.coins} 文`));
    const c2 = EL('div');
    c2.append(EL('span', '', '声誉'), document.createTextNode(`${st.rep > 0 ? '+' : ''}${st.rep}`));
    score.append(c1, c2);
    panel.appendChild(score);
    this.overlay.appendChild(panel);

    const last = s.night >= NIGHTS.length - 1;
    const b = EL('button', 'btn btn-primary', last ? '看结局' : '下一夜');
    b.id = 'next';
    b.addEventListener('click', () => this.advance());
    this.bar.appendChild(EL('div', 'bar-hint', last ? '三夜烧完。' : '天快亮了，还有下一窑。'));
    this.bar.appendChild(EL('div', 'bar-spacer'));
    this.bar.appendChild(b);
  }

  private buildEnd(): void {
    const e = this.game.ending;
    const panel = EL('div', 'panel');
    panel.appendChild(EL('div', 'kicker', '三夜之后'));
    panel.appendChild(EL('h2', '', e.title));
    const p = EL('p', '');
    p.textContent = e.body;
    panel.appendChild(p);
    const stats = EL('p', '');
    stats.style.marginTop = '12px';
    stats.style.fontSize = '13px';
    stats.style.color = 'var(--porcelain-faint)';
    stats.textContent = `铜钱 ${this.game.state.coins} 文 · 声誉 ${this.game.state.rep}`;
    panel.appendChild(stats);
    const row = EL('div', 'row');
    const again = EL('button', 'btn btn-primary', '再烧一窑');
    again.addEventListener('click', () => {
      this.game.reset();
      this.game.begin();
      this.signature = '';
      this.build();
    });
    row.appendChild(again);
    panel.appendChild(row);
    this.overlay.appendChild(panel);
    this.bar.appendChild(EL('div', 'bar-hint', '把桩师傅没有温度计，他有一片瓷。'));
  }

  private buildEvent(): void {
    const s = this.game.state;
    if (!s.event) return;
    const scrim = EL('div', 'scrim');
    this.overlay.appendChild(scrim);
    const panel = EL('div', 'panel');
    panel.id = 'event';
    panel.appendChild(EL('div', 'kicker', `第${s.event.at}个时辰`));
    panel.appendChild(EL('h2', '', s.event.def.title));
    const body = EL('p', '');
    body.textContent = s.event.def.body;
    panel.appendChild(body);
    const choices = EL('div', 'choices');
    s.event.def.choices.forEach((c, i) => {
      const b = EL('button', 'choice', c.label);
      b.addEventListener('click', () => {
        this.game.chooseEvent(i as 0 | 1);
        sfx('door');
        this.signature = '';
        this.build();
      });
      choices.appendChild(b);
    });
    panel.appendChild(choices);
    this.overlay.appendChild(panel);
  }

  private buildShard(): void {
    const s = this.game.state;
    if (!s.shard) return;
    const scrim = EL('div', 'scrim');
    this.overlay.appendChild(scrim);
    const panel = EL('div', 'panel shard-panel');
    panel.id = 'shard-panel';
    const cv = EL('canvas');
    panel.appendChild(cv);
    const right = EL('div');
    const word = s.shard.verdict === 'raw' ? '未熟' : s.shard.verdict === 'burnt' ? '过火' : '正到';
    right.appendChild(EL('div', `shard-read ${s.shard.verdict}`, word));
    const p = EL('p', '');
    p.textContent = s.shard.label;
    right.appendChild(p);
    const row = EL('div', 'row');
    const close = EL('button', 'btn btn-primary', '放回去');
    close.addEventListener('click', () => {
      this.game.closeShard();
      this.signature = '';
      this.build();
    });
    row.appendChild(close);
    right.appendChild(row);
    panel.appendChild(right);
    this.overlay.appendChild(panel);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth < 760 ? 200 : 240;
    const h = window.innerWidth < 760 ? 148 : 176;
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const c = cv.getContext('2d');
    if (c) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const peak = this.game.nightDef.curve[QUARTERS - 1] || 1;
      drawShard(c, w, h, s.shard.temp / peak, this.reduced);
    }
  }

  /** e2e/debug hook. `state` is a getter so it always points at the live object. */
  get debug() {
    const game = this.game;
    return {
      get state() {
        return game.state;
      },
      game,
      skipPhase: () => this.advance(),
      pullShard: () => this.pullShard(),
    };
  }
}

export type { Phase };
