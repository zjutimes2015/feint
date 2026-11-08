import { gateway, generateImage, generateText } from 'ai';
import {
  decisionSchema,
  type AiDemoInput,
  type AiDemoResult,
} from './demo-schema';

export const TICKET_QUESTIONS = {
  urgent: {
    type: 'boolean',
    instructions:
      'Does this support request need immediate attention because of ongoing customer impact?',
  },
  team: {
    type: 'choice',
    instructions: 'Which team should handle this support request?',
    criteria: {
      billing: 'Invoices, refunds, and billing',
      technical: 'Outages, errors, and configuration',
      sales: 'Plans, upgrades, and purchasing',
    },
  },
  severity: {
    type: 'score',
    instructions: 'How severe is the current customer impact?',
    criteria: [
      'No impact',
      'Minor: workaround available',
      'Major: core functionality blocked for some users',
      'Critical: core functionality blocked for all users',
    ],
  },
};

export function gatewayKey() {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key)
    throw new Error('Missing AI_GATEWAY_API_KEY. Configure it on the server.');
  return key;
}

/** Evaluation and speech use documented Gateway REST endpoints because SDK 6
 * does not expose Gateway evaluation or speech models. No direct provider keys. */
async function gatewayPost(
  path: string,
  body: unknown,
  headers?: Record<string, string>
) {
  const response = await fetch(`https://ai-gateway.vercel.sh${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gatewayKey()}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110_000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload.error?.message ?? payload.error ?? payload.message;
    throw new Error(
      typeof message === 'string'
        ? message
        : `AI Gateway request failed (${response.status}).`
    );
  }
  return response.json();
}

export function parseTaglines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length <= 120)
    .slice(0, 5);
}

export function textProviderOptions(
  model: string
): NonNullable<Parameters<typeof generateText>[0]['providerOptions']> {
  if (model.startsWith('deepseek/'))
    return { deepseek: { thinking: { type: 'disabled' } } };
  if (model.startsWith('openai/gpt-4')) return {};
  if (model.startsWith('openai/'))
    return { openai: { reasoningEffort: 'none' } };
  return { google: { thinkingConfig: { thinkingBudget: 0 } } };
}

export async function runAiDemo(input: AiDemoInput): Promise<AiDemoResult> {
  gatewayKey();
  const { model, text, task } = input;
  if (task === 'decision') {
    const result = await gatewayPost('/v1/evaluate', {
      model,
      state: text,
      questions: TICKET_QUESTIONS,
    });
    return { kind: 'decision', decision: decisionSchema.parse(result), model };
  }
  if (task === 'speech') {
    const result = await gatewayPost(
      '/v4/ai/speech-model',
      { text, voice: input.voice, outputFormat: 'wav' },
      {
        'ai-gateway-protocol-version': '0.0.1',
        'ai-speech-model-specification-version': '4',
        'ai-model-id': model,
      }
    );
    if (typeof result.audio !== 'string' || !result.audio)
      throw new Error('AI Gateway returned no audio.');
    return {
      kind: 'audio',
      url: `data:audio/wav;base64,${result.audio}`,
      model,
    };
  }
  if (task === 'image') {
    const result = await generateImage({
      model: gateway.imageModel(model),
      prompt: text,
      aspectRatio: input.aspectRatio,
      n: 1,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(110_000),
    });
    return {
      kind: 'image',
      url: `data:${result.image.mediaType};base64,${result.image.base64}`,
      model,
    };
  }
  if (task === 'imageChat' || task === 'edit') {
    const result = await generateText({
      model: gateway(model),
      messages: [
        {
          role: 'user',
          content:
            task === 'edit'
              ? [
                  { type: 'text', text },
                  { type: 'image', image: input.image },
                ]
              : [{ type: 'text', text }],
        },
      ],
      providerOptions: {
        google: {
          responseModalities: ['TEXT', 'IMAGE'],
          ...(task === 'imageChat' && {
            imageConfig: { aspectRatio: input.aspectRatio },
          }),
        },
      },
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(110_000),
    });
    const image = result.files.find((file) =>
      ['image/png', 'image/jpeg', 'image/webp'].includes(file.mediaType)
    );
    if (!image)
      throw new Error('The model returned no image. Try another prompt.');
    return {
      kind: 'image',
      url: `data:${image.mediaType};base64,${image.base64}`,
      model,
    };
  }
  const system =
    task === 'summary'
      ? 'Summarize the supplied text in 1-2 concise sentences. Preserve its language and facts. Return only the summary.'
      : task === 'translation'
        ? `Translate from ${input.sourceLang} to ${input.targetLang}. Preserve meaning and formatting. Return only the translation.`
        : task === 'tagline'
          ? 'Write exactly 5 short, punchy SaaS taglines (max 8 words each) for the supplied product description. Return only a numbered list.'
          : 'Answer the question about the supplied image. Describe only what you can observe.';
  const result = await generateText({
    model: gateway(model),
    system,
    ...(task === 'caption'
      ? {
          messages: [
            {
              role: 'user' as const,
              content: [
                { type: 'text' as const, text },
                { type: 'image' as const, image: input.image },
              ],
            },
          ],
        }
      : { prompt: text }),
    providerOptions: textProviderOptions(model),
    maxOutputTokens: task === 'tagline' ? 300 : 1000,
    temperature: task === 'tagline' ? 0.85 : 0.2,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(110_000),
  });
  if (!result.text.trim())
    throw new Error(
      'The model returned no text. Try another model or increase the output token budget.'
    );
  if (task === 'tagline') {
    const taglines = parseTaglines(result.text);
    if (!taglines.length)
      throw new Error('Could not parse taglines from model response.');
    return { kind: 'taglines', taglines, model };
  }
  return { kind: 'text', text: result.text, model };
}
