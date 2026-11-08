/**
 * Arena 战斗引擎 v0.1 — 纯函数，无副作用，确定性。
 * 前后端可共用；随机性只出现在 AI 选招（fighters.ts），结算本身不掷骰子。
 *
 * 设计：每回合双方暗选一招同时揭示。速度决定叙事顺序，
 * 防御先结算减免。feint（佯攻）是签名机制：读穿对手防御则上 READ debuff。
 */

export type MoveId =
  | 'jab'
  | 'cross'
  | 'hook'
  | 'uppercut'
  | 'body'
  | 'block'
  | 'dodge'
  | 'duck'
  | 'feint'
  | 'taunt';

export type MoveKind = 'strike' | 'defense' | 'mind';

export interface MoveDef {
  id: MoveId;
  kind: MoveKind;
  /** 基础伤害（打击技） */
  damage: number;
  /** 速度：越大越快，决定叙事与先手 */
  speed: number;
  /** 体力消耗 */
  stamina: number;
  /** 使用时获得的人气 */
  hype: number;
  label: string;
}

export const MOVES: Record<MoveId, MoveDef> = {
  jab: {
    id: 'jab',
    kind: 'strike',
    damage: 8,
    speed: 5,
    stamina: 8,
    hype: 2,
    label: '刺拳',
  },
  cross: {
    id: 'cross',
    kind: 'strike',
    damage: 12,
    speed: 4,
    stamina: 12,
    hype: 4,
    label: '直拳',
  },
  body: {
    id: 'body',
    kind: 'strike',
    damage: 10,
    speed: 3,
    stamina: 10,
    hype: 3,
    label: '击腹',
  },
  hook: {
    id: 'hook',
    kind: 'strike',
    damage: 16,
    speed: 2,
    stamina: 16,
    hype: 6,
    label: '勾拳',
  },
  uppercut: {
    id: 'uppercut',
    kind: 'strike',
    damage: 22,
    speed: 1,
    stamina: 22,
    hype: 10,
    label: '上勾拳',
  },
  block: {
    id: 'block',
    kind: 'defense',
    damage: 0,
    speed: 6,
    stamina: 6,
    hype: 0,
    label: '格挡',
  },
  dodge: {
    id: 'dodge',
    kind: 'defense',
    damage: 0,
    speed: 6,
    stamina: 14,
    hype: 8,
    label: '闪避',
  },
  duck: {
    id: 'duck',
    kind: 'defense',
    damage: 0,
    speed: 6,
    stamina: 10,
    hype: 5,
    label: '下潜',
  },
  feint: {
    id: 'feint',
    kind: 'mind',
    damage: 0,
    speed: 7,
    stamina: 10,
    hype: 6,
    label: '佯攻',
  },
  taunt: {
    id: 'taunt',
    kind: 'mind',
    damage: 0,
    speed: 0,
    stamina: 0,
    hype: 30,
    label: '嘲讽',
  },
};

export const MOVE_IDS = Object.keys(MOVES) as MoveId[];

export function isValidMove(m: string): m is MoveId {
  return (Object.keys(MOVES) as string[]).includes(m);
}

export interface FighterState {
  hp: number;
  stamina: number;
  hype: number;
  /** 被读穿：下次受击 +50%，且不可闪避（闪避按格挡算） */
  read: boolean;
}

export function initialState(): FighterState {
  return { hp: 100, stamina: 100, hype: 0, read: false };
}

export interface RoundResult {
  /** 中文解说句，按叙事顺序 */
  events: string[];
  stateA: FighterState;
  stateB: FighterState;
  /** 本回合是否有人倒下 */
  ko: 'A' | 'B' | 'draw' | null;
  /** 终结技是否触发（A/B） */
  finisher: ('A' | 'B')[];
  /** 实际造成的伤害（用于前端特效） */
  damageToA: number;
  damageToB: number;
}

const FINISHER_DAMAGE = 35;
const STAMINA_REGEN = 15;
const MAX_HP = 100;
const MAX_STAMINA = 100;
const MAX_HYPE = 100;

/** 高位重拳：可被下潜躲掉 */
function isHighStrike(m: MoveDef): boolean {
  return m.id === 'hook' || m.id === 'uppercut';
}
/** 慢招：可被闪避完全躲掉 */
function isSlowStrike(m: MoveDef): boolean {
  return m.speed <= 2;
}

interface ResolveCtx {
  atk: FighterState;
  def: FighterState;
  atkMove: MoveDef;
  defMove: MoveDef;
  atkName: string;
  defName: string;
  atkTag: 'A' | 'B';
}

/**
 * 打击技 vs 防御/心理 招式的结算。返回对 def 造成的伤害与解说。
 * 会读写 atk/def 的 hype 与 read（通过引用）。
 */
