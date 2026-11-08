/**
 * Arena 拳手 AI 性格 v0.1。
 * 8 拳手各有打法性格；chooseAiMove 按权重随机 + 简单读招。
 * 随机性只在这里，engine.ts 保持确定性。
 */
import { MOVES, type FighterState, type MoveId } from './engine';

export interface Personality {
  slug: string;
  name: string;
  /** 0-1：越高越爱出招（vs 防御/心理） */
  aggression: number;
  /** 0-1：心理招里佯攻占比 */
  feintRate: number;
  /** 0-1：心理招里嘲讽占比 */
  tauntRate: number;
  /** 0-1：防御招里闪避/下潜占比（vs 格挡） */
  dodgeRate: number;
  /** 偏爱的打击技（权重更高） */
  favored: MoveId[];
  style: string;
}

export const FIGHTERS: Record<string, Personality> = {
  iron_jaw: {
    slug: 'iron_jaw',
    name: 'IRON JAW',
    aggression: 0.9,
    feintRate: 0.05,
    tauntRate: 0.15,
    dodgeRate: 0.1,
    favored: ['hook', 'uppercut', 'cross'],
    style: '莽夫型：重拳压制，绝不后退',
  },
  viper: {
    slug: 'viper',
    name: 'VIPER',
    aggression: 0.5,
    feintRate: 0.35,
    tauntRate: 0.2,
    dodgeRate: 0.35,
    favored: ['jab', 'cross', 'feint'],
    style: '诡诈型：佯攻读心，毒蛇吐信',
  },
  sledge: {
    slug: 'sledge',
    name: 'SLEDGE',
    aggression: 0.8,
    feintRate: 0.05,
    tauntRate: 0.1,
    dodgeRate: 0.05,
    favored: ['uppercut', 'hook', 'body'],
    style: '重炮型：大开大合，一拳定音',
  },
  monsoon: {
    slug: 'monsoon',
    name: 'MONSOON',
    aggression: 0.6,
    feintRate: 0.15,
    tauntRate: 0.1,
    dodgeRate: 0.25,
    favored: ['cross', 'body', 'jab'],
    style: '均衡型：连绵如雨，无懈可击',
  },
  volt: {
    slug: 'volt',
    name: 'VOLT',
    aggression: 0.7,
    feintRate: 0.1,
    tauntRate: 0.15,
    dodgeRate: 0.4,
    favored: ['jab', 'cross'],
    style: '疾风型：天下武功，唯快不破',
  },
  the_professor: {
    slug: 'the_professor',
    name: 'THE PROFESSOR',
    aggression: 0.4,
    feintRate: 0.3,
    tauntRate: 0.1,
    dodgeRate: 0.3,
    favored: ['cross', 'feint', 'jab'],
    style: '技术型：算无遗策，读你如书',
  },
  la_reina: {
    slug: 'la_reina',
    name: 'LA REINA',
    aggression: 0.6,
    feintRate: 0.15,
    tauntRate: 0.3,
    dodgeRate: 0.3,
    favored: ['hook', 'taunt', 'cross'],
    style: '女王型：华丽即正义，人气即王道',
  },
  'goliath-7': {
    slug: 'goliath-7',
    name: 'GOLIATH-7',
    aggression: 0.75,
    feintRate: 0.05,
    tauntRate: 0.2,
    dodgeRate: 0.05,
    favored: ['uppercut', 'body', 'hook'],
    style: '坦克型：硬吃伤害，以伤换伤',
  },
};

export const FIGHTER_SLUGS = Object.keys(FIGHTERS);

export function isValidFighter(slug: string): boolean {
  return slug in FIGHTERS;
}

/** 立绘 URL（public/arena/fighters/<slug>.png） */
export function portraitUrl(slug: string): string {
  return `/arena/fighters/${slug}.png`;
}

/**
 * AI 选招。
 * @param p 性格
 * @param playerHistory 玩家最近出招（最多传 5 个，越靠后越近）
 * @param ai 体力/人气状态（残血转保守、人气将满爱嘲讽）
 */
export function chooseAiMove(
  p: Personality,
  playerHistory: MoveId[],
  ai: FighterState,
  player: FighterState
): MoveId {
  // 1. 读招：玩家连续两次同招 → 20% 概率针对
  const n = playerHistory.length;
  if (n >= 2 && playerHistory[n - 1] === playerHistory[n - 2]) {
    if (Math.random() < 0.2) {
      const last = playerHistory[n - 1];
      const def = MOVES[last];
      if (def.kind === 'strike') {
        // 出重拳读 → 闪避；出快拳 → 格挡
        return def.speed <= 2 ? 'dodge' : 'block';
      }
      if (def.kind === 'defense') return 'feint'; // 一直防 → 佯攻读穿
      return 'jab'; // 一直玩心理 → 快拳打断
    }
  }

  const r = Math.random();

  // 2. 残血（<30）转保守：防御概率翻倍
  const desperate = ai.hp < 30;
  // 3. 人气将满（>=70）：更爱嘲讽，一波带走
  const showtime = ai.hype >= 70;
  // 4. 对手人气将满：优先进攻打断
  const deny = player.hype >= 70;

  const aggression = p.aggression + (deny ? 0.15 : 0) - (desperate ? 0.25 : 0);

  if (r < aggression) {
    // 进攻：从偏爱招式里挑，体力不够则降档
    const pool: MoveId[] = [...p.favored, 'jab', 'cross', 'body'];
    for (const m of pool) {
      if (ai.stamina >= MOVES[m].stamina) return m;
    }
    return 'jab';
  }

  // 非进攻：防御 vs 心理
  const mindBias = p.feintRate + p.tauntRate + (showtime ? 0.2 : 0);
  const r2 = Math.random();
  if (r2 < mindBias / (mindBias + 1)) {
    // 心理战
    const f = p.feintRate / (p.feintRate + p.tauntRate || 1);
    const pick = Math.random() < f ? 'feint' : 'taunt';
    if (ai.stamina >= MOVES[pick].stamina) return pick;
    return 'taunt'; // 嘲讽不耗体力，永远可用
  }
  // 防御
  if (Math.random() < p.dodgeRate) {
    if (ai.stamina >= MOVES.dodge.stamina) return 'dodge';
    if (ai.stamina >= MOVES.duck.stamina) return 'duck';
  }
  return 'block';
}
