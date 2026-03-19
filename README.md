# ECOS-AI

Voice-first ECOS practice with a live AI patient, transcript review, audio replay, and automatic grading against a case-specific correction grid.

![ECOS-AI interface](assets/screenshots/ecos-ai-ui.png)

## Overview

ECOS-AI is a local training app for medical students preparing oral ECOS stations. You paste a patient scenario and grading grid, launch a real-time voice conversation with an AI patient, then review the transcript and run a criterion-by-criterion evaluation.

The project is built around a bring-your-own-key approach: you run the app locally and use your own Gemini API key instead of a subscription platform.

## What It Does

- Runs a live voice discussion with an AI patient using Gemini Live.
- Parses copied ECOS material into patient context and grading criteria.
- Displays the discussion transcript in real time.
- Records the station audio for replay after the discussion ends.
- Evaluates the student performance against the provided correction grid.
- Adds guardrails around very short discussions before evaluation starts.

## Current Focus

- Oral simulation rather than text-only interaction.
- Local usage with your own API key.
- Fast iteration on UI, scoring quality, and realism.
- Hypocampus-style copy-paste workflows.

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Node.js
- Express
- Google Gemini Live API
- Google Gemini evaluation model

## Project Structure

```text
ECOS/
├── assets/
│   └── screenshots/
│       └── ecos-ai-ui.png
├── server/
│   └── index.ts
├── src/
│   ├── lib/
│   │   ├── audio.ts
│   │   └── parser.ts
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── types.ts
├── .env.example
├── package.json
├── vite.config.ts
└── README.md
```

## Setup

1. Clone the repository.
2. Install dependencies with `npm install`.
3. Create a `.env` file at the project root.
4. Add your Gemini configuration:

```env
GEMINI_API_KEY=your_api_key_here
GEMINI_EVAL_MODEL=gemini-2.5-flash
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
```

## Run Locally

Start the app with:

```bash
npm run dev
```

This runs:

- the Vite frontend
- the Express backend

Typical local URLs:

- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`

## Typical Workflow

1. Paste the ECOS case material into the input area.
2. Let the parser extract the patient script and grading grid.
3. Start the discussion and conduct the station orally.
4. Pause or end the station when appropriate.
5. Review the transcript and replay the recorded audio.
6. Launch the evaluation and inspect the criterion-by-criterion feedback.

## Notes

- Browser microphone permission is required.
- A stable internet connection is required for Gemini Live.
- Evaluation quality depends on transcript quality and grading prompt quality.
- This is a training tool, not a certified medical assessment platform.

## Limitations

- Parsing still expects relatively structured source material.
- Case ingestion is currently optimized around Hypocampus-style formatting.
- Very short discussions may produce unreliable evaluation signals.
- AI grading is useful for training, but it is not a formal examiner.

## Roadmap

- Better scoring precision for student-led vs patient-volunteered information
- More robust parsing across different ECOS content sources
- Better station realism and patient behavior controls
- Stronger transcript cleanup and evaluation traceability
- Expanded support for specialty-specific stations

## Author

Built as an experimental voice-first ECOS simulator for clinical communication training.
