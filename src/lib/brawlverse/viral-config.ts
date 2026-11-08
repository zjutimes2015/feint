/** BRAWLVERSE 裂变三机制 · 集中配置（spec §9）。
 * 全部可经 Vercel env `VIRAL_*` 覆盖，不硬编码。
 */

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const VIRAL_CONFIG = {
  /** 近失触发：用户方向窗口最高价阈值（1–99） */
  nearMissPeak: envInt('VIRAL_NEAR_MISS_PEAK', 60),
  /** 近失触发：用户方向结算价阈值（1–99） */
  nearMissFinal: envInt('VIRAL_NEAR_MISS_FINAL', 35),
  /** G2 里程碑投票阈值 */
  milestoneQf2: envInt('VIRAL_MILESTONE_QF2', 1000),
  /** 机制三：每人每天翻盘推送上限 */
  pushDailyCap: envInt('VIRAL_PUSH_DAILY_CAP', 1),
  /** 机制三：赛后推送延迟（分钟，v1 仅记录，实际推送由外部 cron 消费 viral_push_log） */
  pushDelayMin: envInt('VIRAL_PUSH_DELAY_MIN', 5),
} as const;

/** 里程碑 → 计票 bout 映射（里程碑计数=该 bout 的 votes 表行数，幂等） */
export const MILESTONE_BOUTS: Record<string, string> = {
  'qf2-trash-talk': 'qf2',
};

/** G2 里程碑默认阈值（建表 seed 用） */
export const MILESTONE_DEFAULTS: Record<string, number> = {
  'qf2-trash-talk': VIRAL_CONFIG.milestoneQf2,
};

// deploy-trigger 2026-11-04
