/**
 * SEO data for BRAWLVERSE indexable pages: one page per fighter, one page
 * per Season 1 quarterfinal, plus the prediction-market education page.
 *
 * Facts only — no invented records, prices, or results:
 * - Fighter bios/styles/trash talk live in messages (Brawlverse.fighters.list).
 * - Engine stats come from src/lib/arena/fighters.ts (the game itself).
 * - The QF bracket is the live /api/bouts response (2026-11-07): qf1–qf4.
 * - Records are 0-0 for everyone: the live /api/betting?op=records ledger
 *   is empty — no bout has settled yet in Season 1.
 */
import { FIGHTERS } from '@/lib/arena/fighters';
import type { MoveId } from '@/lib/arena/engine';
import type { Locale } from 'next-intl';

export type FighterKey =
  | 'ironJaw'
  | 'viper'
  | 'volt'
  | 'goliath7'
  | 'laReina'
  | 'sledge'
  | 'monsoon'
  | 'professor';

/** URL slug per fighter (kebab-case, lowercase). */
export const FIGHTER_SLUG_BY_KEY: Record<FighterKey, string> = {
  ironJaw: 'iron-jaw',
  viper: 'viper',
  volt: 'volt',
  goliath7: 'goliath-7',
  laReina: 'la-reina',
  sledge: 'sledge',
  monsoon: 'monsoon',
  professor: 'the-professor',
};

export const FIGHTER_KEY_BY_SLUG: Record<string, FighterKey> = {
  'iron-jaw': 'ironJaw',
  viper: 'viper',
  volt: 'volt',
  'goliath-7': 'goliath7',
  'la-reina': 'laReina',
  sledge: 'sledge',
  monsoon: 'monsoon',
  'the-professor': 'professor',
};

export const FIGHTER_SLUGS = Object.values(FIGHTER_SLUG_BY_KEY);

/** Key in src/lib/arena/fighters.ts FIGHTERS record per translation key. */
export const ENGINE_SLUG_BY_KEY: Record<FighterKey, string> = {
  ironJaw: 'iron_jaw',
  viper: 'viper',
  volt: 'volt',
  goliath7: 'goliath-7',
  laReina: 'la_reina',
  sledge: 'sledge',
  monsoon: 'monsoon',
  professor: 'the_professor',
};

/** Portrait image per fighter (same files as the /fighters grid). */
export const PORTRAIT_BY_KEY: Record<FighterKey, string> = {
  ironJaw: '/brawlverse/assets/iron-jaw-portrait.jpg',
  viper: '/brawlverse/assets/viper-portrait.jpg',
  volt: '/brawlverse/assets/fan-volt.jpg',
  goliath7: '/brawlverse/assets/fan-goliath7.jpg',
  laReina: '/brawlverse/assets/fan-lareina.jpg',
  sledge: '/brawlverse/assets/fighter-sledge.jpg',
  monsoon: '/brawlverse/assets/fighter-monsoon.jpg',
  professor: '/brawlverse/assets/fighter-professor.jpg',
};

/** Human-readable move labels per locale (engine labels are zh). */
export const MOVE_LABELS: Record<Locale, Record<MoveId, string>> = {
  en: {
    jab: 'Jab',
    cross: 'Cross',
    body: 'Body shot',
    hook: 'Hook',
    uppercut: 'Uppercut',
    block: 'Block',
    dodge: 'Dodge',
    duck: 'Duck',
    feint: 'Feint',
    taunt: 'Taunt',
  },
  zh: {
    jab: '刺拳',
    cross: '直拳',
    body: '击腹',
    hook: '勾拳',
    uppercut: '上勾拳',
    block: '格挡',
    dodge: '闪避',
    duck: '下潜',
    feint: '佯攻',
    taunt: '嘲讽',
  },
};

export interface FighterEngineStats {
  aggression: number;
  feintRate: number;
  tauntRate: number;
  dodgeRate: number;
  favored: MoveId[];
}

export function engineStats(key: FighterKey): FighterEngineStats {
  const p = FIGHTERS[ENGINE_SLUG_BY_KEY[key]];
  return {
    aggression: p.aggression,
    feintRate: p.feintRate,
    tauntRate: p.tauntRate,
    dodgeRate: p.dodgeRate,
    favored: p.favored,
  };
}

/** Season 1 quarterfinals — the live /api/bouts rows (2026-11-07). */
export interface QfBout {
  id: string;
  title: string;
  fighterA: FighterKey;
  fighterB: FighterKey;
}

export const QF_BOUTS: QfBout[] = [
  {
    id: 'qf1',
    title: 'QF1 — Sample Bout',
    fighterA: 'ironJaw',
    fighterB: 'viper',
  },
  { id: 'qf2', title: 'QF2', fighterA: 'sledge', fighterB: 'monsoon' },
  { id: 'qf3', title: 'QF3', fighterA: 'volt', fighterB: 'professor' },
  { id: 'qf4', title: 'QF4', fighterA: 'goliath7', fighterB: 'laReina' },
];

export const MATCH_SLUGS = QF_BOUTS.map((b) => b.id);

export function boutForFighter(key: FighterKey): QfBout | undefined {
  return QF_BOUTS.find((b) => b.fighterA === key || b.fighterB === key);
}

export function opponentOf(bout: QfBout, key: FighterKey): FighterKey {
  return bout.fighterA === key ? bout.fighterB : bout.fighterA;
}
