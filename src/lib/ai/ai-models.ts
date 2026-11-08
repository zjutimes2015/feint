/** Gateway model IDs are centralized so each demo can be adapted independently. */
export const AI_MODELS = {
  text: ['google/gemini-2.5-flash-lite', 'openai/gpt-4o-mini'],
  summary: ['google/gemini-2.5-flash-lite'],
  translation: ['google/gemini-2.5-flash-lite'],
  // Retained internal examples; excluded from AI_DEMO_TASKS and public requests.
  decision: ['typesafe-ai/jev'],
  speech: ['openai/tts-1'],
  caption: ['google/gemini-2.5-flash-lite'],
  image: ['bfl/flux-2-klein-4b'],
  imageChat: [
    'google/gemini-3.1-flash-lite-image',
    'google/gemini-3.1-flash-image',
  ],
  edit: ['google/gemini-3.1-flash-lite-image', 'google/gemini-3.1-flash-image'],
} as const;

const ALL_AI_DEMO_TASKS = [
  'decision',
  'summary',
  'translation',
  'tagline',
  'speech',
  'caption',
  'image',
  'imageChat',
  'edit',
] as const;
export type AiDemoTask = (typeof ALL_AI_DEMO_TASKS)[number];
/** Public tasks verified with a free-credit Gateway key. */
export const AI_DEMO_TASKS: readonly AiDemoTask[] = [
  'summary',
  'translation',
  'tagline',
  'speech',
  'caption',
  'image',
];
export const AI_LANGUAGES = [
  'English',
  'Chinese',
  'Japanese',
  'Korean',
  'French',
  'German',
  'Spanish',
  'Portuguese',
  'Arabic',
] as const;
export const AI_VOICES = [
  'alloy',
  'echo',
  'fable',
  'onyx',
  'nova',
  'shimmer',
] as const;
export const AI_IMAGE_MAX_BYTES = 700 * 1024;
