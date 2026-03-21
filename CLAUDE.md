# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ECOS-AI is a voice-first medical ECOS (Examen Clinique Objectif Structuré) simulator. It provides real-time AI patient simulation using Google Gemini Live API for medical students to practice clinical oral examinations.

## Development Commands

```bash
# Start both frontend (Vite) and backend (Express) concurrently
npm run dev

# Start only the frontend dev server (port 5173)
npm run dev:client

# Start only the backend server (port 3001)
npm run dev:server

# Build for production (runs TypeScript compiler + Vite build)
npm run build

# Preview production build
npm run preview
```

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Express + TypeScript (runs via `tsx` in dev)
- **AI**: Google Gemini Live API (multimodal voice) + Gemini evaluation model

### Project Structure
```
├── server/index.ts          # Express API server
├── src/
│   ├── App.tsx              # Main React component (single-page app)
│   ├── lib/
│   │   ├── parser.ts        # Hypocampus case text parsing
│   │   └── audio.ts         # Web Audio API utilities
│   └── types.ts             # Shared TypeScript types
├── .env                     # API keys (Gemini)
└── vite.config.ts           # Vite dev server with /api proxy
```

### Key Architectural Patterns

**Voice Pipeline (src/lib/audio.ts)**
- `startMicrophoneStream()`: Captures microphone input, downsamples to 16kHz PCM, sends to Gemini
- `PcmPlayer`: Receives 24kHz PCM audio from Gemini and plays it back; supports interruption
- Audio is streamed bidirectionally during live sessions

**Live Session Flow (src/App.tsx)**
1. User pastes case text (Situation + Grille from Hypocampus)
2. Frontend calls `POST /api/live-token` with patient script
3. Backend creates a Gemini auth token with system instructions (patient role)
4. Frontend connects to Gemini Live API using that token
5. Bidirectional audio streaming begins (microphone → Gemini → speakers)
6. Transcripts are captured and displayed in real-time

**Evaluation Flow**
- After session ends, frontend sends transcript + grading grid to `POST /api/evaluate`
- Backend uses Gemini with JSON schema to return structured evaluation

**State Management**
- All state is local React state (no external state library)
- Key state: `ConversationPhase`, `TranscriptEntry[]`, `ParsedCase`, `LiveSession`

### Environment Variables

Required in `.env`:
```
GEMINI_API_KEY=your_key_here
GEMINI_EVAL_MODEL=gemini-2.5-flash
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
```

### API Endpoints (server/index.ts)

- `GET /api/health` - Health check, returns configured models
- `POST /api/live-token` - Creates Gemini auth token for live session
- `POST /api/evaluate` - Evaluates transcript against grading grid

### Case Parsing (src/lib/parser.ts)

Parses Hypocampus-formatted text to extract:
- Patient script (the "trame du patient")
- Grading grid (the "grille de correction")
- Patient metadata (name, age, context)

Supports multiple section delimiters and French/English labels.

### Important Implementation Details

- **Audio Format**: Microphone captures at 16kHz PCM; Gemini outputs at 24kHz PCM
- **Proxy**: Vite dev server proxies `/api` to `localhost:3001`
- **CORS**: Backend allows all origins (development setup)
- **TypeScript**: Project uses project references (`tsconfig.app.json` + `tsconfig.node.json`)
- **Styling**: Custom "clinic" color palette in Tailwind config

### Testing/Development Notes

- Backend must be running before starting a live discussion
- Browser microphone permission required
- Stable internet connection needed for Gemini Live audio
- The app is optimized for Hypocampus-formatted case text
