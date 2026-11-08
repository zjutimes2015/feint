# AI Playground

The public `/ai` and `/zh/ai` pages demonstrate six on-demand tasks through
Vercel AI Gateway with a single server-only `AI_GATEWAY_API_KEY`.

## Setup

Create an AI Gateway key and set `AI_GATEWAY_API_KEY` in `.env` and your deployment
environment. Restart the local server after changing the key. No direct provider
keys are needed. Vercel Pro and the Gateway paid-credit tier are separate:
monthly $5 free credits cover only eligible models. Purchasing Gateway credits
moves the team to the paid tier and ends the monthly free allowance.

## Models

Defaults were selected from the [official free-tier list](https://vercel.com/ai-gateway/models?freeTier=true)
and verified with the configured local key on October 2, 2026.

| Example | Model | Interface |
| --- | --- | --- |
| Summarization | `google/gemini-2.5-flash-lite` | `generateText` |
| Translation | `google/gemini-2.5-flash-lite` | `generateText` |
| Taglines | `google/gemini-2.5-flash-lite`, `openai/gpt-4o-mini` | `generateText` |
| Text to speech | `openai/tts-1` | Gateway speech REST API |
| Image understanding | `google/gemini-2.5-flash-lite` | `generateText` with image input |
| Image generation | `bfl/flux-2-klein-4b` | `generateImage` |

Jev evaluation, Gemini image generation, and image editing are excluded from the
public task list and rejected by the endpoint. Their previous internal examples
remain available for adaptation after selecting and verifying suitable models.
Eligibility can change; check the official list and a real request before adding
models. Allowed model IDs, public tasks, languages, voices, and upload limits
are centralized in `src/lib/ai/ai-models.ts`. Task-specific generation settings
are in `src/lib/ai/gateway-demo.ts`.

Speech uses the documented `/v4/ai/speech-model` REST endpoint because AI SDK 6's
Gateway provider does not expose speech. TTS-1 supports alloy, echo, fable, onyx,
nova, and shimmer; the demo requests WAV audio.

## Data flow

Each demo has its own component in `src/components/ai/`: summarization,
translation, taglines, TTS, captioning, and image generation. The page explicitly
composes these cards. Request state and basic form controls are shared; each
card owns its parameters, validation, and result rendering.

| Demo | Component | Page anchor |
| --- | --- | --- |
| Summarization | `ai-summarization-card.tsx` | `ai-summary` |
| Translation | `ai-translation-card.tsx` | `ai-translation` |
| Taglines | `ai-tagline-card.tsx` | `tagline-generator` |
| Speech | `ai-tts-card.tsx` | `ai-speech` |
| Image understanding | `ai-caption-card.tsx` | `ai-caption` |
| Image generation | `ai-image-card.tsx` | `ai-image` |

All component paths above are relative to `src/components/ai/`.
`use-ai-demo.ts` handles requests, pending state, errors, and result clearing.
`demo-card-layout.tsx` supplies the common card/form/result layout;
`demo-fields.tsx` and `demo-select.tsx` supply basic form controls. They do not
choose task-specific parameters or render generated outputs.

The page at `src/app/[locale]/(marketing)/(pages)/ai/page.tsx` explicitly renders
these six components. Each component submits its own task payload to the shared
`/api/ai/demo` endpoint; there is no AI Server Action. The endpoint validates
inputs using `src/lib/ai/demo-schema.ts`, then calls `src/lib/ai/gateway-demo.ts`.
Desktop and mobile navigation derive their demo entries from the same public
task list.

Uploads accept inline PNG, JPEG, or WebP only, up to 700 KB, with server-side
signature checks. URLs and SVGs are rejected. Images and audio return data URLs
for inline display and playback. Results are not persisted. There are no custom
download links or model labels in the result panel. Nothing is generated on page
load, and each image click generates one image with no SDK retries.

This public endpoint consumes Gateway credits. Configure key budgets for public
use. Requests have a 110-second deadline; the route declares a 120-second duration.
Errors redact the configured key and responses use `Cache-Control: no-store`.

## Adding or changing a demo

1. Select a suitable model from the official free-tier list and verify a real
   request with the intended team's key. Catalog membership alone is not evidence
   of working access for that key.
2. Add or update models and the public task list in `src/lib/ai/ai-models.ts`,
   validation in `demo-schema.ts`, and the provider call in `gateway-demo.ts`.
3. Implement a dedicated component with its own parameters and output rendering.
   Add its section to the page and keep its anchor consistent with
   `src/config/navbar-config.tsx`. Both desktop and mobile use that navigation.
4. Update `AiDemo` translations in `messages/en.json` and `messages/zh.json`,
   this guide, and affected functional tests. Preserve stable behavior test IDs.
5. Run lint, type checking, unit tests, a production build, and the related
   Playground browser tests. Record real-provider checks separately from mocked
   tests. Removing a task requires removing its page section and public task entry.

## Verification

All six tasks and both tagline model choices returned real outputs with the local
key on October 2, 2026. These checks used the actual application service, not mocks.
Unit and Playwright tests separately verify application behavior with mocks and do
not establish current provider availability. Free credits still have rate and
balance limits; this successful snapshot does not guarantee future requests.

## Official references

- [Gateway pricing](https://vercel.com/docs/ai-gateway/pricing)
- [Gateway request errors](https://vercel.com/docs/ai-gateway/faq)
- [Gateway speech](https://vercel.com/docs/ai-gateway/modalities/text-to-speech)
- [Gateway image generation](https://vercel.com/docs/ai-gateway/modalities/image-generation)
