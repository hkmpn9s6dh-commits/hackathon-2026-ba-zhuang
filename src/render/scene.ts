/** Everything you see: night, kiln, fire, the fire-path chart. */

import type { Game, Phase } from '../game';
import { QUARTERS, QUARTER_SECONDS, targetAt } from '../sim/fire';
import { ROWS, SLOTS, slotFactor } from '../sim/kiln';
import type { WareDef } from '../sim/types';
import { drawWare } from './porcelain';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  w: number;
  h: number;
  cell: number;
  gap: number;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  fire: Rect;
  chimney: Rect;
  groundY: number;
  chart: Rect | null;
  compact: boolean;
  wallLeft: number;
  wallRight: number;
  wallTop: number;
}

export function computeLayout(w: number, h: number): Layout {
  const compact = w < 780;
  const gap = compact ? 7 : 11;
  const cell = Math.max(
    46,
    Math.min(compact ? 88 : 118, Math.min((w * (compact ? 0.72 : 0.30)) / 3.2, (h * 0.60) / 4.3)),
  );
  const gridW = cell * 3 + gap * 2;
  const gridH = cell * 4 + gap * 3;
  const centerX = compact ? w * 0.5 : w * 0.63;
  const centerY = compact ? h * 0.58 : h * 0.5;
  const gridX = centerX - gridW / 2;
  const gridY = centerY - gridH / 2;
  const groundY = Math.min(h - 8, gridY + gridH + cell * 0.58);
  const wallLeft = gridX - cell * 1.18;
  const wallRight = gridX + gridW + cell * 0.86;
  const wallTop = gridY - cell * 0.5;

  const chart = compact
    ? { x: 10, y: 52, w: w - 20, h: 76 }
    : {
        x: 34,
        y: Math.max(26, gridY - cell * 0.2),
        w: Math.min(430, w * 0.32),
        h: Math.min(214, h * 0.38),
      };

  return {
    w,
    h,
    cell,
    gap,
    gridX,
    gridY,
    gridW,
    gridH,
    fire: {
      x: wallLeft + cell * 0.06,
      y: groundY - cell * 1.04,
      w: cell * 0.9,
      h: cell * 1.0,
    },
    chimney: { x: wallRight - cell * 0.66, y: Math.max(6, wallTop - cell * 1.55), w: cell * 0.54, h: 0 },
    groundY,
    chart,
    compact,
    wallLeft,
    wallRight,
    wallTop,
  };
}

export function slotRect(l: Layout, i: number): Rect {
  const col = Math.floor(i / ROWS);
  const row = i % ROWS;
  return {
    x: l.gridX + col * (l.cell + l.gap),
    y: l.gridY + row * (l.cell + l.gap),
    w: l.cell,
    h: l.cell,
  };
}

