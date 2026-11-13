/** Porcelain, drawn procedurally. No images anywhere in this game. */

import type { WareDef } from '../sim/types';

export type WareShape = 'bowl' | 'vase' | 'jar';

export function shapeOf(id: string): WareShape {
  if (id.includes('vase')) return 'vase';
  if (id.includes('jar')) return 'jar';
  return 'bowl';
}

export interface WarePaint {
  /** 0..1, how hot this piece thinks it got; drives the glow. */
  heat?: number;
  over?: boolean;
  cracked?: boolean;
  flambe?: boolean;
  /** Slight sag for overfired pieces. */
  droop?: number;
  /** 0..1, how much ambient light reaches it. Low inside the kiln. */
  dim?: number;
}

const GLAZE: Record<string, [string, string]> = {
  yingqing: ['#eef4ef', '#b6cec3'],
  qinghua: ['#f4f1e7', '#ddd6c4'],
  jihong: ['#bb4130', '#701c10'],
};

const N = 16;

/** Half-width profile for each shape, t = 0 at the rim/base, 1 at the other end. */
function halfProfile(shape: WareShape, w: number, t: number): number {
  if (shape === 'bowl') return (w / 2) * (1 - 0.5 * Math.pow(t, 2.1));
  if (shape === 'jar') return (w / 2) * Math.pow(Math.max(0, Math.sin(Math.PI * (0.16 + 0.7 * t))), 0.5);
  // vase: foot -> belly -> neck -> lip
  const belly = w / 2;
  if (t < 0.16) return belly * (0.34 + (0.66 * t) / 0.16);
  if (t < 0.52) return belly * (1 - 0.06 * Math.sin(((t - 0.16) / 0.36) * Math.PI));
  if (t < 0.8) return belly * (0.94 - (0.78 * (t - 0.52)) / 0.28);
  return belly * (0.16 + (0.14 * (t - 0.8)) / 0.2);
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

/** Draw a piece centred on (cx, cy) with the given body height; cy is the foot. */
export function drawWare(
  ctx: CanvasRenderingContext2D,
  def: WareDef,
  cx: number,
  cy: number,
  height: number,
  paint: WarePaint = {},
): void {
  const shape = shapeOf(def.id);
  const ratio = shape === 'vase' ? 0.58 : shape === 'jar' ? 0.82 : 1.05;
  const w = height * ratio;
  const h = height;
  const [light, dark] = GLAZE[def.kind] ?? GLAZE.yingqing;
  const dim = paint.dim ?? 1;

  ctx.save();
  ctx.translate(cx, cy - h);
  if (paint.droop) ctx.transform(1, 0, 0, 1 + paint.droop * 0.1, 0, 0);

  // Contact shadow on the shelf.
  ctx.fillStyle = `rgba(0,0,0,${0.3 * dim})`;
  ctx.beginPath();
  ctx.ellipse(0, 1, w * 0.36, Math.max(1.5, h * 0.03), 0, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createLinearGradient(-w * 0.5, 0, w * 0.55, h);
  g.addColorStop(0, paint.flambe ? '#c9664f' : light);
  g.addColorStop(0.5, paint.flambe ? '#d2806a' : light);
  g.addColorStop(1, paint.flambe ? '#487a82' : dark);
  bodyPath(ctx, shape, w, h);
  ctx.fillStyle = g;
  ctx.fill();

  // Mouth of the vessel: the detail that makes a bowl read as a bowl.
  if (shape === 'bowl') {
    const ry = Math.max(1.6, w * 0.075);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.49, ry, 0, 0, Math.PI * 2);
    const inner = ctx.createLinearGradient(0, -ry, 0, ry);
    inner.addColorStop(0, paint.flambe ? '#4d2418' : '#3a3a33');
    inner.addColorStop(0.7, paint.flambe ? '#6d4a3c' : '#5a564a');
    inner.addColorStop(1, paint.flambe ? '#8a5f4c' : '#8d8474');
    ctx.fillStyle = inner;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.62 * dim})`;
    ctx.lineWidth = Math.max(0.9, h * 0.01);
    ctx.stroke();
    // foot ring
    ctx.fillStyle = `rgba(90,70,50,${0.55 * dim})`;
    ctx.beginPath();
    ctx.ellipse(0, h, w * 0.19, Math.max(1.2, h * 0.022), 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'vase') {
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.115, Math.max(1.2, w * 0.035), 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,14,10,0.55)';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.3, Math.max(1.4, w * 0.055), 0, 0, Math.PI * 2);
    ctx.fillStyle = paint.flambe ? '#8a3a2c' : light;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.42 * dim})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Decoration, clipped to the body.
  ctx.save();
  bodyPath(ctx, shape, w, h);
  ctx.clip();

  if (def.kind === 'qinghua') {
    ctx.strokeStyle = `rgba(47,90,168,${0.85 * dim})`;
    ctx.lineWidth = Math.max(1, h * 0.014);
    ctx.beginPath();
    ctx.moveTo(-w, h * (shape === 'bowl' ? 0.22 : 0.18));
    ctx.lineTo(w, h * (shape === 'bowl' ? 0.22 : 0.18));
    ctx.moveTo(-w, h * 0.8);
    ctx.lineTo(w, h * 0.8);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.9, h * 0.009);
    for (let i = 0; i < 5; i++) {
      const bx = -w * 0.36 + i * w * 0.18;
      ctx.beginPath();
      ctx.moveTo(bx, h * 0.68);
      ctx.bezierCurveTo(bx + w * 0.09, h * 0.54, bx + w * 0.13, h * 0.44, bx + w * 0.05, h * 0.3);
      ctx.bezierCurveTo(bx + w * 0.01, h * 0.42, bx - w * 0.05, h * 0.54, bx, h * 0.68);
      ctx.stroke();
    }
  } else if (def.kind === 'jihong') {
    ctx.fillStyle = 'rgba(255,225,205,0.14)';
    ctx.fillRect(-w, h * 0.04, w * 2, h * 0.05);
    ctx.fillStyle = 'rgba(30,0,0,0.2)';
    ctx.fillRect(-w, h * 0.88, w * 2, h * 0.08);
    if (paint.flambe) {
      ctx.fillStyle = 'rgba(70,140,150,0.4)';
      ctx.beginPath();
      ctx.ellipse(-w * 0.08, h * 0.45, w * 0.22, h * 0.3, 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * dim})`;
    ctx.lineWidth = Math.max(0.8, h * 0.007);
    for (let i = 0; i < 5; i++) {
      const bx = -w * 0.4 + i * w * 0.2;
      ctx.beginPath();
      ctx.moveTo(bx, h * 0.72);
      ctx.bezierCurveTo(bx + w * 0.06, h * 0.58, bx + w * 0.1, h * 0.46, bx + w * 0.04, h * 0.34);
      ctx.stroke();
    }
  }

  if (paint.heat && paint.heat > 0.03) {
    ctx.fillStyle = `rgba(232,128,52,${Math.min(0.3, paint.heat * 0.4)})`;
    ctx.fillRect(-w, 0, w * 2, h);
  }

  if (paint.over) {
    ctx.fillStyle = 'rgba(120,70,30,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.99, w * 0.5, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ambient shading: what the kiln does not light stays in shadow.
  if (dim < 1) {
    ctx.fillStyle = `rgba(6,4,3,${(1 - dim) * 0.55})`;
    ctx.fillRect(-w, 0, w * 2, h);
  }
  ctx.restore();

  // Rim highlight.
  ctx.strokeStyle = `rgba(255,255,255,${0.4 * dim})`;
  ctx.lineWidth = Math.max(0.8, h * 0.008);
  bodyPath(ctx, shape, w, h);
  ctx.stroke();

  if (paint.cracked) {
    ctx.strokeStyle = 'rgba(30,22,18,0.8)';
    ctx.lineWidth = Math.max(1, h * 0.009);
    for (let i = 0; i < 3; i++) {
      const x0 = -w * 0.16 + i * w * 0.15;
      ctx.beginPath();
      ctx.moveTo(x0, h * 0.12);
      ctx.lineTo(x0 + w * 0.04, h * 0.42);
      ctx.lineTo(x0 - w * 0.02, h * 0.66);
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
  const s = Math.min(w, h) * 0.5;

  ctx.save();
  ctx.translate(cx, cy);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.95, s * 0.55, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(-0.1);
  ctx.beginPath();
  ctx.moveTo(-s * 0.92, -s * 0.52);
  ctx.lineTo(s * 0.18, -s * 0.86);
  ctx.lineTo(s * 0.96, -s * 0.06);
  ctx.lineTo(s * 0.42, s * 0.78);
  ctx.lineTo(-s * 0.48, s * 0.62);
  ctx.closePath();

  const raw = Math.max(0, 1 - maturity);
  const burnt = Math.max(0, maturity - 1);
  const g = ctx.createLinearGradient(-s, -s, s, s);
  g.addColorStop(0, maturity > 1 ? '#9a6338' : '#f7f3e8');
  g.addColorStop(0.5, maturity > 1 ? '#cf9459' : `rgb(${236 - raw * 26},${233 - raw * 30},${222 - raw * 38})`);
  g.addColorStop(1, `rgba(168,158,128,${0.85 + Math.min(0.15, maturity * 0.2)})`);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.strokeStyle = `rgba(47,90,168,${0.3 + Math.min(0.5, maturity * 0.5)})`;
  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(-s * 0.78, s * 0.12);
  ctx.bezierCurveTo(-s * 0.24, -s * 0.34, s * 0.3, s * 0.48, s * 0.82, -s * 0.18);
  ctx.stroke();

  const gloss = Math.max(0, Math.min(1, (maturity - 0.45) / 0.6));
  if (gloss > 0.02) {
    const lg = ctx.createLinearGradient(-s * 0.6, -s * 0.7, s * 0.2, s * 0.1);
    lg.addColorStop(0, `rgba(255,255,255,${0.5 * gloss})`);
    lg.addColorStop(0.4, `rgba(255,255,255,${0.07 * gloss})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-s, -s, s * 2, s * 2);
  }

  if (maturity < 0.88) {
    const beads = reduced ? 3 : 8;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < beads; i++) {
      const bx = -s * 0.62 + (((i * 37) % 100) / 100) * s * 1.3;
      const by = s * 0.34 + (((i * 53) % 100) / 100) * s * 0.34;
      ctx.beginPath();
      ctx.arc(bx, by, s * (0.045 + ((i * 17) % 10) / 220), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (burnt > 0) {
    ctx.fillStyle = 'rgba(176,106,48,0.9)';
    for (let i = 0; i < 3; i++) {
      const dx = -s * 0.4 + i * s * 0.45;
      ctx.beginPath();
      ctx.ellipse(dx, s * 0.74 + i * s * 0.03, s * 0.06, s * (0.1 + burnt * 0.16), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
