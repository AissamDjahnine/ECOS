# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ECOS-AI is a voice-first medical ECOS (Examen Clinique Objectif Structuré) simulator. It provides real-time AI patient simulation using Google Gemini Live API for medical students to practice clinical oral examinations. The UI is entirely in French.

## Development Commands

```bash
# Start frontend (port 5173) + backend (port 3001) concurrently
npm run dev

# Individual processes
npm run dev:client      # Vite only
npm run dev:server      # Express only (tsx watch)

# Build & preview production
npm run build           # tsc -b && vite build
npm run preview

# Unit tests (Vitest + jsdom)
npm test                # run once with coverage
npm run test:watch      # watch mode

# Run a single test file
npx vitest run src/SansPsPage.test.tsx

# Run a single test by name pattern
npx vitest run --reporter=verbose -t "hides live transcript"

# E2e tests (Playwright — requires production build first)
npm run build && npm run test:e2e
npm run test:e2e:ui     # interactive UI
```

## Two Operational Modes

The app has two modes, each with its own page component:

**PS/PSS mode (`/ps`, `src/PsPage.tsx`)** — Live patient dialogue
- Backend creates a Gemini Live session in `"interactive"` mode with the patient script as system prompt
- Bidirectional audio: student mic → Gemini → AI patient voice → speakers
- Transcript captures both student and AI patient turns
- Voice selection from a catalog of 26 voices (13M/13F in `src/lib/voices.ts`)

**Sans PS mode (`/sans-ps`, `src/SansPsPage.tsx`)** — Student monologue
- Backend creates a Gemini Live session in `"silent"` mode (transcription only, no AI patient response)
- Student speaks alone; silence detection ends the session
- Optional AI transcript correction via `POST /api/transcript-debug`
- Evaluation source can be raw or AI-corrected transcript

Both modes share: case input parsing, evaluation flow, PDF export, recording playback, usage tracking, and settings.

## Architecture

### Project Structure
```
├── server/
│   ├── index.ts          # Express API, key resolution, usage middleware
│   ├── dashboard.ts      # Usage ledger, cost estimation, readiness state
│   └── evaluation.ts     # Feedback instruction templates by detail level
├── src/
│   ├── App.tsx           # Routing (pathname-based), settings persistence, toast, modals
│   ├── PsPage.tsx        # Live patient dialogue mode (~3000 lines)
│   ├── SansPsPage.tsx    # Student monologue mode (~2900 lines)
│   ├── EvaluationReport.tsx  # Score ring, criterion grid, narrative, recommendations
│   ├── SettingsDrawer.tsx    # Settings UI (timer, toggles, API key, feedback level)
│   ├── DashboardDrawer.tsx   # Usage stats, token estimates, readiness indicator
│   ├── ConfirmDialog.tsx     # Generic confirm modal (neutral/danger tones)
│   ├── RecordingPlayer.tsx   # Audio player with seek, speed control
│   ├── lib/
│   │   ├── audio.ts      # Mic capture (16kHz PCM), Gemini playback (24kHz PCM)
│   │   ├── parser.ts     # Hypocampus case text → ParsedCase
│   │   ├── pdf.ts        # HTML-based PDF export builder
│   │   ├── settings.ts   # localStorage persistence, validation, sanitization
│   │   └── voices.ts     # Voice catalog, sex-based inference
│   ├── types.ts          # All shared TypeScript types
│   └── test/setup.ts     # Vitest global mocks (scrollTo, rAF, localStorage)
├── tests/e2e/            # Playwright tests
└── vite.config.ts        # Vite dev proxy + Vitest config
```

### State Flow

`App.tsx` owns routing, persisted `AppSettings`, dark mode, toast queue, and drawer open/close state. It passes everything down as props — there is no context or external state library.

Both page components (`PsPage`, `SansPsPage`) are large self-contained components that own the full lifecycle of a session: parse → configure → start → live streaming → end → evaluate → report.

Key state types: `ConversationPhase` (idle/connecting/live/ended), `TranscriptEntry[]`, `ParsedCase`, `LiveSession`.

### API Endpoints (server/index.ts)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Readiness, configured models |
| POST | `/api/live-token` | Gemini Live ephemeral token; `mode: "interactive"\|"silent"`, `voiceName?` |
| POST | `/api/evaluate` | Criterion-by-criterion evaluation via Gemini JSON schema |
| POST | `/api/usage/live` | Record live session token usage to ledger |
| POST | `/api/dashboard` | Usage stats snapshot for `window: "1h"\|"1d"\|"7d"\|"30d"` |
| POST | `/api/transcript-debug` | AI transcript correction (Sans PS only) |

Key resolution order: `googleApiKey` in request body → `GEMINI_API_KEY` env var → missing (dashboard shows "blocked").

### Settings System (src/lib/settings.ts)

Stored in localStorage under `"ecos-ai.settings.v1"`. All values are validated on load via `sanitizeSettings()` — invalid values fall back to defaults. Fields: `defaultTimerSeconds`, `autoEvaluateAfterEnd`, `autoExportPdfAfterEvaluation`, `recordedAudioPlaybackRate`, `showLiveTranscript`, `showSystemMessages`, `feedbackDetailLevel`, `googleApiKey`.

### Case Parsing (src/lib/parser.ts)

`parseCase(rawInput)` extracts patient script and grading grid from Hypocampus-formatted text. Supports multiple French/English section delimiters. Returns `ParsedCase` with metadata (name, age, sex, context).

### EvaluationReport scoring

Score-aware color palette: emerald ≥75%, amber ≥45%, rose <45%. Improvement themes auto-detected from missed criteria via regex. Recommendations chosen deterministically via hash of missed criteria patterns.

### Audio Format

Microphone input → downsampled to 16kHz PCM → Gemini Live.
Gemini output → 24kHz PCM → `PcmPlayer` (supports interrupt on new audio).

### Environment Variables

Required in `.env`:
```
GEMINI_API_KEY=your_key_here
GEMINI_EVAL_MODEL=gemini-2.5-flash
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
```

### Testing

- **Unit tests**: Vitest + jsdom + React Testing Library. Test files alongside source (`*.test.tsx`, `*.test.ts`). Global setup in `src/test/setup.ts` clears localStorage and restores mocks after each test.
- **E2e tests**: Playwright against production preview build (`npm run build` required). Tests in `tests/e2e/`. `playwright.config.ts` sets baseURL to port 4173 and spins up the preview server automatically.
- Heavy mocking: `@google/genai` and `./lib/audio` are fully mocked in component tests via `vi.mock()` + `vi.hoisted()`.
