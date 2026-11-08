/**
 * 周更成片 Brief:把"这一周拳迷真正做了什么"压成可直接交给出片管线的镜头脚本。
 * 纯读库,不调模型,同一 week_key 结果稳定。
 *
 * 关键:对打镜头不是文字描述,而是引用动作库 id(action_id) + 战术。
 * 战术来自上周投票倾向(投票回流),所以观众的选择真的改变下一集画面。
 */
import { type ActionTactic, sequenceForTactic } from './actions';
import { qAll, qOne } from './db';
import { buildRenderPlan, type EpisodeShot } from './render-plan';

const SHOW = 'brawlverse';
// 首页常驻 exhibition 规则投票(rage/fair)
const RULE_BOUT = 'ex1';
const FORGE_LIMIT = 5;

export type BriefTally = Record<string, number>;

export type BriefShot = EpisodeShot & {
  index: number;
  title: string;
  seconds: number;
  prompt: string;
};

export type EpisodeBrief = {
  week_key: string;
  show: string;
  air_at: string;
  generated_at: number;
  bout: {
    id: string;
    title: string;
    fighter_a: string;
    fighter_b: string;
    round_no: number;
  } | null;
  rule: {
    tally: BriefTally;
    total: number;
    leader: string;
    leader_pct: number;
  } | null;
  live: {
    round_no: number;
    tactic_a: string;
    tactic_b: string;
    state: string;
    winning_branch: string;
    total: number;
  } | null;
  forge: { name: string; persona: string; votes: number }[];
  /** 本集采用的战术(来自上周投票倾向) */
  tactic: ActionTactic;
  shots: BriefShot[];
  prompt: string;
};

type BoutRow = {
  id: string;
  title: string;
  fighter_a: string;
  fighter_b: string;
  round_no: number;
};

type LiveRow = {
  bout_id: string;
  round_no: number;
  tactic_a: string;
  tactic_b: string;
  state: string;
  winning_branch: string;
};

