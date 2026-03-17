# 🎙️ ECOS-AI

**A high-fidelity, interactive voice ECOS simulator for medical students—designed as a flexible, free alternative to subscription-based platforms.**

## 📖 Overview

Traditional **ECOS** (*Examen Clinique Objectif Structuré*) preparation often relies on static PDFs or peer roleplay. While established platforms provide digital training, **ECOS-AI** offers a different philosophy: **total user autonomy through a "bring-your-own-key" model.**

### The Landscape
Many medical students use excellent commercial platforms such as:
* [**Hypocampus**](https://www.hypocampus.fr/medecine-ecos/): Features a popular **"ECOS Bot"**. It is primarily a **textual chatbot** experience. Even when using the microphone, it functions as a "speech-to-text" input for a text-based chat, rather than a continuous, natively oral interaction.
* [**DocECOS**](https://www.docecos.fr/): Offers **"DocIA"**, an interactive voice AI. While powerful, it is part of a premium subscription model which can be a financial barrier for many students.
* [**EDN.fr**](https://www.edn.fr/): Provides "IA 2.0" stations focusing on knowledge anchoring through structured text interfaces.

### 🚀 What Makes This Project Different?

Instead of a monthly subscription or a text-only interface, this project is a **free, open-source alternative** that puts you in control:

1.  **True Voice-First Interaction:** Move beyond "text bots." This is a fully **AI Interactive Voice** experience. You speak naturally to a live AI patient that handles interruptions, tone, and clinical nuances in real time—simulating the actual oral stress of the exam.
2.  **Bring Your Own API Key:** Use your own Google Gemini API key. This means you only pay for your actual usage (often staying within the Google AI Studio free tiers), avoiding the heavy markups of monthly subscriptions.
3.  **Hypocampus Integration:** For the moment, the parser is specifically optimized **exclusively for Hypocampus** content. You can copy-paste your "grilles" and "situations" directly from their platform, and the app will intelligently extract the clinical data for a voice session.
4.  **Privacy & Portability:** Since you run the app locally and provide your own key, your training data remains yours.


## ✨ Features

- **Live Voice Interaction:** Standardized patient simulation with a continuous, natural speech flow.
- **Real-Time Responses:** AI patient answers orally with minimal latency via Gemini Live (Multimodal).
- **Hypocampus Case Parsing:** Seamless extraction of scripts and grading grids directly from Hypocampus text.
- **Automatic Evaluation:** Post-station debriefing that compares your transcript against the specific grading grid to identify missed points.
- **Audio Replay:** Listen back to your own voice performance recorded locally to improve your communication skills.
- **8-Minute Timer:** Built-in countdown to match official national ECOS conditions.


## 🛠️ Main Workflow

1.  **Setup:** Paste your material (Situation + Grille) copied from **Hypocampus** into the setup area.
2.  **Parse:** The system automatically identifies the patient persona and the scoring criteria.
3.  **Interact:** Start the live discussion and speak to the simulated patient.
4.  **Review:** Examine the live transcript and listen to your audio recording.
5.  **Judge:** Send the transcript to the evaluator model for a criterion-by-criterion breakdown.


## Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS

### Backend
- Node.js
- Express
- TypeScript

### AI
- Google Gemini Live API
- Google Gemini evaluation model

## Project structure

```text
ECOS/
├── server/
│   └── index.ts
├── src/
│   ├── lib/
│   │   ├── audio.ts
│   │   └── parser.ts
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   └── types.ts
├── .env
├── .env.example
├── package.json
├── vite.config.ts
└── README.md
```

## Installation

### 1. Clone the repository

Open a terminal and run:

`git clone https://github.com/AissamDjahnine/ecos-ai`  
`cd ECOS`

### 2. Install dependencies

This project has a frontend and a backend.  
Install all required packages with:

`npm install`

### 3. Create the environment file

At the root of the backend, create a `.env` file and add your Gemini configuration variables:

`GEMINI_API_KEY=your_api_key_here`  
`GEMINI_EVAL_MODEL=gemini-2.5-flash`  
`GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025`

### 4. Start the backend

Run:

`npm run dev`

This starts the API server, usually on:

`http://localhost:3001`

### 5. Start the frontend

In another terminal, run:

`npm run dev`

This starts the frontend development server, usually on a local Vite URL such as:

`http://localhost:5173`

### 6. Open the app

Open the frontend URL in your browser.  
Paste a patient case and grading grid, click **Parse & Prepare**, then start the live ECOS discussion.

### Notes

- Make sure the backend is running before starting a live discussion.
- Microphone permission must be allowed in the browser.
- A stable internet connection is required for Gemini Live audio.

## Typical workflow
	1.	Open the app
	2.	Paste the full ECOS material into the setup textarea
	3.	Click Parse & Prepare
	4.	Check the extracted patient information
	5.	Choose a voice
	6.	Click Start Discussion
	7.	Conduct the station orally
	8.	Click End Discussion
	9.	Click Judge Transcript
	10.	Review the evaluation results

## Current limitations
	•	Voice selection does not automatically adapt to patient sex or age
	•	Parsing still depends on relatively structured source formatting
	•	Evaluation quality depends on transcript quality
	•	Live transcription may still vary with microphone quality, noise, and turn timing
	•	This is a training tool, not a certified medical assessment platform

## Why this project matters

This project aims to move ECOS preparation from:
	•	static reading
	•	manual roleplay
	•	text-only bots

toward:
	•	live oral simulation
	•	more realistic station dynamics
	•	immediate structured feedback

The objective is not just to generate answers, but to reproduce the experience of a spoken ECOS encounter as closely as possible.

## Vision

This can become a base for:
	•	specialty-specific ECOS stations
	•	multilingual stations
	•	adaptive patient behavior
	•	better automatic scoring
	•	institutional training platforms
	•	complete voice-first clinical communication training

## Status

Early working version with:
	•	live patient audio
	•	transcript display
	•	parsing
	•	evaluation
	•	voice selection
	•	timer
	•	audio replay

## Author

Built as an experimental ECOS training platform exploring real-time voice AI for clinical education.