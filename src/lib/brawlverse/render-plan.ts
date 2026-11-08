/**
 * Shot 级出片路由:决定每个镜头交给哪条链路生成。
 *
 * 两条链路各管一段,不是二选一:
 *   - adaptlane:纯文字 prompt 的包装镜头(冷开场/英雄镜头/赛果卡/尾卡)
 *   - action:动作库底片 + 换角色模型(真正的对打镜头)
 *
 * 关键:只有 action 镜头会引用动作库 id,包装镜头不浪费底片素材。
 * 战术分支的差异也只体现在 action 镜头引用的动作序列上。
 */
import { type ActionTactic, getActionClip, sequenceForTactic } from './actions';

export type ShotProvider = 'adaptlane' | 'action';

export type EpisodeShot = {
  index: number;
  title: string;
  seconds: number;
  prompt: string;
  /** 出片链路 */
  provider: ShotProvider;
  /** provider=action 时的动作库 id;provider=adaptlane 时为空 */
  actionId?: string;
  /** provider=action 时的战术(决定动作序列);空则用默认编排 */
  tactic?: ActionTactic;
};

export type RenderPlan = {
  week_key: string;
  shots: EpisodeShot[];
  /** 需要动作库的镜头数(用于估算与告警) */
  actionShotCount: number;
};

/** 包装镜头:不需要动作库,直接文字生成。 */
function packagingShot(
  index: number,
  title: string,
  seconds: number,
  prompt: string
): EpisodeShot {
  return { index, title, seconds, prompt, provider: 'adaptlane' };
}

/** 对打镜头:引用动作库 id,底片由 pipeline 渲染 + 换角色模型生成。 */
function actionShot(
  index: number,
  title: string,
  seconds: number,
  prompt: string,
  actionId: string,
  tactic?: ActionTactic
): EpisodeShot {
  return {
    index,
    title,
    seconds,
    prompt,
    provider: 'action',
    actionId,
    tactic,
  };
}

/**
 * 构建整集的出片计划。
 *
 * 战术只影响"对打镜头组"的内部编排:
 *   - 包装镜头保持不变(冷开场永远一样)
 *   - 对打镜头按 tactic 取动作序列,逐个落到 actionId
 * 这样投票结果真的改变了成片内容,而不是只写进一个没人看的 note。
 */
export function buildRenderPlan(
  weekKey: string,
  ctx: {
    fighterA: string;
    fighterB: string;
    ruleLeader: string;
    fanName: string;
    fanPersona: string;
    tactic: ActionTactic;
  }
): RenderPlan {
  const a = ctx.fighterA;
  const b = ctx.fighterB;
  const seq = sequenceForTactic(ctx.tactic);
  const actionShots: EpisodeShot[] = [];

  // 对打镜头组:取战术序列前 3 个动作做入场/压迫/命中三拍
  const beatTitles = ['入场压迫', '中段交锋', '决定性一击'];
  const beatSeconds = [6, 7, 5];
  for (let i = 0; i < 3 && i < seq.length; i++) {
    const clipId = seq[i];
    const clip = getActionClip(clipId);
    actionShots.push(
      actionShot(
        actionShots.length + 1,
        beatTitles[i] ?? `对打 ${i + 1}`,
        beatSeconds[i] ?? 6,
        `${a} vs ${b}，战术 ${ctx.tactic}。动作 ${clipId}` +
          (clip ? `（${clip.note}）` : '') +
          '，电影级转播光影，拳台围绳内，竖屏 9:16，无字幕无血迹。',
        clipId,
        ctx.tactic
      )
    );
  }

  const shots: EpisodeShot[] = [
    packagingShot(
      1,
      'Cold open',
      5,
      'Empty arena at night, single spotlight on the ring center, dust in the air, slow push-in, high contrast, cinematic.'
    ),
    packagingShot(
      2,
      'Fighter A intro',
      5,
      `Low angle hero shot of ${a}, sweat-lit, robe flaring, crowd bokeh behind, 35mm anamorphic look.`
    ),
    packagingShot(
      3,
      'Fighter B intro',
      5,
      `Low angle hero shot of ${b}, opposite corner, cold rim light, same lens and grade as shot 2 for continuity.`
    ),
    packagingShot(
      4,
      'Rule result card',
      4,
      `Two fighters facing off, the crowd choosing in the background; no on-screen text, implied rule vote: ${ctx.ruleLeader}.`
    ),
    packagingShot(
      5,
      'Fan Forge spotlight',
      5,
      ctx.fanName
        ? `Fan-designed contender "${ctx.fanName}" entering the arena, silhouette then face reveal matching persona: ${ctx.fanPersona}.`
        : 'Empty stool in the corner with a fan-made towel, camera orbits slowly, waiting for a name.'
    ),
    ...actionShots,
    packagingShot(
      7,
      'Next Friday card',
      4,
      'Ring bell, lights dim to navy and gold, empty ring, slow drift up, room left for a title overlay in post.'
    ),
    packagingShot(
      8,
      'Logo end card',
      3,
      'BRAWLVERSE emblem on black, subtle gold glitch, hard cut to black on the last frame.'
    ),
  ];

  // 重排 index,保证连续
  shots.forEach((s, i) => {
    s.index = i + 1;
  });

  return {
    week_key: weekKey,
    shots,
    actionShotCount: shots.filter((s) => s.provider === 'action').length,
  };
}
