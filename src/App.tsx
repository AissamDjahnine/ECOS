import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  TurnCoverage,
  type LiveServerMessage,
} from "@google/genai";
import { parseCaseInput, transcriptToPlainText } from "./lib/parser";
import {
  PcmPlayer,
  requestMicrophoneStream,
  startMicrophoneStream,
  type AudioStreamer,
  type MicrophoneLevelSample,
} from "./lib/audio";
import type { EvaluationResult, ParsedCase, TranscriptEntry } from "./types";

const liveModel =
  import.meta.env.VITE_GEMINI_LIVE_MODEL ??
  "gemini-2.5-flash-native-audio-preview-12-2025";

type RealtimeAudioInput = {
  data: string;
  mimeType: string;
};

type LiveSession = {
  close: () => void;
  sendRealtimeInput?: (payload: {
    audio?: RealtimeAudioInput;
    audioStreamEnd?: boolean;
  }) => void;
};

type ConversationPhase =
  | "idle"
  | "listening"
  | "student-speaking"
  | "patient-speaking"
  | "processing"
  | "paused";

type TranscriptFilter = "full" | "patient" | "student" | "system";

type PatientInfoItem = {
  label: string;
  value: string;
};

type MixedRecorderRefs = {
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  micSource: MediaStreamAudioSourceNode;
  patientSource: MediaStreamAudioSourceNode;
};

function createTimestamp() {
  return new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createTranscriptEntry(
  role: TranscriptEntry["role"],
  text: string,
): TranscriptEntry {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    timestamp: createTimestamp(),
  };
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function uint8ToBase64(uint8: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < uint8.length; index += chunkSize) {
    const sub = uint8.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...sub);
  }

  return btoa(binary);
}

function upsertTranscriptEntryById(
  current: TranscriptEntry[],
  entryId: string,
  role: TranscriptEntry["role"],
  text: string,
) {
  const trimmed = text.trim();
  if (!trimmed) {
    return current;
  }

  const index = current.findIndex((entry) => entry.id === entryId);

  if (index === -1) {
    return [
      ...current,
      {
        id: entryId,
        role,
        text: trimmed,
        timestamp: createTimestamp(),
      },
    ];
  }

  const existing = current[index];
  if (existing.text.trim() === trimmed) {
    return current;
  }

  const updated = [...current];
  updated[index] = {
    ...existing,
    text: trimmed,
    timestamp: createTimestamp(),
  };

  return updated;
}

function appendTranscriptChunk(currentText: string, incomingChunk: string) {
  const chunk = incomingChunk.trim();
  if (!chunk) {
    return currentText;
  }

  const current = currentText.trim();
  if (!current) {
    return chunk;
  }

  if (current === chunk || current.endsWith(chunk)) {
    return current;
  }

  if (chunk.startsWith(current)) {
    return chunk;
  }

  const maxOverlap = Math.min(current.length, chunk.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const currentSuffix = current.slice(-overlap).toLowerCase();
    const chunkPrefix = chunk.slice(0, overlap).toLowerCase();

    if (currentSuffix === chunkPrefix) {
      return current + chunk.slice(overlap);
    }
  }

  const noLeadingSpaceBefore = new Set([
    ".",
    ",",
    ";",
    ":",
    "!",
    "?",
    ")",
    "]",
    "}",
    "'",
    "'",
  ]);

  if (noLeadingSpaceBefore.has(chunk)) {
    return `${current}${chunk}`;
  }

  if (current.endsWith("'") || current.endsWith("'")) {
    return `${current}${chunk}`;
  }

  return `${current} ${chunk}`;
}

function cleanValue(value: string) {
  return value.replace(/\s+/g, " ").replace(/^\s*[:\-–]\s*/, "").trim();
}

function findField(script: string, labels: string[]) {
  const lines = script.split("\n");
  const normalizedLabels = labels.map((label) => label.toLowerCase());

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index].trim();
    if (!rawLine) {
      continue;
    }

    const lowerLine = rawLine.toLowerCase();

    for (const label of normalizedLabels) {
      if (lowerLine.startsWith(label)) {
        const afterColon = rawLine.split(":").slice(1).join(":").trim();
        if (afterColon) {
          return cleanValue(afterColon);
        }

        for (let next = index + 1; next < lines.length; next += 1) {
          const candidate = lines[next].trim();
          if (!candidate) {
            continue;
          }
          if (candidate.includes(":")) {
            break;
          }
          return cleanValue(candidate);
        }
      }
    }
  }

  return "";
}

function extractPatientInfo(parsedCase: ParsedCase): PatientInfoItem[] {
  const script = parsedCase.patientScript || "";
  const items: PatientInfoItem[] = [];

  const patientName =
    parsedCase.patientName ||
    findField(script, ["nom", "name", "nom du patient", "patiente", "patient"]);
  const age = parsedCase.patientAge || findField(script, ["âge", "age"]);
  const sex = findField(script, ["sexe", "genre"]);
  const weight = findField(script, ["poids"]);
  const height = findField(script, ["taille"]);
  const maritalStatus = findField(script, [
    "statut marital",
    "situation familiale",
  ]);
  const children = findField(script, ["enfants"]);
  const job = findField(script, [
    "contexte sociopessionnel",
    "contexte socioprofessionnel",
    "profession",
    "métier",
  ]);

  if (patientName) items.push({ label: "Nom", value: patientName });
  if (age) items.push({ label: "Âge", value: age });
  if (sex) items.push({ label: "Sexe", value: sex });
  if (weight) items.push({ label: "Poids", value: weight });
  if (height) items.push({ label: "Taille", value: height });
  if (maritalStatus) {
    items.push({ label: "Statut marital", value: maritalStatus });
  }
  if (children) items.push({ label: "Enfants", value: children });
  if (job) items.push({ label: "Profession", value: job });

  return items;
}