function strikeAgainst(ctx: ResolveCtx): { damage: number; lines: string[] } {
  const { atk, def, atkMove, defMove, atkName, defName } = ctx;
  const lines: string[] = [];
  let damage = atkMove.damage;

  // 终结技：人气满格时下一次打击技自动升级
  let finisher = false;
  if (atk.hype >= MAX_HYPE) {
    damage = FINISHER_DAMAGE;
    atk.hype = 0;
    finisher = true;
    lines.push(`🔥 ${atkName} 人气爆棚——终结技「${atkMove.label}」！`);
  }

  // READ debuff：+50% 伤害，不可闪避
  const readBonus = def.read;
  if (readBonus) {
    damage = Math.round(damage * 1.5);
    def.read = false; // 消费掉
  }

  switch (defMove.kind) {
    case 'defense': {
      if (defMove.id === 'block') {
        const reduced = Math.round(damage * 0.3);
        lines.push(
          `${defName} 格挡住了${atkMove.label}，只受到 ${reduced} 点伤害` +
            (readBonus ? '（被读穿，格挡形同虚设！）' : '')
        );
        return { damage: reduced, lines };
      }
      if (defMove.id === 'dodge') {
        if (readBonus) {
          const reduced = Math.round(damage * 0.3);
          lines.push(
            `${defName} 想闪避但被读穿了！闪避失败，只减免到 ${reduced} 点`
          );
          return { damage: reduced, lines };
        }
        if (isSlowStrike(atkMove)) {
          lines.push(
            `${defName} 一个漂亮闪避，${atkMove.label} 挥空了！全场欢呼`
          );
          return { damage: 0, lines };
        }
        const reduced = Math.round(damage * 0.5);
        lines.push(`${defName} 闪避不及，还是吃了 ${reduced} 点伤害`);
        return { damage: reduced, lines };
      }
      // duck
      if (isHighStrike(atkMove)) {
        lines.push(`${defName} 下潜躲过${atkMove.label}！`);
        return { damage: 0, lines };
      }
      lines.push(
        `${defName} 下潜了，但${atkMove.label}是低位招式，照单全收 ${damage} 点`
      );
      return { damage, lines };
    }
    case 'mind': {
      if (defMove.id === 'taunt') {
        const doubled = damage * 2;
        lines.push(
          `💥 ${defName} 嘲讽中被${atkMove.label}结结实实命中！双倍伤害 ${doubled} 点` +
            (finisher ? '（终结技）' : '')
        );
        return { damage: doubled, lines };
      }
      // def 在 feint：佯攻没有防御能力
      lines.push(
        `${atkName} 的${atkMove.label}命中了正在虚晃的${defName}，${damage} 点` +
          (readBonus ? '（读穿加成！）' : '') +
          (finisher ? '（终结技）' : '')
      );
      return { damage, lines };
    }
    default: {
      // def 也在出招：互殴，本函数只算 atk 这一拳
      lines.push(
        `${atkName} 的${atkMove.label}命中${defName}，${damage} 点` +
          (readBonus ? '（读穿加成！）' : '') +
          (finisher ? '（终结技）' : '')
      );
      return { damage, lines };
    }
  }
}

/**
 * 结算一回合。stateA/stateB 会被复制，不会 mutate 入参。
 */
