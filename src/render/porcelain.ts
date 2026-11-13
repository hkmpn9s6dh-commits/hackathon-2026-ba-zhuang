/**
 * Porcelain, drawn procedurally.
 *
 * The look we want is a small painted object under one warm light: a cylinder
 * shaded across its width, a real mouth you can see into, a foot ring with its
 * own shadow, and one painted band that survives at 50 px.
 */

import type { WareDef } from '../sim/types';

export type WareShape = 'bowl' | 'vase' | 'jar';

export function shapeOf(id: string): WareShape {
  if (id.includes('vase')) return 'vase';
  if (id.includes('jar')) return 'jar';
  return 'bowl';
}

/** Height that keeps a piece inside a box of maxW × maxH. */
export function fitWare(id: string, maxW: number, maxH: number): number {
  const shape = shapeOf(id);
  const ratio = shape === 'vase' ? 0.62 : shape === 'jar' ? 0.86 : 1.38;
  return Math.min(maxH, maxW / ratio);
}

export interface WarePaint {
  /** 0..1, how hot this piece thinks it got; warms the clay. */
  heat?: number;
  over?: boolean;
  cracked?: boolean;
  flambe?: boolean;
  droop?: number;
  /** 0..1, how much light reaches it. Low inside the kiln. */
  dim?: number;
  /** Per-piece seed: hand-thrown things are never identical. */
  seed?: number;
}

interface Glaze {
  deep: string;
  dark: string;
  mid: string;
  light: string;
  spec: string;
  paint: string | null;
}

const GLAZE: Record<string, Glaze> = {
  yingqing: {
    deep: '#546b65',
    dark: '#9db4ac',
    mid: '#d7e7e0',
    light: '#fbfefc',
    spec: 'rgba(255,255,255,0.9)',
    paint: null,
  },
  qinghua: {
    deep: '#6f6a5c',
    dark: '#b3ab97',
    mid: '#e6dfcd',
    light: '#fffdf6',
    spec: 'rgba(255,255,255,0.9)',
    paint: '#2b4f9e',
  },
  jihong: {
    deep: '#3a0c06',
    dark: '#7d1d10',
    mid: '#b23a22',
    light: '#dd7355',
    spec: 'rgba(255,220,200,0.75)',
    paint: null,
  },
};

const N = 18;

function halfProfile(shape: WareShape, w: number, t: number): number {
  if (shape === 'bowl') {
    // Wide mouth, a belly that curves in late, a small foot.
    const r = 1 - 0.5 * Math.pow(t, 2.6);
    const flare = t < 0.08 ? 0.03 * (1 - t / 0.08) : 0;
    return (w / 2) * (r + flare);
  }
  if (shape === 'jar') return (w / 2) * Math.pow(Math.max(0, Math.sin(Math.PI * (0.18 + 0.68 * t))), 0.46);
  // t = 0 is the mouth, t = 1 is the foot.
  const belly = w / 2;
  if (t < 0.08) return belly * (0.3 + (0.0 * t) / 0.08);
  if (t < 0.2) return belly * (0.3 - (0.14 * (t - 0.08)) / 0.12);
  if (t < 0.44) return belly * (0.16 + (0.84 * Math.sin(((t - 0.2) / 0.24) * Math.PI * 0.5)));
  if (t < 0.8) return belly * (1 - (0.62 * (t - 0.44)) / 0.36);
  return belly * (0.38 - (0.06 * (t - 0.8)) / 0.2);
}

function bodyPath(ctx: CanvasRenderingContext2D, shape: WareShape, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(-halfProfile(shape, w, 0), 0);
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    ctx.lineTo(-halfProfile(shape, w, t), h * t);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    ctx.lineTo(halfProfile(shape, w, t), h * t);
  }
  ctx.closePath();
}

/** A cylinder lit from the left: this single gradient is most of the “not cheap”. */
function cylinder(ctx: CanvasRenderingContext2D, g: Glaze, w: number): CanvasGradient {
  const grad = ctx.createLinearGradient(-w * 0.5, 0, w * 0.5, 0);
  grad.addColorStop(0, g.dark);
  grad.addColorStop(0.1, g.mid);
  grad.addColorStop(0.28, g.light);
  grad.addColorStop(0.46, g.mid);
  grad.addColorStop(0.74, g.dark);
  grad.addColorStop(0.92, g.deep);
  grad.addColorStop(1, g.dark);
  return grad;
}

