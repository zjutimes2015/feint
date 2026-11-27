/**
 * Arena 确定性随机 —— 每日同题 / 异步挑战的底座。
 *
 * 规则：同一 seed + 同一回合数，永远产出同一串 AI 决策。
 * 所以「每日全球同题」和「朋友打同一个 AI 种子」在服务端可以完全复现。
 * 只在服务端使用（makeCode 依赖 node:crypto）。
 */
import crypto from 'node:crypto';
import { FIGHTER_SLUGS } from './fighters';

/** FNV-1a：字符串 → 32 位无符号整数，跨进程稳定。 */
export function hashToInt(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32：极小、够好用的 seeded PRNG。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 每回合一条独立随机流：seed 相同则第 n 回合永远一致。 */
export function roundRng(seed: number, roundNo: number): () => number {
  return mulberry32(hashToInt(`${seed}:${roundNo}`));
}

/** UTC 日期键（YYYY-MM-DD），全世界共享同一个「今天」。 */
export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** 一局的初始状态（残局：双方带伤上场）。 */
export interface MatchStart {
  hp_a: number;
  hp_b: number;
  stamina_a: number;
  stamina_b: number;
  hype_a: number;
  hype_b: number;
}

export function fullStart(): MatchStart {
  return {
    hp_a: 100,
    hp_b: 100,
    stamina_a: 100,
    stamina_b: 100,
    hype_a: 0,
    hype_b: 0,
  };
}

export interface DailyScenario {
  day_key: string;
  seed: number;
  fighter_a: string;
  fighter_b: string;
  start: MatchStart;
}

/**
 * 当日同题：日期决定拳手组合、初始血量/人气与 AI 种子。
 * 不用客户端任何输入，因此全球玩家拿到的是同一道残局。
 */
export function dailyScenario(key = dayKey()): DailyScenario {
  const seed = hashToInt(`daily:${key}`);
  const r = mulberry32(seed);
  const pool = FIGHTER_SLUGS;
  const ia = Math.floor(r() * pool.length);
  let ib = Math.floor(r() * pool.length);
  if (ib === ia) ib = (ib + 1) % pool.length;
  return {
    day_key: key,
    seed,
    fighter_a: pool[ia],
    fighter_b: pool[ib],
    start: {
      // 残局：55-74 血，3-6 回合就能分出胜负，适合每天一把
      hp_a: 55 + Math.floor(r() * 20),
      hp_b: 55 + Math.floor(r() * 20),
      stamina_a: 100,
      stamina_b: 100,
      hype_a: Math.floor(r() * 30),
      hype_b: Math.floor(r() * 30),
    },
  };
}

/** 解析 arena_matches.scenario_json / 挑战行里的初始状态。 */
export function parseStart(json: string | null | undefined): MatchStart {
  const base = fullStart();
  if (!json) return base;
  try {
    const raw = JSON.parse(json) as Partial<MatchStart>;
    const pick = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(0, Math.min(100, Math.round(v)))
        : fallback;
    return {
      hp_a: pick(raw.hp_a, base.hp_a),
      hp_b: pick(raw.hp_b, base.hp_b),
      stamina_a: pick(raw.stamina_a, base.stamina_a),
      stamina_b: pick(raw.stamina_b, base.stamina_b),
      hype_a: pick(raw.hype_a, base.hype_a),
      hype_b: pick(raw.hype_b, base.hype_b),
    };
  } catch {
    return base;
  }
}

/** 随机新种子。SECURE 范围内，方便存 INTEGER/BIGINT。 */
export function randomSeed(): number {
  return crypto.randomInt(1, 2147483647);
}

// 去掉易混淆字符（0/O、1/I），方便口头/截图传播
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 生成 6 位挑战码。 */
export function makeCode(len = 6): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** 归一化用户输入的挑战码（大小写、空格、连字符容错）。 */
export function normalizeCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}
