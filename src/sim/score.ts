/** Money, reputation, orders, ending. */

import type { FiringResult, NightDef, Order, Piece, Verdict } from './types';

export const VERDICT_LABEL: Record<Verdict, string> = {
  over: '过火',
  under: '生烧',
  good: '合格',
  excellent: '精品',
  flambe: '窑变',
  cracked: '惊釉',
};

export function pieceValue(p: Piece): number {
  const base = p.ware.def.price;
  switch (p.verdict) {
    case 'flambe':
      return Math.round(base * 3);
    case 'excellent':
      return Math.round(base * (1.25 + 0.35 * p.quality));
    case 'good':
      return Math.round(base * (0.55 + 0.85 * p.quality));
    case 'cracked':
      return Math.round(base * 0.1);
    default:
      return Math.round(base * 0.12);
  }
}

export function orderProgress(order: Order, pieces: readonly Piece[]): number {
  return pieces.filter((p) => {
    if (p.ware.def.kind !== order.kind) return false;
    if (order.want === 'good') return p.verdict === 'good' || p.verdict === 'excellent' || p.verdict === 'flambe';
    return p.verdict === 'excellent' || p.verdict === 'flambe';
  }).length;
}

export interface OrderResult {
  order: Order;
  have: number;
  done: boolean;
  reward: number;
}

export interface Settlement {
  coins: number;
  rep: number;
  orders: OrderResult[];
  breakdown: { label: string; value: number }[];
}

export function settle(night: NightDef, pieces: readonly Piece[], firing: FiringResult): Settlement {
  const goods = pieces.reduce((n, p) => n + pieceValue(p), 0);
  const orders: OrderResult[] = night.orders.map((order) => {
    const have = orderProgress(order, pieces);
    const done = have >= order.count;
    return { order, have, done, reward: done ? order.reward : 0 };
  });
  const orderCoins = orders.reduce((n, o) => n + o.reward, 0);

  const clean = firing.stress < 8 ? 3 : firing.stress < 18 ? 1 : 0;
  const rep = orders.filter((o) => o.done).length * 2 + clean;

  return {
    coins: goods + orderCoins,
    rep,
    orders,
    breakdown: [
      { label: '售出瓷器', value: goods },
      { label: '订单', value: orderCoins },
      { label: '声誉', value: rep },
    ],
  };
}

export interface Ending {
  title: string;
  body: string;
}

export function ending(totalRep: number, totalCoins: number): Ending {
  if (totalRep >= 12 && totalCoins >= 320) {
    return {
      title: '把桩',
      body: '知府把下一窑的帖子直接送到了你手上。你摸了摸窑门，还是温的。',
    };
  }
  if (totalRep >= 7) {
    return {
      title: '上手',
      body: '窑户说，明年春窑还请你来看火。这一夜的本事，算是立住了。',
    };
  }
  return {
    title: '学徒',
    body: '天亮时你蹲在窑门口，把碎瓷一片片捡起来。火不骗人，下一窑再来。',
  };
}
