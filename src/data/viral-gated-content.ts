/** BRAWLVERSE 裂变三机制 · Gated 内容元数据 + G1 八篇背景故事正文（spec §7）。
 * 纯数据文件，无服务端依赖，前后端可共用。
 */

export type GatedType = 'share' | 'milestone' | 'tier' | 'achievement';

export interface GatedItem {
  contentId: string;
  type: GatedType;
  /** i18n key 前缀（Brawlverse.viral.gated.<key>.*） */
  i18nKey: string;
  title: string;
  /** share-gated 文案中的 [Fighter] 占位主体，无则 null */
  fighterSlug: string | null;
  milestoneId: string | null;
  /** tier-gated 所需最低档 */
  minTier: 'booker' | null;
}

export const BACKSTORY_TITLES: Record<string, string> = {
  iron_jaw: 'The Chin That Refused to Crack',
  viper: 'The Counter Nobody Sees Coming',
  sledge: 'Hands That Play Chopin',
  monsoon: "You Can't Knock Out the Rain",
  volt: 'The Fastest Hands in the Building',
  the_professor: "He's Already Seen This Fight",
  la_reina: 'Precision Is a Love Language',
  'goliath-7': "The Gentle Giant's Terrible Secret",
};

export const BACKSTORY_FIGHTER_NAMES: Record<string, string> = {
  iron_jaw: 'Iron Jaw',
  viper: 'Viper',
  sledge: 'Sledge',
  monsoon: 'Monsoon',
  volt: 'Volt',
  the_professor: 'The Professor',
  la_reina: 'La Reina',
  'goliath-7': 'Goliath-7',
};

export const GATED_CONTENT: GatedItem[] = [
  // G1 × 8（share-gated）
  ...(
    [
      'iron_jaw',
      'viper',
      'sledge',
      'monsoon',
      'volt',
      'the_professor',
      'la_reina',
      'goliath-7',
    ] as const
  ).map((slug) => ({
    contentId: `backstory:${slug}`,
    type: 'share' as const,
    i18nKey: `backstory_${slug}`,
    title: BACKSTORY_TITLES[slug],
    fighterSlug: slug,
    milestoneId: null,
    minTier: null,
  })),
  // G2（milestone-gated）
  {
    contentId: 'video:qf2-trash-talk',
    type: 'milestone',
    i18nKey: 'video_qf2_trash_talk',
    title: 'QF2 Trash-Talk Tape',
    fighterSlug: null,
    milestoneId: 'qf2-trash-talk',
    minTier: null,
  },
  // G3（tier-gated，P1；音频占位，TTS 生成后填 url）
  {
    contentId: 'audio:locker-viper',
    type: 'tier',
    i18nKey: 'audio_locker_viper',
    title: 'Locker Room: Viper',
    fighterSlug: 'viper',
    milestoneId: null,
    minTier: 'booker',
  },
  // G4（achievement，自动发放，前端展示用）
  {
    contentId: 'badge:oracle',
    type: 'achievement',
    i18nKey: 'badge_oracle',
    title: 'Oracle',
    fighterSlug: null,
    milestoneId: null,
    minTier: null,
  },
  {
    contentId: 'badge:diehard',
    type: 'achievement',
    i18nKey: 'badge_diehard',
    title: 'Diehard',
    fighterSlug: null,
    milestoneId: null,
    minTier: null,
  },
];

