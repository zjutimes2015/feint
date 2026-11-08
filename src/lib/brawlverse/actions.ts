/**
 * BRAWLVERSE 动作库(站点侧单一事实源)。
 *
 * 与 pipeline/assets/mixamo/manifest.json 保持一一对应:
 *   id      = 渲染产物名(mp4),也是这里的 clip id
 *   moveIds = 对应 arena/engine.ts 的 MoveId
 *   tactics = 对应 /api/live 的战术投票值
 *
 * 职责边界:
 *   - 这里管"哪个动作代表什么含义"(语义)
 *   - pipeline 管"这个动作长什么样"(素材)
 *   两边靠 id 对齐,id 相同即同一动作。
 */

/** 与 src/lib/arena/engine.ts 的 MoveId 一致(此处不 import,避免跨域耦合)。 */
export type ActionMoveId =
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

/** 与 /api/live 战术投票取值一致。 */
export type ActionTactic = 'heavy' | 'dodge' | 'guard' | 'rage' | 'fair';

export type ActionCategory =
  | 'stance'
  | 'movement'
  | 'strikes'
  | 'defense'
  | 'reactions'
  | 'show';

export type ActionClip = {
  /** 动作 id,也是渲染产物 mp4 的文件名(不含扩展名) */
  id: string;
  category: ActionCategory;
  /** 对应的招式 */
  moveIds: ActionMoveId[];
  /** 适用的战术 */
  tactics: ActionTactic[];
  /** 描述 */
  note: string;
  /** 是否为近似替代(Mixamo 无原动作) */
  approximate?: boolean;
};

/**
 * 动作库清单。
 * 顺序即渲染顺序,与 pipeline manifest.json 一致。
 */
export const ACTION_CLIPS: ActionClip[] = [
  {
    id: 'stance_idle_a',
    category: 'stance',
    moveIds: [],
    tactics: ['guard'],
    note: '基本格斗站架，防守/对峙起手',
  },
  {
    id: 'stance_idle_b',
    category: 'stance',
    moveIds: [],
    tactics: ['guard'],
    note: '第二站架，剪辑换手用',
  },
  {
    id: 'move_advance',
    category: 'movement',
    moveIds: [],
    tactics: ['heavy', 'rage'],
    note: '向前逼近',
  },
  {
    id: 'move_retreat',
    category: 'movement',
    moveIds: [],
    tactics: ['dodge', 'fair'],
    note: '后撤',
  },
  {
    id: 'move_circle_l',
    category: 'movement',
    moveIds: [],
    tactics: ['dodge'],
    note: '向左绕步',
  },
  {
    id: 'move_circle_r',
    category: 'movement',
    moveIds: [],
    tactics: ['heavy', 'rage'],
    note: '向右绕步',
  },
  {
    id: 'move_swagger',
    category: 'movement',
    moveIds: [],
    tactics: [],
    note: '入场 swagger 步',
  },
  {
    id: 'strike_jab',
    category: 'strikes',
    moveIds: ['jab'],
    tactics: ['heavy', 'rage'],
    note: '前手刺拳',
  },
  {
    id: 'strike_cross',
    category: 'strikes',
    moveIds: ['cross'],
    tactics: ['heavy', 'rage'],
    note: '后手直拳',
  },
  {
    id: 'strike_hook',
    category: 'strikes',
    moveIds: ['hook'],
    tactics: ['heavy', 'rage'],
    note: '勾拳（左）',
  },
  {
    id: 'strike_hook_b',
    category: 'strikes',
    moveIds: ['hook'],
    tactics: ['heavy', 'rage'],
    note: '勾拳（右，镜像版）',
  },
  {
    id: 'strike_uppercut',
    category: 'strikes',
    moveIds: ['uppercut'],
    tactics: ['heavy', 'rage'],
    note: '上勾拳',
  },
  {
    id: 'strike_body',
    category: 'strikes',
    moveIds: ['body'],
    tactics: ['heavy'],
    note: '击腹',
  },
  {
    id: 'defense_block',
    category: 'defense',
    moveIds: ['block'],
    tactics: ['guard', 'fair'],
    note: '抱架格挡',
  },
  {
    id: 'defense_dodge_r',
    category: 'defense',
    moveIds: ['dodge'],
    tactics: ['dodge'],
    note: '向右闪躲',
  },
  {
    id: 'defense_dodge_l',
    category: 'defense',
    moveIds: ['dodge'],
    tactics: ['dodge'],
    note: '向左闪躲（镜像生成）',
  },
  {
    id: 'defense_duck',
    category: 'defense',
    moveIds: ['duck'],
    tactics: ['dodge', 'fair'],
    note: '下潜躲闪',
  },
  {
    id: 'defense_clinch',
    category: 'defense',
    moveIds: ['block'],
    tactics: ['guard'],
    note: '近身缠抱（Mixamo 无此动作，用格挡近似）',
    approximate: true,
  },
  {
    id: 'react_head_hit',
    category: 'reactions',
    moveIds: [],
    tactics: [],
    note: '头部受击反应',
  },
  {
    id: 'react_body_hit',
    category: 'reactions',
    moveIds: [],
    tactics: [],
    note: '腹部受击反应',
  },
  {
    id: 'react_stagger',
    category: 'reactions',
    moveIds: [],
    tactics: [],
    note: '踉跄',
  },
  {
    id: 'react_knockdown',
    category: 'reactions',
    moveIds: [],
    tactics: [],
    note: '被击倒（近似替代，真实动作待补）',
    approximate: true,
  },
  {
    id: 'react_getup',
    category: 'reactions',
    moveIds: [],
    tactics: [],
    note: '读秒起身',
  },
  {
    id: 'react_ko',
    category: 'reactions',
    moveIds: [],
    tactics: [],
    note: 'KO 倒地不起',
  },
  {
    id: 'react_taunt',
    category: 'show',
    moveIds: ['taunt'],
    tactics: [],
    note: '挑衅',
  },
  {
    id: 'react_victory',
    category: 'show',
    moveIds: [],
    tactics: [],
    note: '胜利庆祝',
  },
  {
    id: 'react_defeat',
    category: 'show',
    moveIds: [],
    tactics: [],
    note: '战败',
  },
];