/** One painted band that still reads when the whole piece is 50 px tall. */
function paintBand(
  ctx: CanvasRenderingContext2D,
  def: WareDef,
  g: Glaze,
  shape: WareShape,
  w: number,
  h: number,
  dim: number,
): void {
  const ink = g.paint;
  if (!ink) {
    ctx.strokeStyle = `rgba(96,126,118,${0.34 * dim})`;
    ctx.lineWidth = Math.max(0.7, h * 0.014);
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const spread = -0.42 + i * 0.105;
      ctx.beginPath();
      ctx.moveTo(w * spread * 0.5, h * 0.88);
      ctx.quadraticCurveTo(w * spread * 0.85, h * 0.74, w * spread * 1.02, h * 0.58);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-w * 0.44, h * 0.9);
    ctx.quadraticCurveTo(0, h * 0.86, w * 0.44, h * 0.9);
    ctx.stroke();
    return;
  }

  if (def.kind === 'qinghua') {
    const top = shape === 'bowl' ? 0.16 : 0.2;
    const bottom = shape === 'bowl' ? 0.72 : 0.76;
    ctx.fillStyle = `rgba(43,79,158,${0.8 * dim})`;
    ctx.fillRect(-w, h * top, w * 2, Math.max(1, h * 0.035));
    ctx.fillRect(-w, h * (top + 0.06), w * 2, Math.max(0.8, h * 0.018));
    ctx.fillRect(-w, h * bottom, w * 2, Math.max(1, h * 0.03));

    const y0 = h * ((top + bottom) / 2 + 0.02);
    ctx.strokeStyle = `rgba(43,79,158,${0.92 * dim})`;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, h * 0.03);
    ctx.beginPath();
    ctx.moveTo(-w * 0.62, y0 + h * 0.02);
    ctx.bezierCurveTo(-w * 0.3, y0 - h * 0.1, -w * 0.05, y0 + h * 0.1, w * 0.18, y0 - h * 0.02);
    ctx.bezierCurveTo(w * 0.38, y0 - h * 0.1, w * 0.5, y0 + h * 0.04, w * 0.62, y0 - h * 0.02);
    ctx.stroke();

    ctx.fillStyle = `rgba(43,79,158,${0.85 * dim})`;
    for (let i = 0; i < 5; i++) {
      const lx = -w * 0.46 + i * w * 0.24;
      const ly = y0 - h * 0.03 + (i % 2 ? h * 0.05 : -h * 0.04);
      ctx.beginPath();
      ctx.ellipse(lx, ly, w * 0.05, h * 0.028, i % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  ctx.strokeStyle = `rgba(255,210,190,${0.22 * dim})`;
  ctx.lineWidth = Math.max(0.8, h * 0.014);
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, h * 0.16);
  ctx.quadraticCurveTo(0, h * 0.1, w * 0.42, h * 0.16);
  ctx.stroke();
}