/** ISO 周键,例 2026-W45(以 UTC 计算,周一为一周起点)。 */
export function weekKeyOf(date = new Date()): string {
  const t = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = t.getDay() || 7;
  // 移到本周周四,用它所在年份判断跨年周
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** 该周的直播时间:周五 21:00 (UTC+8) = 周五 13:00Z。 */
export function airAtOfWeek(weekKey: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return '';
  const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
  const jan4Day = jan4.getDay() || 7;
  // jan4 所在周的周一 + (week-1) 周 + 4 天 = 周五
  const monday =
    jan4.getTime() -
    (jan4Day - 1) * 86400000 +
    (Number(m[2]) - 1) * 7 * 86400000;
  const friday13 = new Date(monday + 4 * 86400000 + 13 * 3600000);
  return friday13.toISOString();
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

async function tallyOf(boutId: string, roundNo: number): Promise<BriefTally> {
  const rows = await qAll<{ choice: string; n: string | null }>(
    `SELECT choice, SUM(weight) AS n FROM votes
     WHERE bout_id = $1 AND round_no = $2 GROUP BY choice`,
    [boutId, roundNo]
  );
  const out: BriefTally = {};
  for (const r of rows) out[r.choice] = Number(r.n || 0);
  return out;
}

async function pickBout(boutId: string): Promise<BoutRow | null> {
  const cols = 'id, title, fighter_a, fighter_b, round_no';
  if (boutId) {
    const hit = await qOne<BoutRow>(`SELECT ${cols} FROM bouts WHERE id = $1`, [
      boutId,
    ]);
    if (hit) return hit;
  }
  return qOne<BoutRow>(
    `SELECT ${cols} FROM bouts ORDER BY created_at DESC LIMIT 1`
  );
}

/** 合法战术集合,防御式:库里可能出现任意文本。 */
function asTactic(raw: string | undefined | null): ActionTactic | null {
  const v = (raw || '').toLowerCase();
  if (
    v === 'heavy' ||
    v === 'dodge' ||
    v === 'guard' ||
    v === 'rage' ||
    v === 'fair'
  ) {
    return v;
  }
  return null;
}

/**
 * 决定本集战术:
 * 1) 上一场直播投票的胜出战术(投票回流)
 * 2) 上周规则投票的领先项
 * 3) 兜底 guard
 */
async function resolveTactic(live: LiveRow | null): Promise<ActionTactic> {
  if (live) {
    const tally = await tallyOf(live.bout_id, live.round_no);
    const entries = Object.entries(tally).sort((x, y) => y[1] - x[1]);
    if (entries.length > 0) {
      const top = asTactic(entries[0][0]);
      if (top) return top;
    }
  }
  const rule = await tallyOf(RULE_BOUT, 1);
  const ruleTop = Object.entries(rule).sort((x, y) => y[1] - x[1])[0];
  const fromRule = asTactic(ruleTop?.[0]);
  return fromRule ?? 'guard';
}

function buildPrompt(
  brief: Omit<EpisodeBrief, 'shots' | 'prompt'>,
  shots: EpisodeShot[]
): string {
  const lines = shots.map((s) => {
    const head = `SHOT ${s.index} (${s.seconds}s) — ${s.title} [${s.provider}]`;
    const ref = s.actionId ? ` action=${s.actionId}` : '';
    return `${head}${ref}\n${s.prompt}`;
  });
  const header = [
    `# BRAWLVERSE — Friday Fight Night (${brief.week_key})`,
    `Air: ${brief.air_at}`,
    `Tactic: ${brief.tactic}`,
    'Format: vertical 9:16, 24fps, locked character sheets,',
    'no on-screen text except the end card, no blood, no logos besides ours.',
    'provider=adaptlane → text-to-video shot.',
    'provider=action → Mixamo clip底片 + 角色换装,必须使用指定 action.',
  ].join('\n');

  return `${header}\n\n${lines.join('\n\n')}`;
}

/** 组装一周 Brief。数据缺失时字段为 null,不抛错。 */
export async function buildBrief(weekKey: string): Promise<EpisodeBrief> {
  const latest = await qOne<LiveRow>(
    `SELECT bout_id, round_no, tactic_a, tactic_b, state, winning_branch
     FROM live_rounds ORDER BY created_at DESC LIMIT 1`
  );
  const bout = await pickBout(latest?.bout_id ?? '');

  const ruleTally = await tallyOf(RULE_BOUT, 1);
  const ruleTotal = Object.values(ruleTally).reduce((s, n) => s + n, 0);
  const ruleLeader = Object.entries(ruleTally).sort((x, y) => y[1] - x[1])[0];

  const liveTally = latest
    ? await tallyOf(latest.bout_id, latest.round_no)
    : {};

  const forge = await qAll<{ name: string; persona: string; votes: number }>(
    `SELECT name, persona, votes FROM fan_forge_submissions
     WHERE status = 'queued' ORDER BY votes DESC, created_at DESC LIMIT $1`,
    [FORGE_LIMIT]
  );

  const tactic = await resolveTactic(latest);

  const base: Omit<EpisodeBrief, 'shots' | 'prompt'> = {
    week_key: weekKey,
    show: SHOW,
    air_at: airAtOfWeek(weekKey),
    generated_at: Math.trunc(Date.now() / 1000),
    bout,
    rule:
      ruleTotal > 0 && ruleLeader
        ? {
            tally: ruleTally,
            total: ruleTotal,
            leader: ruleLeader[0],
            leader_pct: pct(ruleLeader[1], ruleTotal),
          }
        : null,
    live: latest
      ? {
          round_no: latest.round_no,
          tactic_a: latest.tactic_a,
          tactic_b: latest.tactic_b,
          state: latest.state,
          winning_branch: latest.winning_branch,
          total: Object.values(liveTally).reduce((s, n) => s + n, 0),
        }
      : null,
    forge,
    tactic,
  };

  const plan = buildRenderPlan(weekKey, {
    fighterA: base.bout?.fighter_a || 'CHALLENGER A',
    fighterB: base.bout?.fighter_b || 'CHALLENGER B',
    ruleLeader: base.rule?.leader
      ? `${base.rule.leader.toUpperCase()} ${base.rule.leader_pct}%`
      : 'TIED',
    fanName: base.forge[0]?.name || '',
    fanPersona: base.forge[0]?.persona || '',
    tactic,
  });

  const shots = plan.shots;
  const prompt = buildPrompt(base, shots);
  return { ...base, shots, prompt };
}

/** 本集对打镜头用的动作序列(便于 admin 查看与校验)。 */
export function briefActionSequence(tactic: string): string[] {
  return sequenceForTactic(tactic);
}
