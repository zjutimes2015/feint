/**
 * 选手战绩（wins/losses/kos）读写。
 * 从 betting.ts 拆出：战绩是内容与 Arena 共用的数据，不属于赌博层。
 */
import { qWrite } from './db';

export async function bumpRecord(
  fighter: string,
  won: boolean,
  ko: boolean
): Promise<void> {
  const now = Date.now() / 1000;
  const w = won ? 1 : 0;
  const l = won ? 0 : 1;
  const k = won && ko ? 1 : 0;
  await qWrite(
    `INSERT INTO fighter_records (fighter, wins, losses, kos, updated_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (fighter) DO UPDATE SET
       wins = fighter_records.wins + $6,
       losses = fighter_records.losses + $7,
       kos = fighter_records.kos + $8,
       updated_at = $9`,
    [fighter, w, l, k, now, w, l, k, now]
  );
}
