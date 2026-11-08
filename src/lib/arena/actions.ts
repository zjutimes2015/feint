/**
 * Arena 动作库映射 — 引擎招式 / 回合事件 → Mixamo FBX 动作。
 *
 * 唯一真源是 pipeline/assets/mixamo/manifest.json（FBX 文件所在地）。
 * 本文件是它的 TS 镜像，只放映射，不放文件解析逻辑。
 * tests/unit/lib/arena-actions.test.ts 会逐项比对两边，漂移就报错。
 *
 * 状态：
 * - ready：文件已在库里，可直接用
 * - mirror：无独立文件，Blender 里镜像另一 clip（Scale X = -1）
 * - fallback：无独立 FBX，画面借用另一 clip 的片段（渲染时截断）
 * - missing：无文件、无替代办法；画面须绕开，见 manifest 的 fetch 指引
 */
import type { MoveId } from './engine';

export type ActionStatus = 'ready' | 'mirror' | 'fallback' | 'missing';

export interface ActionRef {
  clip: string | null;
  status: ActionStatus;
  note?: string;
}

/** 引擎 10 招 → 动作 clip。 */
export const MOVE_ACTIONS: Record<MoveId, ActionRef> = {
  jab: { clip: 'strike_jab', status: 'ready' },
  cross: { clip: 'strike_cross', status: 'ready' },
  hook: {
    clip: 'strike_hook',
    status: 'ready',
    note: '左勾拳；右勾拳见 strike_hook_b',
  },
  uppercut: { clip: 'strike_uppercut', status: 'ready' },
  body: { clip: 'strike_body', status: 'ready' },
  block: { clip: 'defense_block', status: 'ready' },
  dodge: {
    clip: 'defense_dodge_r',
    status: 'ready',
    note: '右闪；左闪为其镜像（defense_dodge_l）',
  },
  duck: { clip: 'defense_duck', status: 'ready' },
  feint: {
    clip: 'strike_jab',
    status: 'fallback',
    note: '佯攻无独立 FBX；画面用刺拳起手前段作假动作，渲染时截断',
  },
  taunt: { clip: 'react_taunt', status: 'ready' },
};

export type BoutEvent =
  | 'idle'
  | 'idle_alt'
  | 'advance'
  | 'retreat'
  | 'circle_left'
  | 'circle_right'
  | 'entrance'
  | 'hit_head'
  | 'hit_body'
  | 'stagger'
  | 'knockdown'
  | 'ko'
  | 'getup'
  | 'victory'
  | 'defeat';

/** 回合事件（受击反应、击倒、胜负、出场、站架、移动）→ 动作 clip。 */
export const BOUT_EVENT_ACTIONS: Record<BoutEvent, ActionRef> = {
  idle: { clip: 'stance_idle_a', status: 'ready' },
  idle_alt: { clip: 'stance_idle_b', status: 'ready' },
  advance: { clip: 'move_advance', status: 'ready' },
  retreat: { clip: 'move_retreat', status: 'ready' },
  circle_left: { clip: 'move_circle_l', status: 'ready' },
  circle_right: { clip: 'move_circle_r', status: 'ready' },
  entrance: { clip: 'move_swagger', status: 'ready' },
  hit_head: { clip: 'react_head_hit', status: 'ready' },
  hit_body: { clip: 'react_body_hit', status: 'ready' },
  stagger: { clip: 'react_stagger', status: 'ready' },
  knockdown: { clip: 'react_knockdown', status: 'ready' },
  ko: { clip: 'react_ko', status: 'ready' },
  getup: { clip: 'react_getup', status: 'ready' },
  victory: { clip: 'react_victory', status: 'ready' },
  defeat: { clip: 'react_defeat', status: 'ready' },
};

/** 标准连招：clip id 序列（画面按顺序拼）。 */
export const COMBOS: Record<string, readonly string[]> = {
  opening_combo: [
    'strike_jab',
    'strike_cross',
    'strike_hook',
    'react_head_hit',
  ],
  power_combo: [
    'strike_cross',
    'strike_hook_b',
    'strike_uppercut',
    'react_stagger',
  ],
};

/** 某招 / 事件有没有可用的画面（missing 不算可用）。 */
export function hasFootage(ref: ActionRef): boolean {
  return ref.status !== 'missing' && ref.clip !== null;
}
