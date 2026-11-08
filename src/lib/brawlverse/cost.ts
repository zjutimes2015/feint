/**
 * 单集成本策略(P2-8)。
 *
 * 成本 = 秒数 × $0.08/s(720p 换角)。一集 3 分钟满配 ≈ $24。
 * 所以必须能"降级":镜头数、分辨率、重跑次数三根旋钮,而不是只有一个开关。
 *
 * 档位:
 *   full     40 镜 / 1080p / 重跑 3 次  —— 主打集、季初、季终
 *   standard 30 镜 / 720p / 重跑 2 次   —— 常规周更(默认)
 *   lean     20 镜 / 540p / 重跑 1 次   —— 预算吃紧或内容试水
 *
 * 环境变量 HOOK_COST_PROFILE 控制当前档位;MONTHLY_BUDGET_USD 设置月度上限。
 */

export type CostProfileName = 'full' | 'standard' | 'lean';

export type CostProfile = {
  shots: number;
  resolution: '1080p' | '720p' | '540p';
  retries: number;
  /** 预估每分钟成片成本(美元,720p 基准) */
  usd_per_minute: number;
};

/** Replicate wan-2.2-animate-replace 720p 单价 */
export const USD_PER_SECOND_720P = 0.08;

export const COST_PROFILES: Record<CostProfileName, CostProfile> = {
  full: { shots: 40, resolution: '1080p', retries: 3, usd_per_minute: 7.2 },
  standard: { shots: 30, resolution: '720p', retries: 2, usd_per_minute: 4.8 },
  lean: { shots: 20, resolution: '540p', retries: 1, usd_per_minute: 3.0 },
};

export function costProfile(): CostProfileName {
  const raw = String(process.env.HOOK_COST_PROFILE || '').toLowerCase();
  return raw === 'full' || raw === 'lean' ? raw : 'standard';
}

/** 按时长估算成本(美元),用于提交前拦截超预算。 */
export function estimateCost(seconds: number, name = costProfile()): number {
  const p = COST_PROFILES[name];
  // 1080p 相对 720p 约 ×1.6;540p 约 ×0.6
  const scale =
    p.resolution === '1080p' ? 1.6 : p.resolution === '540p' ? 0.6 : 1;
  return Math.round(seconds * USD_PER_SECOND_720P * scale * 100) / 100;
}

/** 月度预算上限(美元);0 表示不限制。 */
export function monthlyBudget(): number {
  return Number(process.env.MONTHLY_BUDGET_USD || 0) || 0;
}

/** 提交前预算闸门:超上限就降级,而不是硬着头皮烧钱。 */
export function pickProfileFor(seconds: number): {
  profile: CostProfileName;
  estimate_usd: number;
  within_budget: boolean;
} {
  const budget = monthlyBudget();
  const order: CostProfileName[] = ['full', 'standard', 'lean'];
  const start = order.indexOf(costProfile());
  for (const name of order.slice(start)) {
    const est = estimateCost(seconds, name);
    if (!budget || est <= budget) {
      return { profile: name, estimate_usd: est, within_budget: true };
    }
  }
  const est = estimateCost(seconds, 'lean');
  return {
    profile: 'lean',
    estimate_usd: est,
    within_budget: !budget || est <= budget,
  };
}
