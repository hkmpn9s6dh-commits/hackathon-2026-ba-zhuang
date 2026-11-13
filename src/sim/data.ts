/** The wares, the three nights, and the orders. All numbers live here. */

import type { EventDef, NightDef, Order, WareDef } from './types';

export const WARES: Record<string, WareDef> = {
  'yingqing-bowl': {
    id: 'yingqing-bowl',
    kind: 'yingqing',
    name: '影青刻花碗',
    mid: 0.5,
    half: 0.05,
    price: 14,
    body: 'thin',
    praise: '釉薄处见光，像一汪水。',
    overNote: '釉流到足上，粘了垫饼。',
    underNote: '釉还哑着，刻花发灰。',
  },
  'qinghua-bowl': {
    id: 'qinghua-bowl',
    kind: 'qinghua',
    name: '青花缠枝碗',
    mid: 0.62,
    half: 0.05,
    price: 24,
    body: 'thick',
    praise: '青花沉进釉里，一笔没散。',
    overNote: '青花泛紫，边沿起了泡。',
    underNote: '青花浮在釉上，发黑。',
  },
  'qinghua-jar': {
    id: 'qinghua-jar',
    kind: 'qinghua',
    name: '青花盖罐',
    mid: 0.62,
    half: 0.05,
    price: 30,
    body: 'thick',
    praise: '盖口严丝合缝，釉色正。',
    overNote: '罐身塌了一角。',
    underNote: '釉面起橘皮，青花发闷。',
  },
  'qinghua-vase': {
    id: 'qinghua-vase',
    kind: 'qinghua',
    name: '青花梅瓶',
    mid: 0.63,
    half: 0.04,
    price: 36,
    body: 'thick',
    praise: '肩线挺，青花分水清楚。',
    overNote: '肩部流釉，拉出一道痕。',
    underNote: '青花没吃进胎里。',
  },
  'jihong-vase': {
    id: 'jihong-vase',
    kind: 'jihong',
    name: '霁红玉壶春',
    mid: 0.72,
    half: 0.04,
    price: 48,
    body: 'thin',
    praise: '红得像刚凝住的朱砂。',
    overNote: '红色烧飞了，只剩一圈白。',
    underNote: '发暗，像隔夜的猪肝。',
  },
};

const order = (label: string, kind: Order['kind'], want: Order['want'], count: number, reward: number): Order => ({
  label,
  kind,
  want,
  count,
  reward,
});

const night1Events: EventDef[] = [
  {
    at: 4,
    title: '柴房返潮',
    body: '堆在墙角的松柴受了夜露，抓一把手上是湿的。',
    choices: [
      { label: '就用湿柴（省 12 把，火头弱）', wood: 0, fuel: -0.25, stress: 0.4, log: '湿柴压火，多熬了半个时辰。' },
      { label: '去后院抱干柴（耗 8 文，火头稳）', wood: -12, stress: 0, log: '干柴一进膛，火色立刻转亮。' },
    ],
  },
];

const night2Events: EventDef[] = [
  {
    at: 3,
    title: '徒弟打了盹',
    body: '添柴的小徒弟靠着柴堆睡着了，火膛里只剩一层暗红。',
    choices: [
      { label: '自己添（费神，火不退）', fuel: 0.35, wood: -6, stress: 0, log: '你亲手补了三把柴。' },
      { label: '让他睡（省柴，火要掉）', fuel: -0.2, temp: -0.03, stress: 0.5, log: '火色暗下去一档。' },
    ],
  },
  {
    at: 8,
    title: '窑顶渗水',
    body: '窑顶的砖缝渗出一点水汽，滴在匣钵盖上滋滋响。',
    choices: [
      { label: '开大火眼顶回去（费柴）', wood: -10, fuel: 0.2, log: '你加开火眼，把水汽逼了出去。' },
      { label: '封住那一孔（稳，但压火）', temp: -0.02, stress: 0.3, log: '封了一孔，火路偏了一点。' },
    ],
  },
];

const night3Events: EventDef[] = [
  {
    at: 2,
    title: '知府衙门来人',
    body: '来人站在窑房门口问：这窑几时能开？',
    choices: [
      { label: '回他「明日卯时」（照常烧）', log: '你说，火不等人。' },
      {
        label: '答应提前一个时辰（赶工，火路要压）',
        temp: 0.05,
        stress: 0.8,
        log: '赶工的火，总是要还的。',
      },
    ],
  },
  {
    at: 6,
    title: '一场过云雨',
    body: '雨点砸在窑棚上，烟囱口倒灌进一股凉气。',
    choices: [
      { label: '冒雨加柴（湿身，火不落）', fuel: 0.4, wood: -14, stress: 0.2, log: '你淋着雨添了十四把柴。' },
      { label: '先遮烟囱（安全，火要掉）', temp: -0.04, stress: 0.6, log: '火头被压了一截。' },
    ],
  },
  {
    at: 10,
    title: '火照子还剩最后一次',
    body: '你捏着最后一片火照子，釉已经流平了，再烧就要过。',
    choices: [
      { label: '收火（稳，可能欠一口）', fuel: -0.3, temp: -0.01, stress: 0.2, log: '你压了火，留一线余地。' },
      { label: '再烧一炷香（险，赌窑变）', fuel: 0.25, temp: 0.02, stress: 0.9, log: '你赌了一把。' },
    ],
  },
];

export const NIGHTS: NightDef[] = [
  {
    index: 1,
    name: '试烧',
    subtitle: '民窑 · 一窑影青',
    tray: ['yingqing-bowl', 'yingqing-bowl', 'yingqing-bowl', 'yingqing-bowl', 'yingqing-bowl'],
    curve: [0.02, 0.06, 0.12, 0.2, 0.28, 0.36, 0.42, 0.47, 0.5, 0.5, 0.5, 0.5],
    wood: 150,
    events: night1Events,
    orders: [order('交 3 件合格影青', 'yingqing', 'good', 3, 30)],
    brief: '先把一窑影青烧熟。火路在图右侧，跟着走，别贪快。',
  },
  {
    index: 2,
    name: '官窑订单',
    subtitle: '官窑 · 影青与青花',
    tray: [
      'yingqing-bowl',
      'yingqing-bowl',
      'yingqing-bowl',
      'qinghua-bowl',
      'qinghua-bowl',
      'qinghua-jar',
      'qinghua-jar',
    ],
    curve: [0.03, 0.08, 0.16, 0.26, 0.36, 0.45, 0.52, 0.57, 0.6, 0.6, 0.6, 0.6],
    wood: 160,
    events: night2Events,
    orders: [order('交 3 件合格青花', 'qinghua', 'good', 3, 55)],
    brief: '两种火候的器，得放进两个火位。窑头热，窑尾凉。',
  },
  {
    index: 3,
    name: '贡瓷',
    subtitle: '御窑 · 青花与霁红',
    tray: [
      'qinghua-vase',
      'qinghua-vase',
      'qinghua-jar',
      'qinghua-bowl',
      'jihong-vase',
      'jihong-vase',
      'jihong-vase',
    ],
    curve: [0.04, 0.1, 0.2, 0.32, 0.44, 0.53, 0.6, 0.65, 0.68, 0.68, 0.68, 0.68],
    wood: 170,
    events: night3Events,
    orders: [order('贡瓷：霁红 2 件精品', 'jihong', 'excellent', 2, 140)],
    brief: '霁红最难烧：差一口就发暗，多一口就烧飞。',
  },
];
