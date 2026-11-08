/** 订阅档位与权益。纯逻辑;支付接线在 subscription / webhooks。 */
import { qOne } from './db';

export type TierName = 'free' | 'ringside' | 'booker' | 'promoter' | 'annual';

export interface TierEntitlements {
  vote_weight: number;
  bet_max_mult: number;
  daily_mult: number;
  prop_create: boolean;
  stable_create: boolean;
  early_access: boolean;
  led_name: boolean;
  booker_night: boolean;
  fantasy: boolean;
  price_monthly: number;
}

export const TIERS: Record<TierName, TierEntitlements> = {
  free: {
    vote_weight: 1,
    bet_max_mult: 1,
    daily_mult: 1,
    prop_create: false,
    stable_create: false,
    early_access: false,
    led_name: false,
    booker_night: false,
    fantasy: true,
    price_monthly: 0,
  },
  ringside: {
    vote_weight: 3,
    bet_max_mult: 2,
    daily_mult: 2,
    prop_create: false,
    stable_create: false,
    early_access: true,
    led_name: true,
    booker_night: false,
    fantasy: true,
    price_monthly: 4.99,
  },
  booker: {
    vote_weight: 10,
    bet_max_mult: 5,
    daily_mult: 5,
    prop_create: true,
    stable_create: true,
    early_access: true,
    led_name: true,
    booker_night: false,
    fantasy: true,
    price_monthly: 14.99,
  },
  promoter: {
    vote_weight: 20,
    bet_max_mult: 10,
    daily_mult: 10,
    prop_create: true,
    stable_create: true,
    early_access: true,
    led_name: true,
    booker_night: true,
    fantasy: true,
    price_monthly: 49.0,
  },
  // 年付 $199/年,权益等同 promoter
  annual: {
    vote_weight: 20,
    bet_max_mult: 10,
    daily_mult: 10,
    prop_create: true,
    stable_create: true,
    early_access: true,
    led_name: true,
    booker_night: true,
    fantasy: true,
    price_monthly: 16.58,
  },
};

export const PAID_TIERS: TierName[] = [
  'ringside',
  'booker',
  'promoter',
  'annual',
];

export const FIGHTERS_S1 = [
  'IRON JAW',
  'VIPER',
  'SLEDGE',
  'MONSOON',
  'VOLT',
  'THE PROFESSOR',
  'GOLIATH-7',
  'LA REINA',
];

/** 有效付费档位;过期/欠费的降级为 free。identityKey 见 identity.ts。 */
export async function getTier(identityKey: string): Promise<TierName> {
  const s = await qOne<{
    tier: TierName;
    status: string;
    current_period_end: number;
  }>(
    'SELECT tier, status, current_period_end FROM subscriptions WHERE device_hash = $1',
    [identityKey]
  );
  if (!s || !PAID_TIERS.includes(s.tier)) return 'free';
  if (
    (s.status === 'canceled' || s.status === 'past_due') &&
    s.current_period_end < Date.now() / 1000
  ) {
    return 'free';
  }
  return s.tier;
}

export async function entitlements(
  identityKey: string
): Promise<TierEntitlements & { tier: TierName }> {
  const tier = await getTier(identityKey);
  return { ...TIERS[tier], tier };
}

/** 纯计分:胜=3,KO 胜=5,负=0。records: {fighter: {wins, kos}} */
export function fantasyScore(
  picks: string[],
  records: Record<string, { wins?: number; kos?: number }>
): number {
  let total = 0;
  for (const f of picks) {
    const r = records[f.toUpperCase()] || {};
    if ((r.wins || 0) > 0) total += (r.kos || 0) > 0 ? 5 : 3;
  }
  return total;
}

/** 必须正好 3 名不同的 S1 选手。 */
export function validatePicks(picks: unknown): [boolean, string] {
  if (!Array.isArray(picks) || picks.length !== 3)
    return [false, 'picks must be exactly 3 fighters'];
  const norm = picks.map((p) => String(p).trim().toUpperCase());
  if (new Set(norm).size !== 3)
    return [false, 'picks must be 3 distinct fighters'];
  const bad = norm.filter((p) => !FIGHTERS_S1.includes(p));
  if (bad.length) return [false, 'unknown fighters: ' + bad.join(',')];
  return [true, ''];
}
