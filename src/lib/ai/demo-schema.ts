import { z } from 'zod';
import {
  AI_DEMO_TASKS,
  AI_IMAGE_MAX_BYTES,
  AI_LANGUAGES,
  AI_MODELS,
  AI_VOICES,
} from '@/lib/ai/ai-models';

// Inline raster images only: no user-controlled URLs or remote server fetches.
export const imageDataSchema = z
  .string()
  .max(Math.ceil(AI_IMAGE_MAX_BYTES / 3) * 4 + 32)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)
  .refine((value) => {
    const [, type, data] = value.match(/^data:(image\/\w+);base64,(.*)$/) ?? [];
    if (!data || data.length % 4 !== 0) return false;
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > AI_IMAGE_MAX_BYTES || bytes.length < 12) return false;
    if (type === 'image/png')
      return bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (type === 'image/jpeg')
      return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    return (
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    );
  }, 'Please upload a valid PNG, JPEG, or WebP image under 700 KB.');
const text = z.string().trim().min(1).max(4000);
const prompt = z.string().trim().min(5).max(1000);
export const aiDemoSchema = z
  .discriminatedUnion('task', [
    z.object({
      task: z.literal('decision'),
      model: z.enum(AI_MODELS.decision),
      text: text.min(10),
    }),
    z.object({
      task: z.literal('summary'),
      model: z.enum(AI_MODELS.summary),
      text: text.min(50),
    }),
    z
      .object({
        task: z.literal('translation'),
        model: z.enum(AI_MODELS.translation),
        text,
        sourceLang: z.enum(AI_LANGUAGES),
        targetLang: z.enum(AI_LANGUAGES),
      })
      .refine((v) => v.sourceLang !== v.targetLang, {
        message: 'Choose different source and target languages.',
        path: ['targetLang'],
      }),
    z.object({
      task: z.literal('tagline'),
      model: z.enum(AI_MODELS.text),
      text: text.min(10).max(400),
    }),
    z.object({
      task: z.literal('speech'),
      model: z.enum(AI_MODELS.speech),
      text: text.max(1000),
      voice: z.enum(AI_VOICES),
    }),
    z.object({
      task: z.literal('caption'),
      model: z.enum(AI_MODELS.caption),
      text: prompt,
      image: imageDataSchema,
    }),
    z.object({
      task: z.literal('image'),
      model: z.enum(AI_MODELS.image),
      text: prompt,
      aspectRatio: z.enum(['1:1', '16:9', '9:16']),
    }),
    z.object({
      task: z.literal('imageChat'),
      model: z.enum(AI_MODELS.imageChat),
      text: prompt,
      aspectRatio: z.enum(['1:1', '16:9', '9:16']),
    }),
    z.object({
      task: z.literal('edit'),
      model: z.enum(AI_MODELS.edit),
      text: prompt,
      image: imageDataSchema,
    }),
  ])
  .refine((input) => AI_DEMO_TASKS.includes(input.task), {
    message: 'This demo is not available with the configured free-tier models.',
    path: ['task'],
  });
export type AiDemoInput = z.infer<typeof aiDemoSchema>;
const probability = z.number().min(0).max(1);
export const decisionSchema = z.object({
  model: z.string(),
  answers: z.object({
    urgent: z.object({ type: z.literal('boolean'), probability }),
    team: z.object({
      type: z.literal('choice'),
      choice: z.enum(['billing', 'technical', 'sales']),
      probabilities: z.object({
        billing: probability,
        technical: probability,
        sales: probability,
      }),
    }),
    severity: z.object({
      type: z.literal('score'),
      score: z.number().min(0).max(3),
      probabilities: z.record(z.string(), probability),
    }),
  }),
});
export type AiDecision = z.infer<typeof decisionSchema>;
export type AiDemoResult =
  | { kind: 'text'; text: string; model: string }
  | { kind: 'taglines'; taglines: string[]; model: string }
  | { kind: 'decision'; decision: AiDecision; model: string }
  | { kind: 'image'; url: string; model: string }
  | { kind: 'audio'; url: string; model: string };