/**
 * 战术 -> 动作序列。
 * 这张表是"战术投票真的影响成片"的核心:投票结果决定播哪条底片,
 * 而底片由这里的序列剪辑而成。
 */
export const TACTIC_SEQUENCES: Record<ActionTactic, string[]> = {
  heavy: [
    'move_advance',
    'strike_jab',
    'strike_cross',
    'strike_hook',
    'strike_uppercut',
    'react_head_hit',
  ],
  rage: [
    'move_circle_r',
    'strike_jab',
    'strike_body',
    'strike_hook_b',
    'strike_uppercut',
    'react_stagger',
  ],
  dodge: [
    'move_retreat',
    'defense_dodge_l',
    'defense_dodge_r',
    'defense_duck',
    'strike_jab',
    'react_body_hit',
  ],
  guard: [
    'stance_idle_a',
    'defense_block',
    'defense_clinch',
    'move_advance',
    'strike_jab',
    'react_body_hit',
  ],
  fair: [
    'stance_idle_b',
    'move_retreat',
    'defense_block',
    'defense_duck',
    'strike_cross',
    'react_head_hit',
  ],
};

const CLIP_BY_ID = new Map(ACTION_CLIPS.map((c) => [c.id, c]));

/** 取动作定义;未知 id 返回 null。 */
export function getActionClip(id: string): ActionClip | null {
  return CLIP_BY_ID.get(id) ?? null;
}

/** 该招式对应的全部动作 id(一个招式可能有多条不同角度的素材)。 */
export function clipsForMove(moveId: ActionMoveId): string[] {
  return ACTION_CLIPS.filter((c) => c.moveIds.includes(moveId)).map(
    (c) => c.id
  );
}

/**
 * 战术对应的动作序列。
 * 未知战术回退到 guard(防守),保证任何输入都有合法底片。
 */
export function sequenceForTactic(tactic: string): string[] {
  const key = (tactic || '').toLowerCase() as ActionTactic;
  return TACTIC_SEQUENCES[key] ?? TACTIC_SEQUENCES.guard;
}

/** 动作库的底片目录(相对 pipeline 根)。 */
export const ACTION_MP4_DIR = 'assets/mixamo/mp4';