/** Draw a piece; `cy` is the foot. */
export function drawWare(
  ctx: CanvasRenderingContext2D,
  def: WareDef,
  cx: number,
  cy: number,
  height: number,
  paint: WarePaint = {},
): void {
  const shape = shapeOf(def.id);
  const ratio = shape === 'vase' ? 0.62 : shape === 'jar' ? 0.86 : 1.38;
  const w = height * ratio;
  const h = height;
  const g = GLAZE[def.kind] ?? GLAZE.yingqing;
  const dim = paint.dim ?? 1;

  ctx.save();
  ctx.translate(cx, cy - h);
  const tilt = paint.seed === undefined ? 0 : (((paint.seed * 37) % 100) / 100 - 0.5) * 0.05;
  if (tilt) {
    ctx.translate(0, h);
    ctx.rotate(tilt);
    ctx.translate(0, -h);
  }
  if (paint.droop) ctx.transform(1, 0, 0, 1 + paint.droop * 0.09, 0, 0);

  ctx.fillStyle = `rgba(0,0,0,${0.42 * dim})`;
  ctx.beginPath();
  ctx.ellipse(0, h + Math.max(0.5, h * 0.012), w * 0.34, Math.max(1.2, h * 0.026), 0, 0, Math.PI * 2);
  ctx.fill();

  bodyPath(ctx, shape, w, h);
  ctx.fillStyle = cylinder(ctx, g, w);
  ctx.fill();

  ctx.save();
  ctx.clip();

  const foot = ctx.createLinearGradient(0, h * 0.72, 0, h);
  foot.addColorStop(0, 'rgba(0,0,0,0)');
  foot.addColorStop(1, `rgba(0,0,0,${0.34 * dim})`);
  ctx.fillStyle = foot;
  ctx.fillRect(-w, h * 0.72, w * 2, h * 0.3);

  // Core shadow on the away-from-fire side, then a rim light on the near side.
  const core = ctx.createLinearGradient(w * 0.06, 0, w * 0.52, 0);
  core.addColorStop(0, 'rgba(0,0,0,0)');
  core.addColorStop(1, `rgba(24,34,32,${0.34 * dim})`);
  ctx.fillStyle = core;
  ctx.fillRect(-w, 0, w * 2, h);

  const near = ctx.createLinearGradient(-w * 0.5, 0, -w * 0.2, 0);
  near.addColorStop(0, `rgba(255,255,255,${0.34 * dim})`);
  near.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = near;
  ctx.fillRect(-w, 0, w, h);

  paintBand(ctx, def, g, shape, w, h, dim);

  if (paint.heat && paint.heat > 0.04) {
    const warm = ctx.createLinearGradient(-w * 0.5, h, w * 0.2, 0);
    warm.addColorStop(0, `rgba(255,140,60,${Math.min(0.26, paint.heat * 0.4)})`);
    warm.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(-w, 0, w * 2, h);
  }

  if (paint.over) {
    const run = ctx.createLinearGradient(0, h * 0.78, 0, h);
    run.addColorStop(0, 'rgba(120,66,26,0)');
    run.addColorStop(1, 'rgba(120,66,26,0.5)');
    ctx.fillStyle = run;
    ctx.fillRect(-w, h * 0.78, w * 2, h * 0.22);
  }

  if (dim < 1) {
    ctx.fillStyle = `rgba(22,12,7,${(1 - dim) * 0.7})`;
    ctx.fillRect(-w, 0, w * 2, h);
  }
  ctx.restore();

  // Specular streak.
  const gloss = 0.5 + 0.5 * Math.min(1, dim + 0.2);
  ctx.save();
  bodyPath(ctx, shape, w, h);
  ctx.clip();
  ctx.filter = 'blur(1px)';
  ctx.fillStyle = `rgba(255,255,255,${0.3 * gloss})`;
  ctx.beginPath();
  ctx.ellipse(-w * 0.22, h * 0.42, w * 0.05, h * 0.26, -0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = 'none';
  ctx.restore();

  // Mouth.
  if (shape === 'bowl') {
    const ry = Math.max(1.6, w * 0.055);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.5, ry, 0, 0, Math.PI * 2);
    const inner = ctx.createLinearGradient(0, -ry, 0, ry);
    inner.addColorStop(0, 'rgba(38,52,48,0.92)');
    inner.addColorStop(0.6, 'rgba(58,74,68,0.9)');
    inner.addColorStop(1, 'rgba(120,136,128,0.85)');
    ctx.fillStyle = inner;
    ctx.fill();
    // the far wall of the bowl, seen through the mouth
    ctx.beginPath();
    ctx.ellipse(0, -ry * 0.25, w * 0.4, ry * 0.55, 0, 0, Math.PI);
    ctx.fillStyle = 'rgba(20,30,26,0.5)';
    ctx.fill();
    // The inner wall you can see across the bowl: this is what says “vessel”.
    ctx.beginPath();
    ctx.ellipse(0, ry * 0.55, w * 0.46, ry * 0.86, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * dim})`;
    ctx.lineWidth = Math.max(0.8, h * 0.012);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.5, ry, 0, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();
    const fr = w * 0.19;
    const fh = Math.max(1.5, h * 0.035);
    ctx.fillStyle = g.deep;
    ctx.beginPath();
    ctx.moveTo(-fr, h - fh);
    ctx.lineTo(-fr, h - fh * 0.2);
    ctx.quadraticCurveTo(0, h - fh * 0.2 + fr * 0.18, fr, h - fh * 0.2);
    ctx.lineTo(fr, h - fh);
    ctx.quadraticCurveTo(0, h - fh + fr * 0.18, -fr, h - fh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(60,44,30,${0.55 * dim})`;
    ctx.beginPath();
    ctx.ellipse(0, h, fr, Math.max(1, h * 0.016), 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'vase') {
    const ry = Math.max(1.2, w * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.1, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(18,12,8,0.75)';
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.45 * dim})`;
    ctx.lineWidth = Math.max(0.7, h * 0.01);
    ctx.stroke();
    ctx.fillStyle = `rgba(60,44,30,${0.45 * dim})`;
    ctx.beginPath();
    ctx.ellipse(0, h, w * 0.2, Math.max(0.8, h * 0.012), 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.44, Math.max(1.6, w * 0.07), 0, 0, Math.PI * 2);
    const lid = ctx.createLinearGradient(-w * 0.4, 0, w * 0.4, 0);
    lid.addColorStop(0, g.dark);
    lid.addColorStop(0.3, g.light);
    lid.addColorStop(1, g.deep);
    ctx.fillStyle = lid;
    ctx.fill();
    ctx.strokeStyle = `rgba(0,0,0,${0.35 * dim})`;
    ctx.lineWidth = Math.max(0.8, h * 0.01);
    ctx.stroke();
  }

  if (paint.cracked) {
    ctx.strokeStyle = 'rgba(28,20,14,0.85)';
    ctx.lineWidth = Math.max(1, h * 0.008);
    for (let i = 0; i < 3; i++) {
      const x0 = -w * 0.14 + i * w * 0.14;
      ctx.beginPath();
      ctx.moveTo(x0, h * 0.1);
      ctx.lineTo(x0 + w * 0.04, h * 0.4);
      ctx.lineTo(x0 - w * 0.02, h * 0.64);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The shard pulled out of the fire hole: the only instrument in the game. */
export function drawShard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  maturity: number,
  reduced: boolean,
): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.52;
  const s = Math.min(w, h) * 0.46;

  ctx.save();
  ctx.translate(cx, cy);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(s * 0.06, s * 0.86, s * 0.62, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(-0.1);

  const pts: [number, number][] = [
    [-1.02, -0.02], [-0.74, -0.36], [-0.36, -0.44], [-0.02, -0.6], [0.36, -0.52],
    [0.72, -0.56], [0.96, -0.24], [1.04, 0.06], [0.7, 0.3], [0.44, 0.52],
    [0.06, 0.48], [-0.3, 0.56], [-0.62, 0.34], [-0.9, 0.22],
  ];
  const shape = new Path2D();
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(s * x, s * y) : shape.lineTo(s * x, s * y)));
  shape.closePath();

  ctx.fillStyle = 'rgba(206,178,138,0.98)';
  ctx.save();
  ctx.translate(s * 0.025, s * 0.055);
  ctx.fill(shape, 'evenodd');
  ctx.restore();

  const raw = Math.max(0, 1 - maturity);
  const burnt = Math.max(0, maturity - 1);
  const g = ctx.createLinearGradient(-s, -s * 0.8, s * 0.8, s * 0.9);
  if (burnt > 0.02) {
    g.addColorStop(0, '#e2b98a');
    g.addColorStop(0.45, '#c98f52');
    g.addColorStop(1, '#8a5a30');
  } else {
    g.addColorStop(0, '#fdfbf3');
    g.addColorStop(0.35, `rgb(${246 - raw * 22},${244 - raw * 26},${234 - raw * 34})`);
    g.addColorStop(1, `rgb(${196 - raw * 30},${200 - raw * 34},${186 - raw * 40})`);
  }
  ctx.fillStyle = g;
  ctx.fill(shape, 'evenodd');

  ctx.save();
  ctx.clip(shape, 'evenodd');
  ctx.strokeStyle = `rgba(38,78,150,${0.35 + Math.min(0.5, maturity * 0.5)})`;
  ctx.lineWidth = s * 0.13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.8, s * 0.05);
  ctx.bezierCurveTo(-s * 0.3, -s * 0.3, s * 0.25, s * 0.42, s * 0.8, -s * 0.2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = s * 0.03;
  ctx.beginPath();
  ctx.moveTo(-s * 0.78, -s * 0.02);
  ctx.bezierCurveTo(-s * 0.3, -s * 0.36, s * 0.25, s * 0.36, s * 0.78, -s * 0.26);
  ctx.stroke();

  const gloss = Math.max(0, Math.min(1, (maturity - 0.4) / 0.55));
  if (gloss > 0.02) {
    const lg = ctx.createLinearGradient(-s * 0.7, -s * 0.8, s * 0.1, s * 0.2);
    lg.addColorStop(0, `rgba(255,255,255,${0.62 * gloss})`);
    lg.addColorStop(0.35, `rgba(255,255,255,${0.12 * gloss})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * gloss})`;
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.4);
    ctx.quadraticCurveTo(-s * 0.1, -s * 0.55, s * 0.3, -s * 0.42);
    ctx.stroke();
  }

  if (maturity < 0.88) {
    const beads = reduced ? 2 : 5;
    for (let i = 0; i < beads; i++) {
      const bx = -s * 0.6 + (((i * 37) % 100) / 100) * s * 1.2;
      const by = s * 0.2 + (((i * 53) % 100) / 100) * s * 0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.75 - raw * 0.2})`;
      ctx.beginPath();
      ctx.arc(bx, by, s * (0.022 + ((i * 17) % 10) / 320), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(bx - s * 0.01, by - s * 0.01, s * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const warm = ctx.createLinearGradient(-s, s * 0.6, -s * 0.2, -s * 0.2);
  warm.addColorStop(0, 'rgba(240,140,60,0.22)');
  warm.addColorStop(1, 'rgba(240,140,60,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(1, s * 0.015);
  ctx.stroke(shape);

  if (burnt > 0) {
    ctx.fillStyle = 'rgba(168,100,44,0.85)';
    for (let i = 0; i < 3; i++) {
      const dx = -s * 0.35 + i * s * 0.4;
      ctx.beginPath();
      ctx.ellipse(dx, s * 0.62 + i * s * 0.02, s * 0.05, s * (0.08 + burnt * 0.14), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
