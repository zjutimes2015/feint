/**
 * 固定档期(P1-5):每周五 21:00(UTC+8)开赛,即周五 13:00Z。
 * "等下一集"要成立,时间必须可预测——所有页面读同一个函数,不各算各的。
 */

/** 0=周日 … 5=周五 */
export const FIGHT_NIGHT_WEEKDAY_UTC = 5;
/** 21:00 UTC+8 = 13:00 UTC */
export const FIGHT_NIGHT_HOUR_UTC = 13;

/** 下一个(或当前未过点的)开赛时间。 */
export function nextFightNight(now: Date = new Date()): Date {
  const t = now.getTime();
  const day = now.getUTCDay();
  let delta = (FIGHT_NIGHT_WEEKDAY_UTC - day + 7) % 7;
  let cand = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + delta,
      FIGHT_NIGHT_HOUR_UTC,
      0,
      0
    )
  );
  if (cand.getTime() <= t) {
    delta += 7;
    cand = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + delta,
        FIGHT_NIGHT_HOUR_UTC,
        0,
        0
      )
    );
  }
  return cand;
}

/** 距下一场还有多少秒。 */
export function secondsToNextFightNight(now: Date = new Date()): number {
  return Math.max(
    0,
    Math.trunc((nextFightNight(now).getTime() - now.getTime()) / 1000)
  );
}

/** 统一的档期描述:ISO 时间 + 人类可读的固定口径。 */
export function fightNightInfo(now: Date = new Date()) {
  const next = nextFightNight(now);
  return {
    every: 'FRI 21:00 UTC+8',
    next_at: next.toISOString(),
    seconds_left: Math.max(
      0,
      Math.trunc((next.getTime() - now.getTime()) / 1000)
    ),
  };
}