/** G1 正文：slug → 全文（spec §7，可直接上站）。 */
export const BACKSTORIES: Record<string, string> = {
  iron_jaw: `They called him Iron Jaw because in 31 amateur fights, nobody ever put him down. Not with hooks, not with uppercuts, not with the kind of overhand right that ends careers.

Marcus "Iron Jaw" Cole didn't start boxing until 27. Before that he poured concrete in Cleveland — 12-hour shifts, rebar, winter. His coach found him in a toughman contest, taking punches from men twice his size and smiling through a split lip. "I thought pain was just weather," Cole says. "You don't argue with weather. You work through it."

What the cameras never showed: after his first real sparring session — a former Golden Gloves champ left him wobbling — Cole sat in his car for an hour and almost drove home for good. He keeps the journal from that night. Page one reads: "I am not tough. I am stubborn. There is a difference."

For six years, stubborn was enough. Then came EP0. Viper didn't try to crack the chin. He went around it — angles, timing, a counter right hand in the fourth that the judges are still talking about. The first KO loss of Cole's life.

Now the question isn't whether the chin still works. It's whether stubborn is still enough.`,

  viper: `Viper doesn't start fights. He finishes them.

Raised in a gym above a pawn shop in Newark, Elena "Viper" Vasquez learned boxing backwards: defense first, offense as an afterthought. Her first coach made her spar three-minute rounds where she wasn't allowed to throw a single punch. "You'll thank me," he said. She hated him for two years. Then she knocked out a regional champion with the only punch she threw in round five.

What the cameras never showed: as a kid, Vasquez used to watch the gym's parking-lot security footage — hours of grainy video — studying how untrained people telegraph their swings. "A shoulder drops half an inch before a haymaker," she says. "Everybody tells you what they're going to do. You just have to watch."

EP0 was the thesis defense. Iron Jaw — the man nobody drops — walked forward for three rounds, and Vasquez watched. In the fourth, the shoulder dropped half an inch. The counter right hand landed clean. The arena went silent, then insane.

Seven fighters remain. All of them have now watched the tape. None of them think it matters. That's exactly what Viper wants them to think.`,

  sledge: `Before Sledge ever threw a punch, his hands were famous for something else.

Dmitri "Sledge" Volkov was a piano prodigy in Minsk — performing Chopin études at nine, conservatory-bound at fourteen. Then his father's factory closed, the family moved, and the piano stayed behind. A boxing gym two blocks from their new apartment had heavy bags. Volkov started hitting them the way he'd attacked a keyboard: with total commitment.

What the cameras never showed: he still plays. There's a battered upright in his training camp, and between sessions he'll sit down and run through the Revolutionary Étude — the same hands, the same precision, a completely different kind of impact. "Piano taught me that power without timing is just noise," he says.

In the ring, the timing is terrifying. Sledge doesn't box; he detonates. Eleven of his fourteen wins came by knockout, and sparring partners describe the experience as "being hit by weather."

The question hanging over the tournament: what happens when Sledge meets someone who won't stand still long enough to be demolished? The Professor is watching. So is Viper. Everybody's doing the math.`,

  monsoon: `Monsoon doesn't win rounds. He drowns people in them.

Growing up in a fishing village on the Kerala coast, Arjun "Monsoon" Nair hauled nets before school from age eight. Twelve-hour days in monsoon season. His lungs, his shoulders, his refusal to stop — all built by work that never asked permission.

A boxing scout saw him in a beach tournament, fighting his fifth bout of the day like it was his first. "Most fighters have three hard rounds in them," the scout said. "This kid has nine."

What the cameras never showed: Nair meditates on the beach at 4 AM before every fight — not for calm, but to remember the nets. "The sea doesn't get tired," he says. "Why should I?"

His style is suffocation: constant pressure, no rest, punches in bunches that aren't individually devastating but never, ever stop. Opponents describe round three against Monsoon as "trying to breathe underwater."

The tournament's nightmare matchup. Nobody wants to draw the man who treats a championship fight like another day hauling nets.`,

  volt: `Volt's punches don't travel. They arrive.

A former 100-meter sprinter, Jaylen "Volt" Carter blew out his knee at 21 — Olympic trials, gone in one bad step. For a year he barely left his apartment. Then a physical therapist suggested boxing for rehab. "Just the jab," she said. "Rebuild the shoulder."

The jab rebuilt everything else too. Carter's hand speed — honed by a decade of explosive starts — translated obscenely well. He throws four-punch combinations in the time most fighters throw two, and his double jab has been described as "a hummingbird with bad intentions."

What the cameras never showed: he still runs. Every morning, 6 AM, the same track where the knee gave out. Slower now. Deliberate. "I made peace with the track," he says. "The ring is where I'm fast now."

The open question: speed fades when someone walks through it. Iron Jaw tried. Sledge would love to try. If Volt can't keep the fight at range, the tournament gets very interesting, very fast.`,

  the_professor: `The Professor doesn't watch tape. He dissects it.

Dr. Elias "The Professor" Moreau has a PhD in biomechanics — a real one, from a real university — and he approaches boxing the way a chess grandmaster approaches an endgame: every opponent is a problem with a solution, and he's already done the homework.

His camp is legendary for its whiteboards: strike probabilities, angle diagrams, fatigue curves plotted against round numbers. Fighters who've faced him say it's like boxing someone who's read tomorrow's newspaper.

What the cameras never showed: Moreau almost quit the sport twice — once after his first knockout loss ("the data said I should win"), and once when his academic advisor called boxing "a waste of a mind." He keeps the advisor's email printed above his desk. "He wasn't wrong about the waste," Moreau says. "He was wrong about which one was wasting."

The tournament's great experiment: can preparation beat instinct? Viper fights on feel. Sledge fights on force. The Professor fights on math. Sooner or later, one of them is wrong.`,

  la_reina: `La Reina doesn't brawl. She performs surgery.

Sofia "La Reina" Mendoza learned to fight defending her family's market stall in Guadalajara — first with words, then with a left hook she taught herself watching old fight tapes at 2 AM. By sixteen she was the most feared amateur in the state. By twenty, she'd turned pro and never looked back.

Her style is the tournament's most beautiful: minimal movement, maximal efficiency, punches that land exactly where the guard isn't. "Anyone can throw a hundred punches," she says. "I throw twelve. Eleven land."

What the cameras never showed: after every win, she visits the market stall — still run by her mother — and works a full Saturday shift. Regulars get served by a champion. Nobody makes a fuss. That's the rule.

The narrative writes itself: the queen against the field of monsters. But the other seven fighters have seen the tape too, and they know what the highlight reels don't show — that the twelve punches are getting faster, and the guard is getting harder to find.`,

  'goliath-7': `Goliath-7 is the biggest man in the tournament. He's also the only one who knits.

At 6'9" and 265 pounds, Viktor "Goliath-7" Lindqvist looks like he was built in a lab for exactly one purpose. And in the ring, he fulfills it: seven knockouts in nine wins, each one a small demolition event. When Goliath-7 lands clean, fights end.

What the cameras never showed: between fights, he knits scarves. It's not a bit — he's genuinely good at it, and the tournament's production team has footage of him finishing a cable-knit scarf hours before a fight, then folding it neatly and going out to concuss someone. "Knitting teaches patience," he says, completely serious. "You cannot rush wool. You cannot rush a knockout either."

The terrible secret isn't the knitting. It's that under the gentle routine sits a fighter with genuine one-punch fight-ending power — the only man in the field who doesn't need combinations, angles, or game plans. Just one clean shot.

Everyone's game plan against Goliath-7 is the same: don't get hit. Nobody's managed it yet.`,
};
