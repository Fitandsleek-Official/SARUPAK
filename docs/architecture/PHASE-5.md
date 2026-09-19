# Phase 5 — Real TTS Provider Integration

**Date:** 2026-09-19  
**Status:** OpenAI TTS adapter integrated with explicit provider selection; live speech verified only when `OPENAI_API_KEY` is present

## Setup

```bash
# apps/api/.env
OPENAI_API_KEY=sk-...          # required for real speech
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=alloy         # used by live test default
# Do NOT set TTS_PROVIDER=mock in production — that forces mock for tests only.
TTS_PROVIDER=

cd apps/api && npx prisma migrate dev
npm run build -w @sarupak/dubbing-core
npm run build -w @sarupak/api
```

In Studio → Dubbing:
1. Select **TTS provider** explicitly (`openai-tts` or `mock`).
2. Mock is never applied silently when OpenAI fails or is missing.
3. Assign a voice that matches the provider, then Generate speech.

## Environment variables

| Var | Purpose |
|-----|---------|
| `OPENAI_API_KEY` | Enables OpenAI TTS (never sent to frontend) |
| `OPENAI_BASE_URL` | API base (default OpenAI) |
| `OPENAI_TTS_MODEL` | Model id (default `gpt-4o-mini-tts`) |
| `OPENAI_TTS_VOICE` | Default voice for live tests |
| `TTS_PROVIDER` | Ops/test override: `mock` \| `openai-tts` (empty = no silent default to mock) |

## Provider capabilities (OpenAI adapter)

| Field | Value |
|-------|--------|
| State when key present | `configured` |
| State when key missing | `not_configured` |
| Languages claimed | `en` only |
| Khmer | `unsupported_language` — **not claimed** |
| Voices | alloy, echo, fable, onyx, nova, shimmer |
| Formats | wav, mp3 (normalized to wav for mixer) |
| Max chars | 4000 |
| Validation | ffprobe after write |

## Mock vs real

| | Mock | OpenAI |
|--|------|--------|
| Selection | **Explicit only** | Explicit or suggested when key present |
| Audio | Sine tones | Real speech (when live-tested) |
| Silent fallback | **Forbidden** | N/A — errors surface as `provider_error` |
| UI | Labeled “Mock tones (explicit test only)” | Disabled if not configured |

## Policy

- `silentMockFallback: false`
- `mockRequiresExplicitSelection: true`
- `khmerClaimed: false`
- API keys never returned in provider DTOs (boolean `apiKeyConfigured` only)
- Errors never log the API key

## Known language limitations

- English is the only language the OpenAI adapter will synthesize.
- Khmer requests fail with `unsupported_language` until a dedicated live verification is done and documented here.

## Tests

| Suite | When | Expectation |
|-------|------|-------------|
| Unit (mocked fetch) | Always | Pass — capabilities, Khmer reject, HTTP errors, no mock fallback |
| Existing Phase 4 e2e | `TTS_PROVIDER=mock` | Pass — explicit mock |
| Live `openai.tts-live.spec.ts` | Only if `OPENAI_API_KEY` set | Real speech + ffprobe |

```bash
npm test -w @sarupak/api
# Live (opt-in):
OPENAI_API_KEY=sk-... npx jest --config jest.config.js --runInBand openai.tts-live
```

## Live test results

Recorded 2026-09-19 in this environment:

- `OPENAI_API_KEY`: **not set** → live suite **skipped** (1 skipped).
- Unit mocks: **pass** (capabilities, Khmer reject, HTTP 500/503 → `provider_error`, no silent mock fallback, ffprobe validation on mocked WAV body).
- Phase 4 e2e with explicit `ttsProvider: "mock"`: **26 pass**.

**Production speech readiness: NOT claimed** — real OpenAI audio was not generated in this environment. To verify:

```bash
OPENAI_API_KEY=sk-... npm test -w @sarupak/api -- --testPathPatterns=openai.tts-live
```

## Phase 5.1 — Provider & Studio validation (2026-09-19)

### Port map (this machine)

| Port | Process |
|------|---------|
| `:4000` | Norng Downloader API — **not** SARUPAK |
| `:3000` | Norng Downloader frontend — `/studio` **404** |
| `:4002` | Stale SARUPAK API (pre–Phase 5; missing `policy`/`state`) |
| `:4003` | Fresh Phase 5 SARUPAK API (validation target) |
| `web/.env.local` | `NEXT_PUBLIC_API_URL=http://localhost:4003/v1` |

### Script results (`node scripts/phase5-studio-validate.mjs http://localhost:4003/v1`)

**22/22 pass** covering: UI dropdown source contracts, OpenAI disabled without key, generate blocked without provider, missing-voice error, Khmer voice rejected, no key/path leaks, mock generate → preview → mix/export playable MP4.

### Gaps (honest)

- No Playwright/Cypress in repo — interactive browser walkthrough **not automated**.
- SARUPAK Next `dev` did not become ready under the agent runner (hung); start manually on **3010**.
- `OPENAI_API_KEY` unset — **no real speech**; live suite skipped.
- Khmer TTS **not claimed**.

## Phase 5.2 — Stable development environment (2026-09-19)

| Setting | Value |
|---------|-------|
| API port | **4003** |
| Web port | **3010** |
| Health service id | `sarupak-api` |
| Health version | `0.5.2` |
| Smoke | `npm run smoke:api` / `apps/api/test/smoke.e2e-spec.ts` |

Docs: [`docs/development/PORTS.md`](../development/PORTS.md)

Frontend Studio calls `verifyExpectedApi()` against `/v1/health` so a mis-pointed `NEXT_PUBLIC_API_URL` (e.g. Norng on `:4000`) surfaces immediately.

**Not done in this phase:** interactive browser click-through (no Playwright/Cypress/browser MCP). Use API smoke + Studio banner identity check instead.