export function resolveRound(
  prevA: FighterState,
  prevB: FighterState,
  moveA: MoveId,
  moveB: MoveId,
  nameA: string,
  nameB: string
): RoundResult {
  const A: FighterState = { ...prevA };
  const B: FighterState = { ...prevB };
  const mA = MOVES[moveA];
  const mB = MOVES[moveB];
  const events: string[] = [];
  const finisher: ('A' | 'B')[] = [];
  let damageToA = 0;
  let damageToB = 0;

  // 体力检查：不够则招式失败
  let effA = mA;
  let effB = mB;
  if (A.stamina < mA.stamina) {
    events.push(`😮‍💨 ${nameA} 体力不支，${mA.label} 没使出来！`);
    effA = { ...mA, kind: 'mind', damage: 0, hype: 0 } as MoveDef;
  }
  if (B.stamina < mB.stamina) {
    events.push(`😮‍💨 ${nameB} 体力不支，${mB.label} 没使出来！`);
    effB = { ...mB, kind: 'mind', damage: 0, hype: 0 } as MoveDef;
  }
  A.stamina = Math.max(0, A.stamina - mA.stamina);
  B.stamina = Math.max(0, B.stamina - mB.stamina);

  const aIsStrike = effA.kind === 'strike';
  const bIsStrike = effB.kind === 'strike';

  // --- 佯攻先结算（速度最快，心理战） ---
  if (effA.id === 'feint' || effB.id === 'feint') {
    if (effA.id === 'feint' && effB.id === 'feint') {
      A.hype = Math.min(MAX_HYPE, A.hype + 6);
      B.hype = Math.min(MAX_HYPE, B.hype + 6);
      events.push('👁️ 双方同时虚晃！空气凝固了，观众屏住呼吸');
    } else if (effA.id === 'feint') {
      if (effB.kind === 'defense') {
        B.read = true;
        A.hype = Math.min(MAX_HYPE, A.hype + 6);
        events.push(
          `🎭 ${nameA} 佯攻得手！${nameB} 被彻底读穿，下次受击 +50% 且不可闪避`
        );
      } else if (bIsStrike) {
        // B 的打击由下面的互殴/打击逻辑处理，这里只记佯攻失败
        events.push(`🎭 ${nameA} 佯攻被${nameB}识破，${effB.label} 已经到了！`);
      } else {
        // B 在嘲讽
        B.hype = Math.min(MAX_HYPE, B.hype + 30);
        A.hype = Math.min(MAX_HYPE, A.hype + 6);
        events.push(`${nameA} 虚晃，${nameB} 趁机嘲讽，人气 +30`);
      }
    } else {
      // effB.id === 'feint'
      if (effA.kind === 'defense') {
        A.read = true;
        B.hype = Math.min(MAX_HYPE, B.hype + 6);
        events.push(
          `🎭 ${nameB} 佯攻得手！${nameA} 被彻底读穿，下次受击 +50% 且不可闪避`
        );
      } else if (aIsStrike) {
        events.push(`🎭 ${nameB} 佯攻被${nameA}识破，${effA.label} 已经到了！`);
      } else {
        A.hype = Math.min(MAX_HYPE, A.hype + 30);
        B.hype = Math.min(MAX_HYPE, B.hype + 6);
        events.push(`${nameB} 虚晃，${nameA} 趁机嘲讽，人气 +30`);
      }
    }
  }

  // --- 嘲讽结算（非佯攻回合的人气） ---
  if (effA.id === 'taunt' && effB.id !== 'feint') {
    A.hype = Math.min(MAX_HYPE, A.hype + 30);
    events.push(`📣 ${nameA} 嘲讽！人气 +30（${A.hype}/100）`);
  }
  if (effB.id === 'taunt' && effA.id !== 'feint') {
    B.hype = Math.min(MAX_HYPE, B.hype + 30);
    events.push(`📣 ${nameB} 嘲讽！人气 +30（${B.hype}/100）`);
  }

  // --- 打击结算：按速度决定叙事顺序，先手 KO 则后手打不出 ---
  const strikes: { tag: 'A' | 'B'; move: MoveDef }[] = [];
  if (aIsStrike) strikes.push({ tag: 'A', move: effA });
  if (bIsStrike) strikes.push({ tag: 'B', move: effB });
  strikes.sort((x, y) => y.move.speed - x.move.speed);

  for (const s of strikes) {
    if (s.tag === 'A') {
      if (B.hp <= 0) break;
      const wasFinisher = A.hype >= MAX_HYPE;
      const r = strikeAgainst({
        atk: A,
        def: B,
        atkMove: s.move,
        defMove: effB,
        atkName: nameA,
        defName: nameB,
        atkTag: 'A',
      });
      if (wasFinisher) finisher.push('A');
      damageToB += r.damage;
      B.hp = Math.max(0, B.hp - r.damage);
      // 命中涨人气
      A.hype = Math.min(MAX_HYPE, A.hype + s.move.hype);
      events.push(...r.lines);
    } else {
      if (A.hp <= 0) break;
      const wasFinisher = B.hype >= MAX_HYPE;
      const r = strikeAgainst({
        atk: B,
        def: A,
        atkMove: s.move,
        defMove: effA,
        atkName: nameB,
        defName: nameA,
        atkTag: 'B',
      });
      if (wasFinisher) finisher.push('B');
      damageToA += r.damage;
      A.hp = Math.max(0, A.hp - r.damage);
      B.hype = Math.min(MAX_HYPE, B.hype + s.move.hype);
      events.push(...r.lines);
    }
  }

  // 防御/闪避成功的人气（dodge/duck 自带 hype 在出招时加）
  if (effA.id === 'dodge' || effA.id === 'duck') {
    A.hype = Math.min(MAX_HYPE, A.hype + effA.hype);
  }
  if (effB.id === 'dodge' || effB.id === 'duck') {
    B.hype = Math.min(MAX_HYPE, B.hype + effB.hype);
  }

  // 体力回复
  A.stamina = Math.min(MAX_STAMINA, A.stamina + STAMINA_REGEN);
  B.stamina = Math.min(MAX_STAMINA, B.stamina + STAMINA_REGEN);

  // KO 判定
  let ko: RoundResult['ko'] = null;
  if (A.hp <= 0 && B.hp <= 0) ko = 'draw';
  else if (B.hp <= 0) ko = 'A';
  else if (A.hp <= 0) ko = 'B';
  if (ko === 'A') events.push(`💥 KO！${nameA} 终结了${nameB}！`);
  else if (ko === 'B') events.push(`💥 KO！${nameB} 终结了${nameA}！`);
  else if (ko === 'draw') events.push('💥 双双倒地！平局！');

  return {
    events,
    stateA: A,
    stateB: B,
    ko,
    finisher,
    damageToA,
    damageToB,
  };
}

/** 回合上限：15 回合未 KO 则按剩余 HP 判胜负 */
export const MAX_ROUNDS = 15;
