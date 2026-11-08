import { describe, expect, it } from 'vitest';
import {
  ACTION_CLIPS,
  clipsForMove,
  getActionClip,
  sequenceForTactic,
  TACTIC_SEQUENCES,
} from '@/lib/brawlverse/actions';
import { buildRenderPlan } from '@/lib/brawlverse/render-plan';

describe('动作库清单', () => {
  it('每个 clip 的 moveIds 都能在 arena 招式表里找到', () => {
    // src/lib/arena/engine.ts 的 MoveId 全集
    const valid = new Set([
      'jab',
      'cross',
      'hook',
      'uppercut',
      'body',
      'block',
      'dodge',
      'duck',
      'feint',
      'taunt',
    ]);
    for (const c of ACTION_CLIPS) {
      for (const m of c.moveIds) {
        expect(valid.has(m), `${c.id} 引用了未知招式 ${m}`).toBe(true);
      }
    }
  });

  it('clip id 唯一', () => {
    const ids = ACTION_CLIPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个招式至少有一个动作素材', () => {
    for (const m of [
      'jab',
      'cross',
      'hook',
      'uppercut',
      'body',
      'block',
      'dodge',
    ]) {
      expect(clipsForMove(m as 'jab').length).toBeGreaterThan(0);
    }
  });

  it('getActionClip 未知 id 返回 null', () => {
    expect(getActionClip('nope')).toBeNull();
    expect(getActionClip('strike_jab')?.category).toBe('strikes');
  });
});

describe('战术动作序列', () => {
  it('每个战术都有非空序列', () => {
    for (const seq of Object.values(TACTIC_SEQUENCES)) {
      expect(seq.length).toBeGreaterThan(0);
    }
  });

  it('序列里每个 id 都是真实存在的 clip', () => {
    for (const [tactic, seq] of Object.entries(TACTIC_SEQUENCES)) {
      for (const id of seq) {
        expect(
          getActionClip(id),
          `${tactic} 引用了不存在的 ${id}`
        ).not.toBeNull();
      }
    }
  });

  it('不同战术的序列不同 —— 战术投票才有意义', () => {
    const seqs = Object.values(TACTIC_SEQUENCES).map((s) => s.join(','));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('未知战术回退到 guard,不返回空', () => {
    expect(sequenceForTactic('nonsense')).toEqual(TACTIC_SEQUENCES.guard);
    expect(sequenceForTactic('')).toEqual(TACTIC_SEQUENCES.guard);
  });
});

describe('buildRenderPlan', () => {
  const ctx = {
    fighterA: 'IRON JAW',
    fighterB: 'VIPER',
    ruleLeader: 'RAGE 60%',
    fanName: 'TURBO GRANNY',
    fanPersona: '退役宇航员',
    tactic: 'heavy' as const,
  };

  it('镜头 index 连续,包装镜头 7 个 + 对打镜头 3 个', () => {
    const plan = buildRenderPlan('2026-W45', ctx);
    expect(plan.shots.length).toBe(10);
    expect(plan.shots.filter((s) => s.provider === 'adaptlane').length).toBe(7);
    expect(plan.shots.filter((s) => s.provider === 'action').length).toBe(3);
    expect(plan.shots.map((s) => s.index)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('对打镜头引用动作库 id,包装镜头不引用', () => {
    const plan = buildRenderPlan('2026-W45', ctx);
    for (const s of plan.shots) {
      if (s.provider === 'action') {
        expect(s.actionId).toBeTruthy();
        expect(getActionClip(s.actionId as string)).not.toBeNull();
      } else {
        expect(s.actionId).toBeUndefined();
      }
    }
    expect(plan.actionShotCount).toBeGreaterThan(0);
  });

  it('换战术会换掉对打镜头引用的动作', () => {
    const a = buildRenderPlan('2026-W45', { ...ctx, tactic: 'heavy' });
    const b = buildRenderPlan('2026-W45', { ...ctx, tactic: 'dodge' });
    const idsA = a.shots
      .filter((s) => s.provider === 'action')
      .map((s) => s.actionId);
    const idsB = b.shots
      .filter((s) => s.provider === 'action')
      .map((s) => s.actionId);
    expect(idsA).not.toEqual(idsB);
  });

  it('包装镜头在换战术时保持不变', () => {
    const a = buildRenderPlan('2026-W45', { ...ctx, tactic: 'heavy' });
    const b = buildRenderPlan('2026-W45', { ...ctx, tactic: 'dodge' });
    const packA = a.shots.filter((s) => s.provider === 'adaptlane');
    const packB = b.shots.filter((s) => s.provider === 'adaptlane');
    expect(packA.map((s) => s.prompt)).toEqual(packB.map((s) => s.prompt));
  });
});