function parseScore(score?: string) {
  if (!score) {
    return { value: 0, max: 15, ratio: 0 };
  }

  const match = score.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (!match) {
    return { value: 0, max: 15, ratio: 0 };
  }

  const value = Number(match[1].replace(",", "."));
  const max = Number(match[2].replace(",", "."));
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  return { value, max, ratio };
}

function scoreGradient(ratio: number) {
  const hue = Math.round(ratio * 120);
  return `linear-gradient(135deg, hsl(${hue}, 84%, 58%), hsl(${Math.max(
    0,
    hue - 14,
  )}, 88%, 48%))`;
}

function scoreColor(ratio: number) {
  const hue = Math.round(ratio * 120);
  return `hsl(${hue}, 78%, 38%)`;
}

function buildPdfDocument(
  parsedCase: ParsedCase,
  transcript: TranscriptEntry[],
  evaluation: EvaluationResult | null,
) {
  const transcriptHtml = transcript
    .filter((entry) => entry.text.trim().length > 0)
    .map((entry) => {
      const background =
        entry.role === "student"
          ? "#dbeafe"
          : entry.role === "patient"
            ? "#dcfce7"
            : "#e5e7eb";

      const align =
        entry.role === "student"
          ? "margin-left:auto;"
          : entry.role === "patient"
            ? "margin-right:auto;"
            : "margin:0 auto;";

      return `
        <div style="max-width:75%; ${align} background:${background}; border-radius:18px; padding:12px 14px; margin-bottom:10px;">
          <div style="font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:#475569; margin-bottom:6px;">
            ${entry.role} — ${entry.timestamp}
          </div>
          <div style="font-size:14px; line-height:1.5; color:#0f172a; white-space:pre-wrap;">${entry.text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</div>
        </div>
      `;
    })
    .join("");

  const evaluationHtml = evaluation
    ? `
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left; padding:10px; border:1px solid #cbd5e1;">Critère</th>
            <th style="text-align:left; padding:10px; border:1px solid #cbd5e1;">Résultat</th>
            <th style="text-align:left; padding:10px; border:1px solid #cbd5e1;">Feedback</th>
          </tr>
        </thead>
        <tbody>
          ${evaluation.details
            .map(
              (detail) => `
            <tr>
              <td style="padding:10px; border:1px solid #cbd5e1; vertical-align:top;">${detail.criterion}</td>
              <td style="padding:10px; border:1px solid #cbd5e1; vertical-align:top;">
                ${detail.observed ? "Observé" : "Non observé"}
              </td>
              <td style="padding:10px; border:1px solid #cbd5e1; vertical-align:top;">${detail.feedback}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `
    : `<p style="color:#64748b;">Aucune évaluation disponible.</p>`;

  return `
    <html>
      <head>
        <title>Compte rendu ECOS-AI</title>
      </head>
      <body style="font-family:Arial, Helvetica, sans-serif; padding:32px; color:#0f172a;">
        <h1 style="margin:0 0 8px;">ECOS-AI — Compte rendu</h1>
        <p style="margin:0 0 24px; color:#475569;">Simulation clinique pilotée par Gemini Live</p>

        <h2>Sujet</h2>
        <div style="border:1px solid #cbd5e1; border-radius:16px; padding:16px; white-space:pre-wrap;">
          ${parsedCase.rawInput
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}
        </div>

        <h2 style="margin-top:28px;">Transcription</h2>
        <div>${transcriptHtml || "<p>Aucune transcription.</p>"}</div>

        <h2 style="margin-top:28px;">Évaluation</h2>
        <p><strong>Note finale :</strong> ${evaluation?.score ?? "--/--"}</p>
        ${evaluationHtml}
      </body>
    </html>
  `;
}

// Icon Components
function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <path d="M12 19v3" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
      <path d="M19 10v2a6.98 6.98 0 0 1-.64 2.93" />
      <path d="M14.12 5.88A3 3 0 0 0 9 8" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="4" height="16" x="6" y="4" />
      <rect width="4" height="16" x="14" y="4" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="5" y="5" rx="2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  );
}

export default function App() {
  const [rawInput, setRawInput] = useState("");
  const [parsedCase, setParsedCase] = useState<ParsedCase>(() =>
    parseCaseInput(""),
  );
  const [parseError, setParseError] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasEndedDiscussion, setHasEndedDiscussion] = useState(false);
  const [status, setStatus] = useState("Prêt");
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationProgress, setEvaluationProgress] = useState(0);
  const [conversationPhase, setConversationPhase] =
    useState<ConversationPhase>("idle");
  const [showStudentDraftIndicator, setShowStudentDraftIndicator] =
    useState(false);
  const [showTranscriptReview, setShowTranscriptReview] = useState(false);
  const [transcriptFilter, setTranscriptFilter] =
    useState<TranscriptFilter>("full");
  const [darkMode, setDarkMode] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micPeak, setMicPeak] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(8 * 60);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);
  const micRef = useRef<AudioStreamer | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const mixedRecorderRef = useRef<MixedRecorderRefs | null>(null);

  const inputTranscriptRef = useRef("");
  const outputTranscriptRef = useRef("");
  const currentPatientEntryIdRef = useRef<string | null>(null);
  const studentTurnAudioChunksRef = useRef<Blob[]>([]);
  const isFinalizingStudentRef = useRef(false);

  const recordedAudioUrlRef = useRef<string | null>(null);
  const shouldSendAudioRef = useRef(true);
  const isMicMutedRef = useRef(false);

  const patientInfo = useMemo(() => extractPatientInfo(parsedCase), [parsedCase]);

  const filteredTranscript = useMemo(() => {
    if (transcriptFilter === "full") {
      return transcript;
    }
    return transcript.filter((entry) => entry.role === transcriptFilter);
  }, [transcript, transcriptFilter]);

  const filteredTranscriptText = useMemo(
    () =>
      transcriptToPlainText(
        filteredTranscript
          .filter((entry) => entry.text.trim().length > 0)
          .map((entry) => ({
            role: entry.role,
            text: entry.text.trim(),
          })),
      ),
    [filteredTranscript],
  );

  const parsedReady = Boolean(parsedCase.patientScript && parsedCase.gradingGrid);
  const canStart = parsedReady && !isConnecting && !isDiscussing && !isPaused;
  const canPause = isDiscussing;
  const canEnd = isDiscussing || isPaused;
  const canJudge =
    hasEndedDiscussion &&
    !isDiscussing &&
    !isPaused &&
    !isEvaluating &&
    transcript.some(
      (entry) => entry.role === "student" || entry.role === "patient",
    ) &&
    Boolean(parsedCase.gradingGrid);

  const scoreState = parseScore(evaluation?.score);
  const timerDanger = remainingSeconds <= 60;

  function startMixedRecorder(
    microphoneStream: MediaStream,
    patientStream: MediaStream,
  ) {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextCtor) {
      return null;
    }

    const context = new AudioContextCtor();
    const destination = context.createMediaStreamDestination();
    const micSource = context.createMediaStreamSource(microphoneStream);
    const patientSource = context.createMediaStreamSource(patientStream);

    micSource.connect(destination);
    patientSource.connect(destination);

    const recorder =
      typeof MediaRecorder !== "undefined"
        ? new MediaRecorder(
            destination.stream,
            MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? { mimeType: "audio/webm;codecs=opus" }
              : undefined,
          )
        : null;

    const chunks: Blob[] = [];

    if (recorder) {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.start(250);
    }

    return {
      context,
      destination,
      recorder,
      chunks,
      micSource,
      patientSource,
    };
  }

  async function stopMixedRecorder() {
    const mixed = mixedRecorderRef.current;
    mixedRecorderRef.current = null;

    if (!mixed) {
      return null;
    }

    const mixedBlob = await new Promise<Blob | null>((resolve) => {
      if (!mixed.recorder) {
        resolve(null);
        return;
      }

      mixed.recorder.onstop = () => {
        resolve(
          mixed.chunks.length > 0
            ? new Blob(mixed.chunks, {
                type: mixed.recorder?.mimeType || "audio/webm",
              })
            : null,
        );
      };

      if (mixed.recorder.state !== "inactive") {
        mixed.recorder.stop();
      } else {
        resolve(null);
      }
    });

    try {
      mixed.micSource.disconnect();
    } catch {
      //
    }

    try {
      mixed.patientSource.disconnect();
    } catch {
      //
    }

    await mixed.context.close();
    return mixedBlob;
  }

  function toggleMicMute() {
    setIsMicMuted((current) => {
      const next = !current;
      isMicMutedRef.current = next;

      if (next) {
        setMicLevel(0);
        setMicPeak(0);
      }

      return next;
    });
  }

  function handleParse() {
    const parsed = parseCaseInput(rawInput);
    setParsedCase(parsed);
    setEvaluation(null);
    setHasEndedDiscussion(false);

    if (!parsed.patientScript || !parsed.gradingGrid) {
      setParseError(
        "Le parser n'a pas trouvé les deux sections clairement. Vérifie les intitulés ou les séparateurs.",
      );
    } else {
      setParseError("");
    }

    setStatus(parsed.patientScript && parsed.gradingGrid ? "Cas préparé" : "Prêt");
  }

  async function finalizeStudentDraft() {
    if (isFinalizingStudentRef.current) {
      return;
    }

    const fallbackText = inputTranscriptRef.current.trim();
    const audioChunks = [...studentTurnAudioChunksRef.current];

    if (!fallbackText && audioChunks.length === 0) {
      setShowStudentDraftIndicator(false);
      return;
    }

    isFinalizingStudentRef.current = true;

    inputTranscriptRef.current = "";
    studentTurnAudioChunksRef.current = [];
    setShowStudentDraftIndicator(false);

    const entryId = crypto.randomUUID();

    try {
      if (audioChunks.length > 0) {
        const audioBlob = new Blob(audioChunks, {
          type: "audio/pcm;rate=16000",
        });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const base64Audio = uint8ToBase64(new Uint8Array(arrayBuffer));

        const response = await fetch("/api/transcribe-turn", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            audioBase64: base64Audio,
            mimeType: "audio/pcm;rate=16000",
          }),
        });

        if (response.ok) {
          const result = (await response.json()) as { text?: string };
          const improvedText = result.text?.trim();

          if (improvedText) {
            setTranscript((current) =>
              [
                ...current,
                {
                  id: entryId,
                  role: "student",
                  text: improvedText,
                  timestamp: createTimestamp(),
                },
              ],
            );
            return;
          }
        }
      }

      if (fallbackText) {
        setTranscript((current) =>
          upsertTranscriptEntryById(current, entryId, "student", fallbackText),
        );
      }
    } catch {
      if (fallbackText) {
        setTranscript((current) =>
          upsertTranscriptEntryById(current, entryId, "student", fallbackText),
        );
      }
    } finally {
      isFinalizingStudentRef.current = false;
    }
  }

  async function togglePauseDiscussion() {
    if (!isDiscussing && !isPaused) {
      return;
    }

    if (!isPaused) {
      shouldSendAudioRef.current = false;
      setIsDiscussing(false);
      setIsPaused(true);
      setConversationPhase("paused");
      setStatus("Discussion en pause");
      setShowStudentDraftIndicator(false);

      await finalizeStudentDraft();

      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", "Discussion mise en pause."),
      ]);
      return;
    }

    shouldSendAudioRef.current = true;
    setIsDiscussing(true);
    setIsPaused(false);
    setConversationPhase("listening");
    setStatus("Discussion reprise");
    setTranscript((current) => [
      ...current,
      createTranscriptEntry("system", "Discussion reprise."),
    ]);
  }

  async function startDiscussion() {
    try {
      setIsConnecting(true);
      setHasEndedDiscussion(false);
      setStatus("Demande de jeton temporaire");
      setEvaluation(null);
      setRemainingSeconds(8 * 60);
      setTranscript([]);
      setMicLevel(0);
      setMicPeak(0);
      setIsPaused(false);

      shouldSendAudioRef.current = true;
      inputTranscriptRef.current = "";
      outputTranscriptRef.current = "";
      currentPatientEntryIdRef.current = null;
      studentTurnAudioChunksRef.current = [];
      isFinalizingStudentRef.current = false;
      setShowStudentDraftIndicator(false);

      if (recordedAudioUrlRef.current) {
        URL.revokeObjectURL(recordedAudioUrlRef.current);
        recordedAudioUrlRef.current = null;
      }

      setRecordedAudioUrl(null);
      setIsMicMuted(false);
      isMicMutedRef.current = false;

      const mediaStream = await requestMicrophoneStream();

      const tokenResponse = await fetch("/api/live-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientScript: parsedCase.patientScript,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(await tokenResponse.text());
      }

      const tokenPayload = (await tokenResponse.json()) as {
        token: string;
        model: string;
      };

      setStatus("Ouverture de la session Live");

      const ai = new GoogleGenAI({
        apiKey: tokenPayload.token,
        httpOptions: {
          apiVersion: "v1alpha",
        },
      });

      const player = new PcmPlayer();
      playerRef.current = player;
      await player.resume();

      mixedRecorderRef.current = startMixedRecorder(
        mediaStream,
        player.getRecordingStream(),
      );

      const session = (await ai.live.connect({
        model: tokenPayload.model || liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity:
                StartSensitivity.START_SENSITIVITY_HIGH,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
              prefixPaddingMs: 160,
              silenceDurationMs: 1200,
            },
            activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
          },
        },
        callbacks: {
          onopen: () => {
            shouldSendAudioRef.current = true;
            setStatus("Session Live ouverte, en attente de l'étudiant");
            setConversationPhase("listening");
          },

          onmessage: async (message: LiveServerMessage) => {
            const liveMessage = message as LiveServerMessage & {
              inputTranscription?: { text?: string };
              outputTranscription?: { text?: string };
              serverContent?: {
                inputTranscription?: { text?: string };
                outputTranscription?: { text?: string };
                modelTurn?: {
                  parts?: Array<{
                    inlineData?: { data?: string; mimeType?: string };
                  }>;
                };
                interrupted?: boolean;
                generationComplete?: boolean;
                turnComplete?: boolean;
                waitingForInput?: boolean;
              };
            };

            const serverContent = liveMessage.serverContent;
            const modelTurn = serverContent?.modelTurn;

            const inputTranscription =
              liveMessage.inputTranscription ??
              liveMessage.serverContent?.inputTranscription;

            if (inputTranscription?.text) {
              inputTranscriptRef.current = appendTranscriptChunk(
                inputTranscriptRef.current,
                inputTranscription.text,
              );
              setConversationPhase("student-speaking");
              setStatus("Étudiant en train de parler");
              setShowStudentDraftIndicator(true);
            }

            const outputTranscription =
              liveMessage.outputTranscription ??
              liveMessage.serverContent?.outputTranscription;

            if (outputTranscription?.text) {
              if (inputTranscriptRef.current.trim()) {
                await finalizeStudentDraft();
              }

              outputTranscriptRef.current = appendTranscriptChunk(
                outputTranscriptRef.current,
                outputTranscription.text,
              );

              if (!currentPatientEntryIdRef.current) {
                currentPatientEntryIdRef.current = crypto.randomUUID();
              }

              setConversationPhase("patient-speaking");
              setStatus("Patient en train de parler");
              setTranscript((current) =>
                upsertTranscriptEntryById(
                  current,
                  currentPatientEntryIdRef.current!,
                  "patient",
                  outputTranscriptRef.current,
                ),
              );
            }

            const parts = modelTurn?.parts ?? [];
            const hasAudioParts = parts.some(
              (part) =>
                !!part.inlineData?.data &&
                !!part.inlineData.mimeType?.startsWith("audio/pcm"),
            );

            if (hasAudioParts) {
              if (inputTranscriptRef.current.trim()) {
                await finalizeStudentDraft();
              }

              shouldSendAudioRef.current = false;
              setShowStudentDraftIndicator(false);
              setConversationPhase("patient-speaking");
              setStatus("Patient en train de parler");
            }

            if (serverContent?.interrupted) {
              shouldSendAudioRef.current = true;
              currentPatientEntryIdRef.current = null;
              outputTranscriptRef.current = "";
              player.interrupt();
              setConversationPhase("student-speaking");
              setStatus("L'étudiant a interrompu le patient");
            }

            for (const part of parts) {
              if (
                !part.inlineData?.data ||
                !part.inlineData.mimeType?.startsWith("audio/pcm")
              ) {
                continue;
              }

              const binary = Uint8Array.from(
                atob(part.inlineData.data),
                (char) => char.charCodeAt(0),
              ).buffer;

              player.playChunk(binary);
            }

            if (serverContent?.generationComplete) {
              setConversationPhase("processing");
              setStatus("Réponse du patient générée");
            }

            if (serverContent?.waitingForInput) {
              shouldSendAudioRef.current = true;
              await finalizeStudentDraft();
              outputTranscriptRef.current = "";
              currentPatientEntryIdRef.current = null;
              setShowStudentDraftIndicator(false);
              setConversationPhase("listening");
              setStatus("En attente de l'étudiant");
            }

            if (serverContent?.turnComplete) {
              shouldSendAudioRef.current = true;
              await finalizeStudentDraft();
              outputTranscriptRef.current = "";
              currentPatientEntryIdRef.current = null;
              setShowStudentDraftIndicator(false);
              setConversationPhase("listening");
              setStatus("En attente de l'étudiant");
            }
          },

          onerror: (error) => {
            shouldSendAudioRef.current = true;
            setStatus(`Erreur Live : ${error.message}`);
            setConversationPhase("idle");
            setShowStudentDraftIndicator(false);
          },

          onclose: () => {
            shouldSendAudioRef.current = true;
            setStatus("Session Live fermée");
            setConversationPhase("idle");
            setShowStudentDraftIndicator(false);
          },
        },
      })) as LiveSession;

      sessionRef.current = session;

      const microphone = await startMicrophoneStream(
        async (chunk) => {
          if (
            !shouldSendAudioRef.current ||
            isPaused ||
            isMicMutedRef.current
          ) {
            return;
          }

          studentTurnAudioChunksRef.current.push(chunk);

          const arrayBuffer = await chunk.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          const base64Audio = uint8ToBase64(uint8);

          session.sendRealtimeInput?.({
            audio: {
              data: base64Audio,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        },
        (sample: MicrophoneLevelSample) => {
          if (isMicMutedRef.current) {
            setMicLevel(0);
            setMicPeak(0);
            return;
          }

          setMicLevel(sample.rms);
          setMicPeak(sample.peak);
        },
        mediaStream,
      );

      micRef.current = microphone;

      setTranscript([
        createTranscriptEntry(
          "system",
          parsedCase.patientName
            ? `Session démarrée pour ${parsedCase.patientName}. Parlez pour lancer l'entretien.`
            : "Session démarrée. Parlez pour lancer l'entretien.",
        ),
      ]);

      setIsDiscussing(true);
      setIsPaused(false);
      setConversationPhase("listening");
      setStatus("Session Live ouverte, en attente de l'étudiant");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";

      shouldSendAudioRef.current = true;
      setStatus(`Impossible de démarrer : ${message}`);
      setConversationPhase("idle");
      setShowStudentDraftIndicator(false);
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur : ${message}`),
      ]);
    } finally {
      setIsConnecting(false);
    }
  }

  async function stopDiscussion() {
    setStatus("Fermeture de la discussion");

    try {
      shouldSendAudioRef.current = false;
      await finalizeStudentDraft();
      sessionRef.current?.sendRealtimeInput?.({ audioStreamEnd: true });

      const mixedBlob = await stopMixedRecorder();

      if (mixedBlob) {
        const nextUrl = URL.createObjectURL(mixedBlob);
        recordedAudioUrlRef.current = nextUrl;
        setRecordedAudioUrl(nextUrl);
      }

      await micRef.current?.stop();
      sessionRef.current?.close();
      await playerRef.current?.close();
    } finally {
      micRef.current = null;
      sessionRef.current = null;
      playerRef.current = null;
      shouldSendAudioRef.current = true;
      inputTranscriptRef.current = "";
      outputTranscriptRef.current = "";
      currentPatientEntryIdRef.current = null;
      studentTurnAudioChunksRef.current = [];
      isFinalizingStudentRef.current = false;
      setShowStudentDraftIndicator(false);
      setIsDiscussing(false);
      setIsPaused(false);
      setHasEndedDiscussion(true);
      setConversationPhase("idle");
      setStatus("Discussion terminée. Transcription prête pour évaluation.");
      setMicLevel(0);
      setMicPeak(0);
      setShowTranscriptReview(true);
    }
  }

  async function evaluateDiscussion() {
    try {
      setIsEvaluating(true);
      setStatus("Évaluation de la transcription");

      const cleanedTranscript = transcriptToPlainText(
        transcript
          .filter((entry) => entry.text.trim().length > 0)
          .map((entry) => ({
            role: entry.role,
            text: entry.text.trim(),
          })),
      );

      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: cleanedTranscript,
          gradingGrid: parsedCase.gradingGrid,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setEvaluationProgress(100);

      const result = (await response.json()) as EvaluationResult;
      setEvaluation(result);
      setStatus("Évaluation terminée");
      setShowTranscriptReview(true);

      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur d'évaluation inconnue";

      setStatus(`Échec de l'évaluation : ${message}`);
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur d'évaluation : ${message}`),
      ]);
    } finally {
      setTimeout(() => setIsEvaluating(false), 250);
    }
  }

  function exportPdf() {
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) {
      return;
    }

    popup.document.open();
    popup.document.write(buildPdfDocument(parsedCase, transcript, evaluation));
    popup.document.close();
    popup.focus();
    popup.print();
  }

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [transcript, showStudentDraftIndicator]);

  useEffect(() => {
    if (!isDiscussing) {
      return;
    }

    if (remainingSeconds <= 0) {
      void stopDiscussion();
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => current - 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isDiscussing, remainingSeconds]);

  useEffect(() => {
    if (!isEvaluating) {
      setEvaluationProgress(0);
      return;
    }

    setEvaluationProgress(8);
    const interval = window.setInterval(() => {
      setEvaluationProgress((current) => {
        if (current >= 92) {
          return current;
        }
        return current + Math.max(1, Math.round((100 - current) / 10));
      });
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [isEvaluating]);

  useEffect(() => {
    return () => {
      shouldSendAudioRef.current = false;
      void stopMixedRecorder();
      void micRef.current?.stop();
      sessionRef.current?.close();
      void playerRef.current?.close();

      if (recordedAudioUrlRef.current) {
        URL.revokeObjectURL(recordedAudioUrlRef.current);
      }
    };
  }, []);

  // Theme classes
  const theme = darkMode ? "dark" : "light";
  const bgClass = darkMode
    ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
    : "bg-gradient-to-br from-slate-50 via-white to-slate-100";
  const textClass = darkMode ? "text-slate-100" : "text-slate-900";
  const cardBg = darkMode
    ? "bg-slate-900/80 border-slate-700/50"
    : "bg-white/90 border-slate-200/60";
  const subCardBg = darkMode
    ? "bg-slate-800/60 border-slate-700/40"
    : "bg-slate-50/80 border-slate-200/50";
  const inputBg = darkMode
    ? "bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-white border-slate-200 text-slate-900 placeholder-slate-400";
  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";
  const subtleBg = darkMode ? "bg-slate-800/40" : "bg-slate-100/60";

  // Status indicator
  const getStatusColor = () => {
    switch (conversationPhase) {
      case "idle":
        return "bg-slate-400";
      case "listening":
        return "bg-emerald-500";
      case "student-speaking":
        return "bg-blue-500";
      case "patient-speaking":
        return "bg-primary-500";
      case "processing":
        return "bg-amber-500";
      case "paused":
        return "bg-rose-500";
      default:
        return "bg-slate-400";
    }
  };

  const getStatusLabel = () => {
    switch (conversationPhase) {
      case "idle":
        return "Inactif";
      case "listening":
        return "En écoute";
      case "student-speaking":
        return "Étudiant";
      case "patient-speaking":
        return "Patient";
      case "processing":
        return "Traitement";
      case "paused":
        return "En pause";
      default:
        return "Inactif";
    }
  };

  return (
    <div className={`min-h-screen ${bgClass} ${textClass} transition-colors duration-300`}>
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-slate-200/20 dark:border-slate-700/20">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/20">
                <ActivityIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">ECOS-AI</h1>
                <p className={`text-xs ${mutedText}`}>Simulateur d'examen clinique</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {patientInfo.length > 0 && (
                <div className={`flex items-center gap-3 px-4 py-2 rounded-xl ${subCardBg} border`}>
                  <UserIcon className={`w-4 h-4 ${mutedText}`} />
                  <div className="text-sm">
                    <span className="font-semibold">{parsedCase.patientName || "Patient"}</span>
                    <span className={`${mutedText} ml-2`}>{parsedCase.patientAge}</span>
                  </div>
                </div>
              )}

              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2.5 rounded-xl border transition-all duration-200 ${
                  darkMode
                    ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
                aria-label="Basculer le mode sombre"
              >
                {darkMode ? (
                  <SunIcon className="w-5 h-5 text-amber-400" />
                ) : (
                  <MoonIcon className="w-5 h-5 text-slate-600" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-6">
          {/* Left Sidebar */}
          <div className="space-y-6">
            {/* Case Input */}
            <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileTextIcon className="w-5 h-5 text-primary-500" />
                  Configuration du cas
                </h2>
                <button
                  onClick={handleParse}
                  className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors shadow-sm shadow-primary-500/20"
                >
                  Analyser
                </button>
              </div>

              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="Collez ici la trame du patient et la grille de correction..."
                className={`w-full h-64 p-4 rounded-xl border resize-none text-sm leading-relaxed transition-all duration-200 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 ${inputBg}`}
              />

              {parseError ? (
                <div className="mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-sm">
                  {parseError}
                </div>
              ) : (
                <p className={`mt-3 text-xs ${mutedText}`}>
                  Le parser détecte automatiquement les sections patient et grille.
                </p>
              )}
            </div>

            {/* Patient Info */}
            <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-primary-500" />
                Informations patient
              </h2>

              {patientInfo.length === 0 ? (
                <div className={`p-6 rounded-xl ${subtleBg} text-center`}>
                  <p className={`text-sm ${mutedText}`}>
                    Les informations patient apparaîtront ici après le parsing.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {patientInfo.map((item) => (
                    <div
                      key={`${item.label}-${item.value}`}
                      className={`p-3 rounded-xl ${subCardBg} border`}
                    >
                      <div className={`text-xs font-medium uppercase tracking-wider ${mutedText} mb-1`}>
                        {item.label}
                      </div>
                      <div className="text-sm font-medium">{item.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main Panel */}
          <div className="space-y-6">
            {/* Session Controls */}
            <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${conversationPhase !== "idle" ? "animate-pulse" : ""}`} />
                  <div>
                    <h2 className="text-lg font-semibold">Session de discussion</h2>
                    <p className={`text-sm ${mutedText}`}>{status}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${subtleBg}`}>
                    {getStatusLabel()}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={startDiscussion}
                    disabled={!canStart}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                      canStart
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <PlayIcon className="w-4 h-4" />
                    {isConnecting ? "Connexion..." : "Démarrer"}
                  </button>

                  <button
                    onClick={togglePauseDiscussion}
                    disabled={!canPause && !isPaused}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                      canPause || isPaused
                        ? "bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <PauseIcon className="w-4 h-4" />
                    {isPaused ? "Reprendre" : "Pause"}
                  </button>

                  <button
                    onClick={stopDiscussion}
                    disabled={!canEnd}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                      canEnd
                        ? "bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white shadow-lg shadow-slate-500/20"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <StopIcon className="w-4 h-4" />
                    Terminer
                  </button>

                  <button
                    onClick={evaluateDiscussion}
                    disabled={!canJudge}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                      canJudge
                        ? "bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-500/20"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <CheckIcon className="w-4 h-4" />
                    Évaluer
                  </button>
                </div>
              </div>
            </div>

            {/* Discussion Area */}
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              {/* Sidebar: Timer & Audio */}
              <div className="space-y-6">
                {/* Timer */}
                <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
                  <div className="flex items-center gap-2 mb-4">
                    <ClockIcon className={`w-4 h-4 ${mutedText}`} />
                    <span className={`text-sm font-medium ${mutedText}`}>Temps restant</span>
                  </div>

                  <div className={`text-center text-5xl font-bold tabular-nums tracking-tight ${
                    timerDanger ? "text-rose-500 animate-pulse" : ""
                  }`}>
                    {formatCountdown(remainingSeconds)}
                  </div>

                  <div className="mt-4">
                    <div className={`h-2 rounded-full overflow-hidden ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          timerDanger ? "bg-rose-500" : "bg-primary-500"
                        }`}
                        style={{
                          width: `${Math.max(0, Math.min(100, (remainingSeconds / (8 * 60)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Audio Level */}
                <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
                  <div className="mb-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        {isMicMuted ? (
                          <MicOffIcon className={`w-4 h-4 ${mutedText}`} />
                        ) : (
                          <MicIcon className={`w-4 h-4 ${mutedText}`} />
                        )}
                        <span className={`text-sm font-medium ${mutedText}`}>Microphone</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                            isMicMuted
                              ? "text-rose-600 dark:text-rose-300"
                              : "text-emerald-600 dark:text-emerald-300"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isMicMuted ? "bg-rose-500" : "bg-emerald-500"
                            }`}
                          />
                          {isMicMuted ? "Coupé" : "Actif"}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={toggleMicMute}
                      className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold border transition-all duration-200 ${
                        isMicMuted
                          ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                          : "border-slate-200 bg-slate-900 text-white hover:bg-slate-800 dark:border-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                      }`}
                      aria-pressed={isMicMuted}
                      aria-label={
                        isMicMuted
                          ? "Réactiver le microphone"
                          : "Couper le microphone"
                      }
                    >
                      {isMicMuted ? (
                        <MicOffIcon className="w-4 h-4" />
                      ) : (
                        <MicIcon className="w-4 h-4" />
                      )}
                      {isMicMuted ? "Réactiver le microphone" : "Couper le microphone"}
                    </button>
                  </div>

                  {/* Circular Audio Visualizer */}
                  <div className="relative w-40 h-40 mx-auto">
                    <div className={`absolute inset-0 rounded-full ${darkMode ? "bg-slate-800/30" : "bg-primary-100/50"}`} />
                    {Array.from({ length: 36 }, (_, i) => {
                      const angle = (360 / 36) * i;
                      const displayPeak = isMicMuted ? 0 : micPeak;
                      const active = !isMicMuted && i < Math.max(3, Math.round(displayPeak * 36));
                      const barHeight = active ? 16 + displayPeak * 24 : 8;

                      return (
                        <div
                          key={i}
                          className="absolute left-1/2 top-1/2 origin-bottom rounded-full"
                          style={{
                            width: 4,
                            height: barHeight,
                            transform: `translate(-50%, -100%) rotate(${angle}deg) translateY(-48px)`,
                            background: active
                              ? "linear-gradient(to top, #0d9488, #14b8a6)"
                              : isMicMuted
                                ? darkMode
                                  ? "rgba(244, 63, 94, 0.16)"
                                  : "rgba(244, 63, 94, 0.18)"
                              : darkMode
                                ? "rgba(148, 163, 184, 0.2)"
                                : "rgba(148, 163, 184, 0.3)",
                          }}
                        />
                      );
                    })}
                    <div className={`absolute inset-0 m-auto w-20 h-20 rounded-full flex items-center justify-center ${
                      darkMode ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200"
                    }`}>
                      <span className="text-center">
                        <span className="block text-2xl font-bold">
                          {isMicMuted ? "OFF" : Math.round(micPeak * 100)}
                        </span>
                        <span className={`block text-[10px] font-semibold uppercase tracking-[0.18em] ${mutedText}`}>
                          {isMicMuted ? "Muted" : "Peak"}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className={`mt-4 text-center text-xs ${mutedText}`}>
                    {isMicMuted
                      ? "Le microphone est coupé. Votre voix n'est pas envoyée."
                      : `RMS: ${formatPercent(micLevel)} | Peak: ${formatPercent(micPeak)}`}
                  </div>
                </div>
              </div>

              {/* Transcript */}
              <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
                <h3 className="text-lg font-semibold mb-4">Transcription en direct</h3>
                <div
                  ref={transcriptRef}
                  className={`h-[500px] overflow-y-auto rounded-xl p-4 ${
                    darkMode ? "bg-slate-950/50" : "bg-slate-50/80"
                  }`}
                >
                  {transcript.length === 0 && !showStudentDraftIndicator ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl ${subtleBg} flex items-center justify-center`}>
                          <ActivityIcon className={`w-8 h-8 ${mutedText}`} />
                        </div>
                        <p className={`text-sm ${mutedText}`}>
                          La transcription apparaîtra ici
                        </p>
                        <p className={`text-xs ${mutedText} mt-1`}>
                          Démarrez une session pour commencer
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {transcript.map((entry) => (
                        <div
                          key={entry.id}
                          className={`max-w-[85%] animate-fade-in ${
                            entry.role === "student"
                              ? "ml-auto"
                              : entry.role === "patient"
                                ? "mr-auto"
                                : "mx-auto"
                          }`}
                        >
                          <div
                            className={`rounded-2xl px-4 py-3 ${
                              entry.role === "student"
                                ? "bg-primary-600 text-white"
                                : entry.role === "patient"
                                  ? darkMode
                                    ? "bg-slate-800 border border-slate-700"
                                    : "bg-white border border-slate-200 shadow-sm"
                                  : "bg-slate-200/50 dark:bg-slate-800/50 text-center"
                            }`}
                          >
                            <div className={`flex items-center justify-between gap-4 text-[10px] uppercase tracking-wider mb-1.5 ${
                              entry.role === "student"
                                ? "text-primary-100"
                                : entry.role === "patient"
                                  ? mutedText
                                  : mutedText
                            }`}>
                              <span className="font-semibold">{entry.role}</span>
                              <span>{entry.timestamp}</span>
                            </div>
                            <div className="text-sm leading-relaxed whitespace-pre-wrap">
                              {entry.text}
                            </div>
                          </div>
                        </div>
                      ))}

                      {showStudentDraftIndicator && (
                        <div className="ml-auto max-w-[85%] animate-fade-in">
                          <div className="bg-primary-600/90 text-white rounded-2xl px-4 py-3">
                            <div className="flex items-center justify-between gap-4 text-[10px] uppercase tracking-wider mb-1.5 text-primary-100">
                              <span className="font-semibold">étudiant</span>
                              <span>{createTimestamp()}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span>En train de parler</span>
                              <span className="flex gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-bounce" />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-bounce [animation-delay:150ms]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-bounce [animation-delay:300ms]" />
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Audio Replay */}
            {recordedAudioUrl && (
              <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
                <h3 className="text-lg font-semibold mb-4">Enregistrement audio</h3>
                <div className={`p-4 rounded-xl ${subCardBg} border`}>
                  <audio controls className="w-full" src={recordedAudioUrl}>
                    Votre navigateur ne supporte pas la lecture audio.
                  </audio>
                </div>
              </div>
            )}

            {/* Transcript Review */}
            {transcript.length > 0 && (
              <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Revue de transcription</h3>
                  <button
                    onClick={() => setShowTranscriptReview(!showTranscriptReview)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      showTranscriptReview
                        ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                        : subtleBg
                    }`}
                  >
                    {showTranscriptReview ? "Masquer" : "Afficher"}
                  </button>
                </div>

                {showTranscriptReview && (
                  <>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(["full", "patient", "student", "system"] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setTranscriptFilter(filter)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            transcriptFilter === filter
                              ? "bg-primary-600 text-white shadow-md shadow-primary-500/20"
                              : `${subtleBg} hover:bg-slate-200 dark:hover:bg-slate-700`
                          }`}
                        >
                          {filter === "full"
                            ? "Complet"
                            : filter === "patient"
                              ? "Patient"
                              : filter === "student"
                                ? "Étudiant"
                                : "Système"}
                        </button>
                      ))}
                    </div>
                    <div className={`max-h-64 overflow-y-auto rounded-xl p-4 ${subtleBg} text-sm leading-relaxed`}>
                      <pre className="whitespace-pre-wrap font-sans">
                        {filteredTranscriptText || "Aucune transcription pour ce filtre."}
                      </pre>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Results */}
            <div ref={resultsRef} className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Résultats d'évaluation</h2>
                <button
                  onClick={exportPdf}
                  disabled={!evaluation}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    evaluation
                      ? "bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <FileTextIcon className="w-4 h-4" />
                  Export PDF
                </button>
              </div>

              {!evaluation ? (
                <div className={`p-12 rounded-xl ${subtleBg} text-center`}>
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl ${subtleBg} flex items-center justify-center`}>
                    <CheckIcon className={`w-8 h-8 ${mutedText}`} />
                  </div>
                  <p className={`text-sm ${mutedText}`}>
                    Les résultats d'évaluation apparaîtront ici après la correction.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
                  {/* Score Card */}
                  <div className={`rounded-xl ${subCardBg} border p-6`}>
                    <div className={`text-sm font-medium uppercase tracking-wider ${mutedText} mb-4`}>
                      Note finale
                    </div>
                    <div className="text-center">
                      <div className="text-6xl font-bold mb-2">{evaluation.score}</div>
                      <div className={`text-sm ${mutedText} mb-4`}>Évaluation complète</div>
                    </div>
                    <div className={`h-3 rounded-full overflow-hidden ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${scoreState.ratio * 100}%`,
                          background: scoreGradient(scoreState.ratio),
                        }}
                      />
                    </div>
                    <div
                      className="text-center text-sm font-semibold mt-3"
                      style={{ color: scoreColor(scoreState.ratio) }}
                    >
                      {scoreState.value} / {scoreState.max} points
                    </div>
                  </div>

                  {/* Details Table */}
                  <div className={`rounded-xl ${subCardBg} border overflow-hidden`}>
                    <table className="w-full text-sm">
                      <thead className={`${darkMode ? "bg-slate-800" : "bg-slate-100"}`}>
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold">Critère</th>
                          <th className="text-left px-4 py-3 font-semibold">Résultat</th>
                          <th className="text-left px-4 py-3 font-semibold">Feedback</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {evaluation.details.map((detail, index) => (
                          <tr key={`${detail.criterion}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-3 align-top font-medium">{detail.criterion}</td>
                            <td className="px-4 py-3 align-top">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  detail.observed
                                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                    : "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"
                                }`}
                              >
                                {detail.observed ? (
                                  <>
                                    <CheckIcon className="w-3 h-3" />
                                    Observé
                                  </>
                                ) : (
                                  <>
                                    <span className="w-3 h-3 flex items-center justify-center">×</span>
                                    Non observé
                                  </>
                                )}
                              </span>
                            </td>
                            <td className={`px-4 py-3 align-top ${mutedText}`}>{detail.feedback}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Evaluation Modal */}
      {isEvaluating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border ${cardBg} p-8 shadow-2xl`}>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <ActivityIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="text-xl font-bold mb-2">Évaluation en cours</h3>
              <p className={`text-sm ${mutedText} mb-6`}>
                Analyse du transcript face à la grille de correction...
              </p>
            </div>

            <div className={`h-3 rounded-full overflow-hidden ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
              <div
                className="h-full rounded-full bg-primary-500 transition-all duration-300"
                style={{ width: `${evaluationProgress}%` }}
              />
            </div>

            <div className="mt-4 text-center">
              <span className="text-2xl font-bold">{evaluationProgress}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