/** Fire colour ramp, dark red to white heat. */
export function fireRGB(t: number): [number, number, number] {
  const stops: [number, number[]][] = [
    [0, [46, 14, 7]],
    [0.22, [126, 36, 12]],
    [0.42, [198, 74, 24]],
    [0.62, [238, 132, 52]],
    [0.82, [255, 190, 100]],
    [1, [255, 243, 214]],
  ];
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (x - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return [255, 243, 214];
}

export function fireColor(t: number, alpha = 1): string {
  const [r, g, b] = fireRGB(t);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  smoke: boolean;
}

export class Scene {
  private sparks: Particle[] = [];
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private reduced = false;
  private acc = 0;

  constructor(reduced = false) {
    this.reduced = reduced;
    for (let i = 0; i < 110; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.5,
        r: 0.4 + Math.random() * 1.2,
        p: Math.random() * Math.PI * 2,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, game: Game, l: Layout, now: number, dt: number): void {
    const s = game.state;
    const phase: Phase = s.phase;
    const idle = phase === 'title' || phase === 'brief';
    const heat = phase === 'fire' ? s.fire.temp : phase === 'load' ? 0.17 : idle ? 0.22 : Math.max(0.2, s.peak * 0.95);

    ctx.clearRect(0, 0, l.w, l.h);
    this.sky(ctx, l, now, heat, phase);
    this.hills(ctx, l, heat);
    this.ground(ctx, l, heat);
    this.woodpile(ctx, l, game);
    this.kiln(ctx, l, game, heat, phase, now);
    this.master(ctx, l, game, now);
    this.fire(ctx, l, heat, now);
    this.updateParticles(l, heat, phase, dt);
    this.drawParticles(ctx);
    if (l.chart && phase !== 'title') this.chart(ctx, l, game, now);
    this.vignette(ctx, l);
  }

  // ── background ──────────────────────────────────────────

  private sky(ctx: CanvasRenderingContext2D, l: Layout, now: number, heat: number, phase: Phase): void {
    const g = ctx.createLinearGradient(0, 0, 0, l.h);
    g.addColorStop(0, '#04070d');
    g.addColorStop(0.5, '#0a1220');
    g.addColorStop(1, '#141d29');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, l.w, l.h);

    const warm = ctx.createRadialGradient(
      l.fire.x + l.fire.w * 0.5,
      l.fire.y + l.fire.h * 0.4,
      8,
      l.fire.x,
      l.fire.y,
      Math.max(l.w * 0.55, 360),
    );
    warm.addColorStop(0, fireColor(heat, 0.3));
    warm.addColorStop(0.3, fireColor(heat * 0.8, 0.09));
    warm.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, l.w, l.h);

    const starA = phase === 'fire' ? 0.16 : 0.5;
    for (const st of this.stars) {
      const tw = 0.55 + 0.45 * Math.sin(now * 0.0011 + st.p);
      ctx.fillStyle = `rgba(210,224,248,${(0.3 * tw * starA).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(st.x * l.w, st.y * l.h, st.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const mx = l.w * 0.09;
    const my = l.h * 0.12;
    const mr = Math.max(10, Math.min(24, l.w * 0.012));
    const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 6);
    halo.addColorStop(0, 'rgba(236,240,248,0.13)');
    halo.addColorStop(1, 'rgba(236,240,248,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6eaf2';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(196,204,220,0.45)';
    ctx.beginPath();
    ctx.arc(mx - mr * 0.32, my - mr * 0.18, mr * 0.2, 0, Math.PI * 2);
    ctx.arc(mx + mr * 0.26, my + mr * 0.3, mr * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }

  private hills(ctx: CanvasRenderingContext2D, l: Layout, heat: number): void {
    const base = l.groundY - l.cell * 0.08;
    const layers = [
      { k: 0.5, a: 0.5, off: 0.02 },
      { k: 0.33, a: 0.82, off: 0.008 },
    ];
    layers.forEach((layer, i) => {
      ctx.beginPath();
      ctx.moveTo(-10, l.h);
      const segs = 7;
      for (let j = 0; j <= segs; j++) {
        const x = -10 + (l.w + 20) * (j / segs);
        const y =
          base -
          Math.abs(Math.sin(j * 1.35 + i * 2.1 + 0.6)) * l.h * 0.12 * layer.k -
          l.h * layer.off;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(l.w + 10, l.h);
      ctx.closePath();
      ctx.fillStyle = `rgba(7,11,18,${layer.a})`;
      ctx.fill();
    });
    const hz = ctx.createLinearGradient(0, base - l.h * 0.09, 0, base + 4);
    hz.addColorStop(0, 'rgba(0,0,0,0)');
    hz.addColorStop(1, fireColor(heat * 0.5, 0.06));
    ctx.fillStyle = hz;
    ctx.fillRect(0, base - l.h * 0.09, l.w, l.h * 0.09 + 4);
  }

  private ground(ctx: CanvasRenderingContext2D, l: Layout, heat: number): void {
    const y = l.groundY;
    const g = ctx.createLinearGradient(0, y, 0, l.h);
    g.addColorStop(0, '#1a1410');
    g.addColorStop(1, '#0a0806');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, l.w, l.h - y);

    const spill = ctx.createRadialGradient(
      l.fire.x + l.fire.w * 0.5,
      y + 4,
      4,
      l.fire.x + l.fire.w * 0.5,
      y + 4,
      l.cell * 3.2,
    );
    spill.addColorStop(0, fireColor(heat, 0.14));
    spill.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spill;
    ctx.fillRect(0, y, l.w, l.h - y);

    ctx.strokeStyle = 'rgba(140,110,80,0.12)';
    ctx.lineWidth = 1;
    const step = Math.max(46, l.cell * 0.5);
    for (let x = -step; x < l.w + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - step * 0.5, l.h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(190,158,116,0.2)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(l.w, y);
    ctx.stroke();
  }

  private woodpile(ctx: CanvasRenderingContext2D, l: Layout, game: Game): void {
    const s = game.state;
    if (s.phase === 'title' || s.phase === 'brief') return;
    const left = Math.max(10, l.wallLeft - l.cell * 1.9);
    const baseY = l.groundY;
    const len = l.cell * 0.82;
    const rad = l.cell * 0.1;
    const frac = Math.max(0, Math.min(1, s.fire.wood / 170));

    const log = (x: number, y: number, a: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, -rad, 0, rad);
      g.addColorStop(0, '#4a3624');
      g.addColorStop(0.45, '#3a2a1b');
      g.addColorStop(1, '#1d140d');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-len / 2, -rad, len, rad * 2, rad);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,118,80,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(len / 2 - 1, 0, rad * 0.42, rad * 0.82, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    let n = 0;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 3; i++) {
        if (n / 9 > frac) {
          n++;
          continue;
        }
        log(left + i * len * 0.32 + row * len * 0.12, baseY - rad * (1.2 + row * 1.7), (i % 2 ? 0.05 : -0.04));
        n++;
      }
    }
  }

  // ── the kiln ────────────────────────────────────────────

  private kiln(
    ctx: CanvasRenderingContext2D,
    l: Layout,
    game: Game,
    heat: number,
    phase: Phase,
    now: number,
  ): void {
    const left = l.wallLeft;
    const right = l.wallRight;
    const base = l.groundY;
    const top = l.wallTop;
    const cx = (left + right) / 2;
    const halfW = (right - left) / 2;

    // Egg-shaped outer wall: widest a third of the way up, waist at the crown.
    const profile = (t: number): number =>
      halfW * Math.pow(Math.max(0, Math.sin(Math.PI * (0.16 + 0.68 * t))), 0.62);

    const N = 30;
    const leftPts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      leftPts.push([cx - profile(t), base - (base - top) * t]);
    }

    ctx.beginPath();
    ctx.moveTo(leftPts[0][0], leftPts[0][1]);
    for (const p of leftPts) ctx.lineTo(p[0], p[1]);
    for (let i = N; i >= 0; i--) {
      const t = i / N;
      ctx.lineTo(cx + profile(t), base - (base - top) * t);
    }
    ctx.closePath();
    const body = ctx.createLinearGradient(left, top, right, base);
    body.addColorStop(0, '#2c1e15');
    body.addColorStop(0.45, '#241811');
    body.addColorStop(1, '#150e09');
    ctx.fillStyle = body;
    ctx.fill();

    ctx.save();
    ctx.clip();
    const rowH = Math.max(7, l.cell * 0.095);
    ctx.strokeStyle = 'rgba(255,175,110,0.05)';
    ctx.lineWidth = 1;
    for (let y = top; y < base; y += rowH) {
      ctx.beginPath();
      ctx.moveTo(left - 30, y);
      ctx.lineTo(right + 30, y);
      ctx.stroke();
      const off = (Math.round(y / rowH) % 2) * rowH;
      for (let x = left - 30 + off; x < right + 30; x += rowH * 2.2) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + rowH);
        ctx.stroke();
      }
    }
    const lit = ctx.createRadialGradient(
      l.fire.x + l.fire.w * 0.5,
      l.fire.y,
      l.cell * 0.2,
      l.fire.x + l.fire.w * 0.5,
      l.fire.y,
      l.cell * 4.4,
    );
    lit.addColorStop(0, fireColor(heat, 0.46));
    lit.addColorStop(0.35, fireColor(heat * 0.85, 0.14));
    lit.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lit;
    ctx.fillRect(left - 30, top, right - left + 60, base - top);

    const soot = ctx.createLinearGradient(0, top, 0, top + (base - top) * 0.4);
    soot.addColorStop(0, 'rgba(0,0,0,0.5)');
    soot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = soot;
    ctx.fillRect(left - 30, top, right - left + 60, base - top);
    ctx.restore();

    // Rim light on the front arch.
    ctx.beginPath();
    leftPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.strokeStyle = fireColor(heat, 0.4);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Chimney at the rear.
    const ch = l.chimney;
    const chBottom = top + l.cell * 0.5;
    ctx.fillStyle = '#1c130e';
    ctx.fillRect(ch.x, ch.y, ch.w, chBottom - ch.y);
    ctx.strokeStyle = 'rgba(255,175,110,0.07)';
    for (let y = ch.y; y < chBottom; y += rowH) {
      ctx.beginPath();
      ctx.moveTo(ch.x, y);
      ctx.lineTo(ch.x + ch.w, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#251a12';
    const capW = ch.w * 1.3;
    ctx.fillRect(ch.x - (capW - ch.w) / 2, ch.y - 7, capW, 8);

    const shut = phase === 'title' || phase === 'brief';
    if (shut) this.facade(ctx, l, heat);
    else this.chamber(ctx, l, game, heat, phase, now);

    // Firebox, cut into the front wall.
    const f = l.fire;
    const arch = f.h * 0.46;
    const fpath = (): void => {
      ctx.beginPath();
      ctx.moveTo(f.x, f.y + f.h);
      ctx.lineTo(f.x, f.y + arch);
      ctx.quadraticCurveTo(f.x, f.y, f.x + f.w / 2, f.y);
      ctx.quadraticCurveTo(f.x + f.w, f.y, f.x + f.w, f.y + arch);
      ctx.lineTo(f.x + f.w, f.y + f.h);
      ctx.closePath();
    };
    const hole = ctx.createRadialGradient(
      f.x + f.w / 2,
      f.y + f.h * 0.74,
      2,
      f.x + f.w / 2,
      f.y + f.h * 0.74,
      f.w * 1.2,
    );
    hole.addColorStop(0, fireColor(Math.min(1, heat + 0.3), 1));
    hole.addColorStop(0.5, fireColor(heat, 0.8));
    hole.addColorStop(1, 'rgba(16,7,4,0.96)');
    ctx.save();
    fpath();
    ctx.fillStyle = hole;
    ctx.fill();
    ctx.restore();

    const sealed = phase !== 'load' && phase !== 'title' && phase !== 'brief';
    if (sealed) {
      ctx.save();
      fpath();
      ctx.clip();
      ctx.fillStyle = 'rgba(26,21,18,0.9)';
      ctx.fillRect(f.x - 2, f.y - 2, f.w + 4, f.h + 4);
      const flick = 0.5 + 0.5 * Math.sin(now * 0.005);
      ctx.strokeStyle = fireColor(heat, 0.3 + flick * 0.35);
      ctx.lineWidth = 1.3;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(f.x + (f.w * i) / 4, f.y);
        ctx.lineTo(f.x + (f.w * i) / 4, f.y + f.h);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(f.x, f.y + f.h * 0.64);
      ctx.lineTo(f.x + f.w, f.y + f.h * 0.64);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    fpath();
    ctx.strokeStyle = '#0b0705';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = fireColor(heat, 0.28);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // The stoke hole beside the door, where the shard comes out.
    const sx = f.x + f.w + l.cell * 0.2;
    const sy = f.y + f.h * 0.5;
    ctx.fillStyle = '#0a0604';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(3, l.cell * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = fireColor(heat, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** The kiln before it is opened: a brick face with a few peep holes. */
  private facade(ctx: CanvasRenderingContext2D, l: Layout, heat: number): void {
    const pad = l.cell * 0.15;
    const x = l.gridX - pad;
    const y = l.gridY - pad * 1.4;
    const w = l.gridW + pad * 2;
    const h = l.gridH + pad * 2.1;
    const arch = w * 0.18;

    const face = (): void => {
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + arch);
      ctx.quadraticCurveTo(x, y, x + w / 2, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + arch);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
    };

    ctx.save();
    face();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#1b120c');
    g.addColorStop(0.6, '#241811');
    g.addColorStop(1, fireColor(heat * 0.6, 0.16));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    const rowH = Math.max(7, l.cell * 0.095);
    ctx.strokeStyle = 'rgba(255,175,110,0.05)';
    ctx.lineWidth = 1;
    for (let yy = y; yy < y + h; yy += rowH) {
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
      const off = (Math.round(yy / rowH) % 2) * rowH;
      for (let xx = x + off; xx < x + w; xx += rowH * 2.2) {
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx, yy + rowH);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.save();
    face();
    ctx.strokeStyle = 'rgba(124,88,58,0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // Peep holes: three rows of two, each with a little fire behind it.
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        const hx = x + w * (0.36 + c * 0.28);
        const hy = y + h * (0.28 + r * 0.2);
        ctx.fillStyle = '#0a0604';
        ctx.beginPath();
        ctx.arc(hx, hy, Math.max(2.5, l.cell * 0.035), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = fireColor(heat * 0.9, 0.55);
        ctx.beginPath();
        ctx.arc(hx, hy, Math.max(1.2, l.cell * 0.016), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(160,120,80,0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hx, hy, Math.max(4.5, l.cell * 0.052), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private chamber(
    ctx: CanvasRenderingContext2D,
    l: Layout,
    game: Game,
    heat: number,
    phase: Phase,
    now: number,
  ): void {
    const s = game.state;
    const pad = l.cell * 0.15;
    const cav = {
      x: l.gridX - pad,
      y: l.gridY - pad * 1.4,
      w: l.gridW + pad * 2,
      h: l.gridH + pad * 2.1,
    };
    const arch = cav.w * 0.18;

    const cavity = (): void => {
      ctx.beginPath();
      ctx.moveTo(cav.x, cav.y + cav.h);
      ctx.lineTo(cav.x, cav.y + arch);
      ctx.quadraticCurveTo(cav.x, cav.y, cav.x + cav.w / 2, cav.y);
      ctx.quadraticCurveTo(cav.x + cav.w, cav.y, cav.x + cav.w, cav.y + arch);
      ctx.lineTo(cav.x + cav.w, cav.y + cav.h);
      ctx.closePath();
    };

    ctx.save();
    cavity();
    const inner = ctx.createLinearGradient(0, cav.y, 0, cav.y + cav.h);
    inner.addColorStop(0, '#070504');
    inner.addColorStop(0.55, '#0d0806');
    inner.addColorStop(1, fireColor(heat * 0.7, 0.4));
    ctx.fillStyle = inner;
    ctx.fill();
    ctx.clip();

    if (heat > 0.08) {
      for (let c = 0; c < 4; c++) {
        const gx = cav.x + (cav.w / 4) * (c + 0.5);
        const g = ctx.createLinearGradient(0, cav.y + cav.h, 0, cav.y + cav.h * 0.2);
        g.addColorStop(0, fireColor(Math.min(1, heat + 0.2), 0.36));
        g.addColorStop(0.5, fireColor(heat, 0.12));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        const wob = Math.sin(now * 0.004 + c * 1.7) * cav.w * 0.02;
        ctx.fillRect(gx - cav.w * 0.055 + wob, cav.y + cav.h * 0.08, cav.w * 0.11, cav.h * 0.92);
      }
    }
    ctx.restore();

    for (let i = 0; i < SLOTS; i++) {
      const r = slotRect(l, i);
      const factor = slotFactor(i);
      const glow = Math.min(1, heat * factor * 1.08);
      const open = phase === 'open' || phase === 'settle';
      const fade = open ? 0.4 : 1;
      const a = r.h * 0.3;

      const niche = (): void => {
        ctx.beginPath();
        ctx.moveTo(r.x, r.y + r.h);
        ctx.lineTo(r.x, r.y + a);
        ctx.quadraticCurveTo(r.x, r.y, r.x + r.w / 2, r.y);
        ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + a);
        ctx.lineTo(r.x + r.w, r.y + r.h);
        ctx.closePath();
      };

      ctx.save();
      niche();
      const ng = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      ng.addColorStop(0, 'rgba(10,7,5,0.96)');
      ng.addColorStop(0.6, `rgba(24,13,8,${0.92 * fade})`);
      ng.addColorStop(1, fireColor(glow, 0.2 * fade + 0.03));
      ctx.fillStyle = ng;
      ctx.fill();
      ctx.restore();

      ctx.save();
      niche();
      ctx.strokeStyle = `rgba(124,88,58,${0.45 * fade})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = `rgba(62,40,27,${0.92 * fade})`;
      ctx.fillRect(r.x + 1, r.y + r.h - r.h * 0.09, r.w - 2, r.h * 0.075);
      ctx.fillStyle = fireColor(glow, 0.18 * fade);
      ctx.fillRect(r.x + 1, r.y + r.h - r.h * 0.09, r.w - 2, 1.4);

      const uid = s.slots[i];
      if (uid !== null) {
        const ware = s.wares.find((w) => w.uid === uid);
        if (ware) {
          const idx = s.pieces.findIndex((p) => p.slot === i);
          const shown = s.phase === 'open' && idx >= 0 && idx < s.revealed;
          const piece = idx >= 0 ? s.pieces[idx] : null;
          drawWare(ctx, ware.def, r.x + r.w / 2, r.y + r.h * 0.9, r.w * 0.5, {
            heat: glow * 0.5,
            over: shown && piece?.verdict === 'over',
            cracked: shown && piece?.verdict === 'cracked',
            flambe: shown && piece?.verdict === 'flambe',
            droop: shown && piece?.verdict === 'over' ? 1 : 0,
            dim: 0.34 + glow * 0.2,
          });
        }
      } else {
        ctx.strokeStyle = `rgba(150,112,78,${0.2 * fade})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(r.x + r.w / 2, r.y + r.h * 0.85, r.w * 0.19, r.w * 0.05, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /** The 把桩 himself, a silhouette by the door, hook in hand. */
  private master(ctx: CanvasRenderingContext2D, l: Layout, game: Game, now: number): void {
    const phase = game.state.phase;
    if (phase === 'title') return;
    const f = l.fire;
    const h = l.cell * 1.55;
    const x = f.x - l.cell * 0.5;
    const ground = l.groundY;
    const sway = Math.sin(now * 0.0009) * l.cell * 0.006;

    ctx.save();
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x, ground, l.cell * 0.2, l.cell * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(x - l.cell * 0.2, 0, x + l.cell * 0.2, 0);
    body.addColorStop(0, '#05080c');
    body.addColorStop(0.7, '#080c12');
    body.addColorStop(1, '#1a1410');
    ctx.fillStyle = body;

    // Legs.
    ctx.beginPath();
    ctx.moveTo(x - l.cell * 0.075, ground);
    ctx.lineTo(x - l.cell * 0.03, ground - h * 0.42);
    ctx.lineTo(x + l.cell * 0.035, ground - h * 0.42);
    ctx.lineTo(x + l.cell * 0.09, ground);
    ctx.closePath();
    ctx.fill();

    // Torso + coat.
    ctx.beginPath();
    ctx.moveTo(x - l.cell * 0.14 + sway, ground - h * 0.34);
    ctx.quadraticCurveTo(x - l.cell * 0.17, ground - h * 0.7, x - l.cell * 0.1 + sway, ground - h * 0.82);
    ctx.lineTo(x + l.cell * 0.1 + sway, ground - h * 0.82);
    ctx.quadraticCurveTo(x + l.cell * 0.17, ground - h * 0.7, x + l.cell * 0.14 + sway, ground - h * 0.34);
    ctx.closePath();
    ctx.fill();

    // Head.
    ctx.beginPath();
    ctx.arc(x + sway, ground - h * 0.9, l.cell * 0.082, 0, Math.PI * 2);
    ctx.fill();

    // 斗笠: a low cone, the one shape everybody reads as "kiln worker".
    ctx.beginPath();
    ctx.moveTo(x - l.cell * 0.19 + sway, ground - h * 0.93);
    ctx.quadraticCurveTo(x + sway, ground - h * 1.02, x + l.cell * 0.19 + sway, ground - h * 0.93);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(226,120,60,0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - l.cell * 0.19 + sway, ground - h * 0.93);
    ctx.quadraticCurveTo(x + sway, ground - h * 1.02, x + l.cell * 0.19 + sway, ground - h * 0.93);
    ctx.stroke();

    // Near arm, reaching toward the door.
    ctx.strokeStyle = '#06090d';
    ctx.lineWidth = l.cell * 0.055;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + l.cell * 0.1 + sway, ground - h * 0.74);
    ctx.quadraticCurveTo(x + l.cell * 0.2, ground - h * 0.62, x + l.cell * 0.16, ground - h * 0.5);
    ctx.stroke();

    // Shoulder rim light from the fire.
    ctx.strokeStyle = 'rgba(226,120,60,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + l.cell * 0.1 + sway, ground - h * 0.8);
    ctx.quadraticCurveTo(x + l.cell * 0.17, ground - h * 0.7, x + l.cell * 0.14, ground - h * 0.34);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + sway, ground - h * 0.9, l.cell * 0.082, -0.9, 0.7);
    ctx.stroke();

    // The hook, resting toward the stoke hole.
    const hx = f.x + f.w + l.cell * 0.2;
    const hy = f.y + f.h * 0.5;
    ctx.strokeStyle = 'rgba(14,10,8,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + l.cell * 0.12, ground - h * 0.62);
    ctx.lineTo(hx - l.cell * 0.04, hy + l.cell * 0.12);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,150,100,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private fire(ctx: CanvasRenderingContext2D, l: Layout, heat: number, now: number): void {
    if (heat < 0.02) return;
    const f = l.fire;
    const cx = f.x + f.w * 0.5;
    const cy = f.y + f.h * 0.8;
    const r = f.w * 0.52;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.88 + 0.12 * Math.sin(now * 0.009) + 0.05 * Math.sin(now * 0.027);

    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, r * 3.1 * flick);
    glow.addColorStop(0, fireColor(Math.min(1, heat + 0.25), 0.46));
    glow.addColorStop(0.28, fireColor(heat, 0.18));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 3.1 * flick, 0, Math.PI * 2);
    ctx.fill();

    const tongues = this.reduced ? 3 : 6;
    for (let i = 0; i < tongues; i++) {
      const p = i / tongues;
      const sway = Math.sin(now * 0.006 + p * 6.5) * r * 0.2;
      const hh = r * (1.1 + 0.55 * Math.sin(now * 0.008 + p * 4.1)) * (0.55 + heat * 0.8);
      const ww = r * (0.52 - p * 0.05);
      const x = cx + (p - 0.5) * r * 1.05 + sway;
      const g = ctx.createLinearGradient(x, cy + r * 0.2, x, cy - hh);
      g.addColorStop(0, fireColor(Math.min(1, heat + 0.4), 0.9));
      g.addColorStop(0.5, fireColor(heat, 0.48));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - ww * 0.5, cy + r * 0.28);
      ctx.quadraticCurveTo(x - ww * 0.62, cy - hh * 0.5, x, cy - hh);
      ctx.quadraticCurveTo(x + ww * 0.62, cy - hh * 0.5, x + ww * 0.5, cy + r * 0.28);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ── particles ───────────────────────────────────────────

  private updateParticles(l: Layout, heat: number, phase: Phase, dt: number): void {
    const live = phase === 'fire' || phase === 'load' || phase === 'brief' || phase === 'title';
    if (live && heat > 0.06) {
      const rate = this.reduced ? 5 : 20;
      this.acc += dt * rate * heat;
      while (this.acc >= 1) {
        this.acc -= 1;
        const f = l.fire;
        this.sparks.push({
          x: f.x + f.w * (0.3 + Math.random() * 0.4),
          y: f.y + f.h * 0.72,
          vx: (Math.random() - 0.3) * 22,
          vy: -26 - Math.random() * 70 * (0.4 + heat),
          life: 0,
          max: 0.7 + Math.random() * 1.3,
          size: 0.8 + Math.random() * 1.6,
          smoke: false,
        });
      }
      if (Math.random() < dt * (this.reduced ? 3 : 8) * Math.min(1, heat + 0.2)) {
        const ch = l.chimney;
        this.sparks.push({
          x: ch.x + ch.w * 0.5,
          y: ch.y,
          vx: 6 + Math.random() * 14,
          vy: -7 - Math.random() * 9,
          life: 0,
          max: 3 + Math.random() * 2,
          size: 5 + Math.random() * 8,
          smoke: true,
        });
      }
    }
    for (const p of this.sparks) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.smoke) {
        p.vx += dt * 1.6;
        p.size += dt * 8;
      } else {
        p.vy += dt * 10;
      }
    }
    this.sparks = this.sparks.filter((p) => p.life < p.max);
    if (this.sparks.length > 300) this.sparks.splice(0, this.sparks.length - 300);
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.sparks) {
      const k = 1 - p.life / p.max;
      if (p.smoke) {
        ctx.fillStyle = `rgba(92,100,112,${0.05 * k})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = fireColor(0.78 + 0.22 * k, 0.7 * k);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ── the fire-path chart ─────────────────────────────────

  private chart(ctx: CanvasRenderingContext2D, l: Layout, game: Game, now: number): void {
    const c = l.chart;
    if (!c) return;
    const s = game.state;
    const compact = l.compact;
    const padL = compact ? 22 : 30;
    const padB = compact ? 12 : 20;
    const padT = compact ? 8 : 14;
    const x0 = c.x + padL;
    const x1 = c.x + c.w - 8;
    const y0 = c.y + padT;
    const y1 = c.y + c.h - padB;
    const yOf = (v: number) => y1 - (Math.max(0, Math.min(1, v)) / 1.02) * (y1 - y0);
    const total = QUARTER_SECONDS * QUARTERS;

    ctx.save();
    ctx.fillStyle = 'rgba(6,10,16,0.4)';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(243,239,228,0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);

    ctx.strokeStyle = 'rgba(243,239,228,0.06)';
    for (let i = 0; i <= QUARTERS; i++) {
      const x = x0 + ((x1 - x0) * i) / QUARTERS;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    for (const v of [0.25, 0.5, 0.75, 1]) {
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(236,230,214,0.38)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * total;
      const x = x0 + ((x1 - x0) * i) / 72;
      const y = yOf(targetAt(game.nightDef.curve, t));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const pts: [number, number][] = [];
    for (let i = 0; i < s.samples.length; i++) {
      const t = (i + 1) * QUARTER_SECONDS;
      pts.push([x0 + ((x1 - x0) * t) / total, yOf(s.samples[i])]);
    }
    if (s.phase === 'fire' || s.phase === 'open' || s.phase === 'settle') {
      const t = Math.min(s.fire.t, total);
      pts.push([x0 + ((x1 - x0) * t) / total, yOf(s.phase === 'fire' ? s.fire.temp : s.peak)]);
    }

    if (pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], yOf(targetAt(game.nightDef.curve, QUARTER_SECONDS)));
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      for (let i = pts.length - 1; i >= 0; i--) {
        const t = ((pts[i][0] - x0) / (x1 - x0)) * total;
        ctx.lineTo(pts[i][0], yOf(targetAt(game.nightDef.curve, t)));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(184,69,47,0.15)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.strokeStyle = fireColor(Math.max(0.45, s.phase === 'fire' ? s.fire.temp : s.peak), 0.95);
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.stroke();

      const last = pts[pts.length - 1];
      const pulse = 2.4 + Math.sin(now * 0.008) * 0.7;
      ctx.fillStyle = fireColor(1, 0.9);
      ctx.beginPath();
      ctx.arc(last[0], last[1], pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(243,239,228,0.3)';
    ctx.font = `${compact ? 10 : 11}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('熟', c.x + 7, yOf(0.94) + 4);
    ctx.fillText('生', c.x + 7, yOf(0.08) + 4);
    ctx.restore();
  }

  private vignette(ctx: CanvasRenderingContext2D, l: Layout): void {
    const v = ctx.createRadialGradient(
      l.w / 2,
      l.h * 0.45,
      Math.min(l.w, l.h) * 0.34,
      l.w / 2,
      l.h * 0.45,
      Math.max(l.w, l.h) * 0.78,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, l.w, l.h);
  }
}

export function paintWareThumb(
  canvas: HTMLCanvasElement,
  def: WareDef,
  dpr: number,
  paint: { over?: boolean; cracked?: boolean; flambe?: boolean } = {},
): void {
  const c = canvas.getContext('2d');
  if (!c) return;
  const w = canvas.clientWidth || 76;
  const h = canvas.clientHeight || 86;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  drawWare(c, def, w / 2, h * 0.92, h * 0.66, paint);
}

export function ambientHeat(game: Game): number {
  return game.state.phase === 'fire' ? game.state.fire.temp : 0.15;
}

export { slotFactor };
