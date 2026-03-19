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
import type {
  AppSettings,
  DashboardSnapshot,
  EvaluationResult,
  ParsedCase,
  TranscriptEntry,
} from "./types";

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

function formatElapsedDiscussion(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  const minuteLabel = minutes === "01" ? "minute" : "minutes";
  const secondLabel = seconds === "01" ? "seconde" : "secondes";
  return `${minutes} ${minuteLabel} et ${seconds} ${secondLabel}`;
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

function sumModalityTokens(
  entries:
    | Array<{ modality?: string; tokens?: number; tokenCount?: number }>
    | undefined,
  target: "text" | "audio",
) {
  return (entries ?? []).reduce((total, entry) => {
    const modality = entry.modality?.toLowerCase() ?? "";
    if (!modality.includes(target)) {
      return total;
    }

    return total + (entry.tokens ?? entry.tokenCount ?? 0);
  }, 0);
}

function extractLiveUsageCounts(usageMetadata?: {
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_tokens?: number;
  inputTokensByModality?: Array<{ modality?: string; tokens?: number; tokenCount?: number }>;
  outputTokensByModality?: Array<{ modality?: string; tokens?: number; tokenCount?: number }>;
  input_tokens_by_modality?: Array<{ modality?: string; tokens?: number; tokenCount?: number }>;
  output_tokens_by_modality?: Array<{ modality?: string; tokens?: number; tokenCount?: number }>;
}) {
  const inputEntries =
    usageMetadata?.inputTokensByModality ?? usageMetadata?.input_tokens_by_modality;
  const outputEntries =
    usageMetadata?.outputTokensByModality ?? usageMetadata?.output_tokens_by_modality;
  const inputTextTokens = sumModalityTokens(inputEntries, "text");
  const inputAudioTokens = sumModalityTokens(inputEntries, "audio");
  const outputTextTokens = sumModalityTokens(outputEntries, "text");
  const outputAudioTokens = sumModalityTokens(outputEntries, "audio");
  const totalInputTokens =
    usageMetadata?.totalInputTokens ?? usageMetadata?.total_input_tokens ?? inputTextTokens + inputAudioTokens;
  const totalOutputTokens =
    usageMetadata?.totalOutputTokens ?? usageMetadata?.total_output_tokens ?? outputTextTokens + outputAudioTokens;

  return {
    inputTextTokens,
    inputAudioTokens,
    outputTextTokens,
    outputAudioTokens,
    totalInputTokens,
    totalOutputTokens,
    totalTokens:
      usageMetadata?.totalTokens ??
      usageMetadata?.total_tokens ??
      totalInputTokens + totalOutputTokens,
  };
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
  if (ratio >= 0.75) {
    return "linear-gradient(90deg, #16a34a, #22c55e)";
  }

  if (ratio >= 0.45) {
    return "linear-gradient(90deg, #ca8a04, #eab308)";
  }

  return "linear-gradient(90deg, #dc2626, #f87171)";
}

function scoreColor(ratio: number) {
  if (ratio >= 0.75) {
    return "#15803d";
  }

  if (ratio >= 0.45) {
    return "#a16207";
  }

  return "#b91c1c";
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

function formatFeedbackDetailLabel(level: AppSettings["feedbackDetailLevel"]) {
  switch (level) {
    case "brief":
      return "Brief";
    case "detailed":
      return "Detailed";
    default:
      return "Standard";
  }
}

function buildTranscriptCopy(
  transcript: TranscriptEntry[],
  showSystemMessages: boolean,
) {
  return transcript
    .filter((entry) => {
      if (!entry.text.trim()) {
        return false;
      }

      if (!showSystemMessages && entry.role === "system") {
        return false;
      }

      return true;
    })
    .map((entry) => `[${entry.timestamp}] ${entry.role.toUpperCase()}\n${entry.text}`)
    .join("\n\n");
}

function buildEvaluationCopy(evaluation: EvaluationResult) {
  return [
    `Note finale: ${evaluation.score}`,
    "",
    ...evaluation.details.map(
      (detail, index) =>
        `${index + 1}. ${detail.criterion}\nRésultat: ${
          detail.observed ? "Observé" : "Non observé"
        }\nFeedback: ${detail.feedback}`,
    ),
  ].join("\n\n");
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

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
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

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ResetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v6h6" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
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

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.59 3H10.5a2 2 0 1 1 4 0h-.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

type PsPageProps = {
  currentMode: "ps" | "sans-ps";
  onNavigate: (mode: "ps" | "sans-ps") => void;
  settings: AppSettings;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  darkMode: boolean;
  onDarkModeChange: (value: boolean) => void;
};

export default function App({
  currentMode,
  onNavigate,
  settings,
  onOpenDashboard,
  onOpenSettings,
  darkMode,
  onDarkModeChange,
}: PsPageProps) {
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
  const [status, setStatus] = useState("Mode PS/PSS prêt");
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationProgress, setEvaluationProgress] = useState(0);
  const [conversationPhase, setConversationPhase] =
    useState<ConversationPhase>("idle");
  const [showStudentDraftIndicator, setShowStudentDraftIndicator] =
    useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micPeak, setMicPeak] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(
    settings.defaultTimerSeconds,
  );
  const [completionToast, setCompletionToast] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [evaluationWarning, setEvaluationWarning] = useState<{
    mode: "confirm" | "blocked";
    title: string;
    body: string;
  } | null>(null);
  const [sessionGuardDialog, setSessionGuardDialog] = useState<{
    action: "reset" | "clear";
    title: string;
    body: string;
  } | null>(null);
  const [readinessDialog, setReadinessDialog] = useState<{
    mode: "confirm" | "blocked";
    title: string;
    body: string;
  } | null>(null);
  const [lastEvaluatedFeedbackDetailLevel, setLastEvaluatedFeedbackDetailLevel] =
    useState<AppSettings["feedbackDetailLevel"] | null>(null);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const completionToastTimerRef = useRef<number | null>(null);

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
  const autoEvaluateHandledRef = useRef(false);
  const autoExportedEvaluationRef = useRef<string | null>(null);
  const shouldSendAudioRef = useRef(true);
  const isMicMutedRef = useRef(false);
  const currentSessionIdRef = useRef<string | null>(null);
  const lastLiveUsageTotalsRef = useRef({
    inputTextTokens: 0,
    inputAudioTokens: 0,
    outputTextTokens: 0,
    outputAudioTokens: 0,
    totalTokens: 0,
  });

  const patientInfo = useMemo(() => extractPatientInfo(parsedCase), [parsedCase]);
  const sessionDurationSeconds = settings.defaultTimerSeconds;

  const parsedReady = Boolean(parsedCase.patientScript && parsedCase.gradingGrid);
  const canStart =
    parsedReady &&
    !isConnecting &&
    !isDiscussing &&
    !isPaused &&
    !hasEndedDiscussion;
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
  const canResetSession =
    !isConnecting &&
    !isEvaluating &&
    !isDiscussing &&
    !isPaused &&
    (transcript.length > 0 ||
      evaluation !== null ||
      recordedAudioUrl !== null ||
      hasEndedDiscussion ||
      completionToast !== null ||
      evaluationWarning !== null);
  const canClearText =
    !isConnecting &&
    !isEvaluating &&
    !isDiscussing &&
    !isPaused &&
    (rawInput.trim().length > 0 ||
      parsedReady ||
      parseError.length > 0 ||
      transcript.length > 0 ||
      evaluation !== null ||
      recordedAudioUrl !== null ||
      hasEndedDiscussion);

  const scoreState = parseScore(evaluation?.score);
  const timerDanger = remainingSeconds <= 60;
  const canSwitchModes = !isDiscussing && !isPaused;
  const transcriptForDisplay = useMemo(() => {
    const withVisibleRoles = settings.showSystemMessages
      ? transcript
      : transcript.filter((entry) => entry.role !== "system");

    if (settings.showLiveTranscript || hasEndedDiscussion) {
      return withVisibleRoles;
    }

    return [];
  }, [
    hasEndedDiscussion,
    settings.showLiveTranscript,
    settings.showSystemMessages,
    transcript,
  ]);
  const showLiveTranscriptContent =
    settings.showLiveTranscript || hasEndedDiscussion;
  const showDraftIndicatorForDisplay =
    showStudentDraftIndicator && showLiveTranscriptContent;
  const transcriptCopyText = useMemo(
    () => buildTranscriptCopy(transcript, settings.showSystemMessages),
    [settings.showSystemMessages, transcript],
  );
  const canCopyTranscript =
    (settings.showLiveTranscript || hasEndedDiscussion) &&
    transcriptCopyText.trim().length > 0;
  const evaluationCopyText = evaluation ? buildEvaluationCopy(evaluation) : "";
  const canRerunEvaluation =
    Boolean(evaluation) &&
    !isEvaluating &&
    lastEvaluatedFeedbackDetailLevel !== null &&
    lastEvaluatedFeedbackDetailLevel !== settings.feedbackDetailLevel;

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
    setLastEvaluatedFeedbackDetailLevel(null);
    setHasEndedDiscussion(false);
    setCompletionToast(null);

    if (!parsed.patientScript || !parsed.gradingGrid) {
      setParseError(
        "Le parser n'a pas trouvé les deux sections clairement. Vérifie les intitulés ou les séparateurs.",
      );
    } else {
      setParseError("");
    }

    setStatus(
      parsed.patientScript && parsed.gradingGrid
        ? "Cas préparé"
        : "Mode PS/PSS prêt",
    );
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
            googleApiKey: settings.googleApiKey || undefined,
            sessionId: currentSessionIdRef.current || undefined,
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

  async function fetchReadinessSnapshot() {
    const response = await fetch("/api/dashboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        googleApiKey: settings.googleApiKey || undefined,
        window: "1h",
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as DashboardSnapshot;
  }

  async function startDiscussionInternal() {
    try {
      currentSessionIdRef.current = crypto.randomUUID();
      setIsConnecting(true);
      setHasEndedDiscussion(false);
      setCompletionToast(null);
      setStatus("Demande de jeton temporaire");
      setEvaluation(null);
      setRemainingSeconds(sessionDurationSeconds);
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
      lastLiveUsageTotalsRef.current = {
        inputTextTokens: 0,
        inputAudioTokens: 0,
        outputTextTokens: 0,
        outputAudioTokens: 0,
        totalTokens: 0,
      };

      const mediaStream = await requestMicrophoneStream();

      const tokenResponse = await fetch("/api/live-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientScript: parsedCase.patientScript,
          googleApiKey: settings.googleApiKey || undefined,
          sessionId: currentSessionIdRef.current,
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
              usageMetadata?: {
                totalInputTokens?: number;
                totalOutputTokens?: number;
                totalTokens?: number;
                total_input_tokens?: number;
                total_output_tokens?: number;
                total_tokens?: number;
                inputTokensByModality?: Array<{ modality?: string; tokens?: number; tokenCount?: number }>;
                outputTokensByModality?: Array<{ modality?: string; tokens?: number; tokenCount?: number }>;
                input_tokens_by_modality?: Array<{ modality?: string; tokens?: number; tokenCount?: number }>;
                output_tokens_by_modality?: Array<{ modality?: string; tokens?: number; tokenCount?: number }>;
              };
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

            const liveUsage = extractLiveUsageCounts(liveMessage.usageMetadata);
            const previousUsage = lastLiveUsageTotalsRef.current;
            const liveUsageDelta = {
              inputTextTokens: Math.max(0, liveUsage.inputTextTokens - previousUsage.inputTextTokens),
              inputAudioTokens: Math.max(0, liveUsage.inputAudioTokens - previousUsage.inputAudioTokens),
              outputTextTokens: Math.max(0, liveUsage.outputTextTokens - previousUsage.outputTextTokens),
              outputAudioTokens: Math.max(0, liveUsage.outputAudioTokens - previousUsage.outputAudioTokens),
              totalTokens: Math.max(0, liveUsage.totalTokens - previousUsage.totalTokens),
            };

            if (
              currentSessionIdRef.current &&
              (liveUsageDelta.inputTextTokens > 0 ||
                liveUsageDelta.inputAudioTokens > 0 ||
                liveUsageDelta.outputTextTokens > 0 ||
                liveUsageDelta.outputAudioTokens > 0)
            ) {
              lastLiveUsageTotalsRef.current = {
                inputTextTokens: liveUsage.inputTextTokens,
                inputAudioTokens: liveUsage.inputAudioTokens,
                outputTextTokens: liveUsage.outputTextTokens,
                outputAudioTokens: liveUsage.outputAudioTokens,
                totalTokens: liveUsage.totalTokens,
              };

              void fetch("/api/usage/live", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  sessionId: currentSessionIdRef.current,
                  googleApiKey: settings.googleApiKey || undefined,
                  ...liveUsageDelta,
                }),
              });
            }

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

  async function startDiscussion() {
    try {
      const snapshot = await fetchReadinessSnapshot();

      if (snapshot.status === "blocked") {
        setReadinessDialog({
          mode: "blocked",
          title: "Session indisponible",
          body: snapshot.statusMessage,
        });
        return;
      }

      if (snapshot.status === "risky") {
        setReadinessDialog({
          mode: "confirm",
          title: "Session potentiellement instable",
          body: snapshot.statusMessage,
        });
        return;
      }

      await startDiscussionInternal();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Vérification indisponible.";
      setReadinessDialog({
        mode: "confirm",
        title: "Vérification indisponible",
        body: `${message} Vous pouvez continuer si vous souhaitez tenter le démarrage.`,
      });
    }
  }

  async function stopDiscussion() {
    setStatus("Fermeture de la discussion");
    let discussionFinished = false;
    let elapsedSummary = "";

    try {
      elapsedSummary = formatElapsedDiscussion(
        sessionDurationSeconds - remainingSeconds,
      );
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
      discussionFinished = true;
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

      if (discussionFinished) {
        setCompletionToast({
          title: "Discussion terminée",
          body: `Vous avez fini en ${elapsedSummary}.`,
        });
      }
    }
  }

  async function copyTextToClipboard(text: string, successMessage: string) {
    if (!text.trim() || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setCompletionToast({
      title: "Copie effectuée",
      body: successMessage,
    });
  }

  async function resetSessionState() {
    try {
      shouldSendAudioRef.current = false;

      if (completionToastTimerRef.current) {
        window.clearTimeout(completionToastTimerRef.current);
        completionToastTimerRef.current = null;
      }

      setCompletionToast(null);
      setEvaluationWarning(null);
      await stopMixedRecorder();
      await micRef.current?.stop();
      sessionRef.current?.close();
      await playerRef.current?.close();
    } catch {
      //
    } finally {
      micRef.current = null;
      sessionRef.current = null;
      playerRef.current = null;
      mixedRecorderRef.current = null;
      shouldSendAudioRef.current = true;
      inputTranscriptRef.current = "";
      outputTranscriptRef.current = "";
      currentPatientEntryIdRef.current = null;
      studentTurnAudioChunksRef.current = [];
      isFinalizingStudentRef.current = false;
      autoEvaluateHandledRef.current = false;
      autoExportedEvaluationRef.current = null;
      setTranscript([]);
      setEvaluation(null);
      setLastEvaluatedFeedbackDetailLevel(null);
      setHasEndedDiscussion(false);
      setIsConnecting(false);
      setIsDiscussing(false);
      setIsPaused(false);
      setConversationPhase("idle");
      setStatus(parsedReady ? "Cas préparé" : "Mode PS/PSS prêt");
      setRemainingSeconds(settings.defaultTimerSeconds);
      setShowStudentDraftIndicator(false);
      setMicLevel(0);
      setMicPeak(0);
      setEvaluationProgress(0);
      setIsEvaluating(false);
      setIsMicMuted(false);
      isMicMutedRef.current = false;

      if (recordedAudioUrlRef.current) {
        URL.revokeObjectURL(recordedAudioUrlRef.current);
        recordedAudioUrlRef.current = null;
      }

      setRecordedAudioUrl(null);
    }
  }

  async function handleResetSession() {
    await resetSessionState();
    setCompletionToast({
      title: "Session réinitialisée",
      body: "La session a été vidée. Le texte collé est conservé.",
    });
  }

  async function handleClearText() {
    await resetSessionState();
    setRawInput("");
    setParsedCase(parseCaseInput(""));
    setParseError("");
    setStatus("Mode PS/PSS prêt");
  }

  function requestResetSession() {
    if (!canResetSession) {
      return;
    }

    setSessionGuardDialog({
      action: "reset",
      title: "Réinitialiser la session ?",
      body: "Cette action efface la transcription, l'audio et l'évaluation en cours, tout en conservant le texte collé.",
    });
  }

  function requestClearText() {
    if (!canClearText) {
      return;
    }

    setSessionGuardDialog({
      action: "clear",
      title: "Effacer le texte collé ?",
      body: "Cette action efface le texte, la session, la transcription et l'évaluation associée.",
    });
  }

  function confirmSessionGuardAction() {
    if (!sessionGuardDialog) {
      return;
    }

    const { action } = sessionGuardDialog;
    setSessionGuardDialog(null);

    if (action === "reset") {
      void handleResetSession();
      return;
    }

    void handleClearText();
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
          feedbackDetailLevel: settings.feedbackDetailLevel,
          googleApiKey: settings.googleApiKey || undefined,
          sessionId: currentSessionIdRef.current || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setEvaluationProgress(100);

      const result = (await response.json()) as EvaluationResult;
      setEvaluation(result);
      setLastEvaluatedFeedbackDetailLevel(settings.feedbackDetailLevel);
      setStatus("Évaluation terminée");

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

  function handleEvaluateClick() {
    const discussionDurationSeconds = sessionDurationSeconds - remainingSeconds;

    if (discussionDurationSeconds < 120) {
      setEvaluationWarning({
        mode: "blocked",
        title: "Evaluation unavailable",
        body: "Evaluation is unavailable for discussions shorter than 2 minutes. Please continue the discussion and try again.",
      });
      return;
    }

    if (discussionDurationSeconds < 180) {
      setEvaluationWarning({
        mode: "confirm",
        title: "Short discussion",
        body: "This discussion is shorter than 3 minutes, so the evaluation may be unreliable. Do you want to continue?",
      });
      return;
    }

    void evaluateDiscussion();
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

  function handleRerunEvaluation() {
    if (!canRerunEvaluation) {
      return;
    }

    void evaluateDiscussion();
  }

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [showDraftIndicatorForDisplay, transcriptForDisplay]);

  useEffect(() => {
    if (!isDiscussing && !isPaused) {
      setRemainingSeconds(settings.defaultTimerSeconds);
    }
  }, [isDiscussing, isPaused, settings.defaultTimerSeconds]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = settings.recordedAudioPlaybackRate;
    }
  }, [recordedAudioUrl, settings.recordedAudioPlaybackRate]);

  useEffect(() => {
    if (!hasEndedDiscussion) {
      autoEvaluateHandledRef.current = false;
      return;
    }

    if (
      !settings.autoEvaluateAfterEnd ||
      autoEvaluateHandledRef.current ||
      isEvaluating ||
      evaluation
    ) {
      return;
    }

    autoEvaluateHandledRef.current = true;
    handleEvaluateClick();
  }, [
    evaluation,
    hasEndedDiscussion,
    isEvaluating,
    remainingSeconds,
    settings.autoEvaluateAfterEnd,
  ]);

  useEffect(() => {
    if (!evaluation) {
      autoExportedEvaluationRef.current = null;
      return;
    }

    const evaluationKey = JSON.stringify(evaluation);
    if (
      settings.autoExportPdfAfterEvaluation &&
      autoExportedEvaluationRef.current !== evaluationKey
    ) {
      autoExportedEvaluationRef.current = evaluationKey;
      exportPdf();
    }
  }, [evaluation, settings.autoExportPdfAfterEvaluation]);

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
    if (completionToastTimerRef.current) {
      window.clearTimeout(completionToastTimerRef.current);
      completionToastTimerRef.current = null;
    }

    if (!completionToast) {
      return;
    }

    completionToastTimerRef.current = window.setTimeout(() => {
      setCompletionToast(null);
      completionToastTimerRef.current = null;
    }, 3000);

    return () => {
      if (completionToastTimerRef.current) {
        window.clearTimeout(completionToastTimerRef.current);
        completionToastTimerRef.current = null;
      }
    };
  }, [completionToast]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isConnecting && !isDiscussing && !isPaused) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isConnecting, isDiscussing, isPaused]);

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

      if (completionToastTimerRef.current) {
        window.clearTimeout(completionToastTimerRef.current);
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
    <div className={`min-h-screen ${theme} ${bgClass} ${textClass} transition-colors duration-300`}>
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

              <div className={`flex items-center rounded-xl border p-1 ${
                darkMode
                  ? "border-slate-700 bg-slate-800"
                  : "border-slate-200 bg-white"
              }`}>
                <button
                  type="button"
                  onClick={() => onNavigate("ps")}
                  disabled={currentMode !== "ps" && !canSwitchModes}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                    currentMode === "ps"
                      ? "bg-primary-600 text-white shadow-sm"
                      : !canSwitchModes
                        ? darkMode
                          ? "cursor-not-allowed text-slate-500"
                          : "cursor-not-allowed text-slate-300"
                      : darkMode
                        ? "text-slate-300 hover:bg-slate-700"
                        : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  PS / PSS
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("sans-ps")}
                  disabled={currentMode !== "sans-ps" && !canSwitchModes}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                    currentMode === "sans-ps"
                      ? "bg-primary-600 text-white shadow-sm"
                      : !canSwitchModes
                        ? darkMode
                          ? "cursor-not-allowed text-slate-500"
                          : "cursor-not-allowed text-slate-300"
                      : darkMode
                        ? "text-slate-300 hover:bg-slate-700"
                        : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Sans PS
                </button>
              </div>

              <button
                type="button"
                onClick={onOpenDashboard}
                className={`p-2.5 rounded-xl border transition-all duration-200 ${
                  darkMode
                    ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
                aria-label="Open dashboard"
              >
                <ActivityIcon className={`w-5 h-5 ${darkMode ? "text-slate-200" : "text-slate-600"}`} />
              </button>

              <button
                onClick={() => onDarkModeChange(!darkMode)}
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

              <button
                type="button"
                onClick={onOpenSettings}
                className={`p-2.5 rounded-xl border transition-all duration-200 ${
                  darkMode
                    ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
                aria-label="Open settings"
              >
                <SettingsIcon className={`w-5 h-5 ${darkMode ? "text-slate-200" : "text-slate-600"}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-[470px_1fr] gap-6">
          {/* Left Sidebar */}
          <div className="space-y-6">
            {/* Case Input */}
            <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
              <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <h2 className="flex min-w-0 items-center gap-2 whitespace-nowrap text-base font-semibold md:text-lg">
                  <FileTextIcon className="h-5 w-5 shrink-0 text-primary-500" />
                  <span>Configuration du cas</span>
                </h2>
                <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
                  <button
                    onClick={requestClearText}
                    disabled={!canClearText}
                    className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors md:px-4 md:text-sm ${
                      canClearText
                        ? darkMode
                          ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleParse}
                    className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white transition-colors shadow-sm shadow-primary-500/20 hover:bg-primary-700 md:px-4 md:text-sm"
                  >
                    Analyser
                  </button>
                </div>
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
              <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="flex min-w-0 items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${conversationPhase !== "idle" ? "animate-pulse" : ""}`} />
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">Session de discussion</h2>
                    <p className={`text-sm ${mutedText}`}>{status}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${subtleBg}`}>
                    {getStatusLabel()}
                  </span>
                </div>

                <div className="flex flex-nowrap items-center gap-3 lg:shrink-0">
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
                    {isPaused ? (
                      <PlayIcon className="w-4 h-4" />
                    ) : (
                      <PauseIcon className="w-4 h-4" />
                    )}
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
                    onClick={handleEvaluateClick}
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

                  <button
                    onClick={requestResetSession}
                    disabled={!canResetSession}
                    className={`flex min-w-[112px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-medium text-sm transition-all duration-200 ${
                      canResetSession
                        ? "bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white shadow-lg shadow-slate-500/20"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <ResetIcon className="w-4 h-4" />
                    Reset
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
                          width: `${Math.max(0, Math.min(100, (remainingSeconds / sessionDurationSeconds) * 100))}%`,
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
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Transcription en direct</h3>
                  <button
                    type="button"
                    onClick={() =>
                      void copyTextToClipboard(
                        transcriptCopyText,
                        "La transcription a été copiée.",
                      )
                    }
                    disabled={!canCopyTranscript}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      darkMode
                        ? "border-slate-700 bg-slate-100 text-slate-900 hover:bg-white"
                        : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-50"
                    } ${!canCopyTranscript ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <CopyIcon className="w-4 h-4" />
                    Copy transcript
                  </button>
                </div>
                <div
                  ref={transcriptRef}
                  className={`h-[500px] overflow-y-auto rounded-xl p-4 ${
                    darkMode ? "bg-slate-950/50" : "bg-slate-50/80"
                  }`}
                >
                  {transcriptForDisplay.length === 0 && !showDraftIndicatorForDisplay ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl ${subtleBg} flex items-center justify-center`}>
                          <ActivityIcon className={`w-8 h-8 ${mutedText}`} />
                        </div>
                        {!settings.showLiveTranscript && !hasEndedDiscussion ? (
                          <>
                            <p className={`text-sm ${mutedText}`}>
                              La transcription en direct est masquée
                            </p>
                            <p className={`text-xs ${mutedText} mt-1`}>
                              Elle sera visible à la fin de la session.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className={`text-sm ${mutedText}`}>
                              La transcription apparaîtra ici
                            </p>
                            <p className={`text-xs ${mutedText} mt-1`}>
                              Démarrez une session pour commencer
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {transcriptForDisplay.map((entry) => (
                        <div
                          key={entry.id}
                          className={`max-w-[85%] animate-fade-in ${
                            entry.role === "student"
                              ? "ml-auto"
                              : entry.role === "patient"
                                ? "mr-auto"
                                : "mx-auto max-w-full"
                          }`}
                        >
                          {entry.role === "system" ? (
                            <div className="mx-auto max-w-[78%] py-1.5 text-center">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`h-px flex-1 ${
                                    entry.text.toLowerCase().startsWith("erreur")
                                      ? darkMode
                                        ? "bg-rose-800/70"
                                        : "bg-rose-200"
                                      : darkMode
                                        ? "bg-slate-800"
                                        : "bg-slate-200"
                                  }`}
                                />
                                <span
                                  className={`max-w-[80%] text-[11px] font-medium leading-relaxed whitespace-pre-wrap ${
                                    entry.text.toLowerCase().startsWith("erreur")
                                      ? darkMode
                                        ? "text-rose-300"
                                        : "text-rose-700"
                                      : darkMode
                                        ? "text-slate-400"
                                        : "text-slate-500"
                                  }`}
                                >
                                  {entry.text}
                                </span>
                                <span
                                  className={`h-px flex-1 ${
                                    entry.text.toLowerCase().startsWith("erreur")
                                      ? darkMode
                                        ? "bg-rose-800/70"
                                        : "bg-rose-200"
                                      : darkMode
                                        ? "bg-slate-800"
                                        : "bg-slate-200"
                                  }`}
                                />
                              </div>
                              <div
                                className={`mt-1 text-[10px] ${
                                  darkMode ? "text-slate-500" : "text-slate-400"
                                }`}
                              >
                                {entry.timestamp}
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`rounded-2xl px-4 py-3 ${
                                entry.role === "student"
                                  ? "bg-primary-600 text-white"
                                  : darkMode
                                    ? "bg-slate-800 border border-slate-700"
                                    : "bg-white border border-slate-200 shadow-sm"
                              }`}
                            >
                              <div className={`flex items-center justify-between gap-4 text-[10px] uppercase tracking-wider mb-1.5 ${
                                entry.role === "student" ? "text-primary-100" : mutedText
                              }`}>
                                <span className="font-semibold">{entry.role}</span>
                                <span>{entry.timestamp}</span>
                              </div>
                              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                                {entry.text}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {showDraftIndicatorForDisplay && (
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
          </div>

          {/* Audio Replay */}
          {recordedAudioUrl && (
            <div className={`xl:col-span-2 rounded-2xl border ${cardBg} p-6 shadow-soft`}>
              <h3 className="text-lg font-semibold mb-4">Enregistrement audio</h3>
              <div className={`p-4 rounded-xl ${subCardBg} border`}>
                <audio ref={audioRef} controls className="w-full" src={recordedAudioUrl}>
                  Votre navigateur ne supporte pas la lecture audio.
                </audio>
              </div>
            </div>
          )}

          {/* Results */}
          <div ref={resultsRef} className={`xl:col-span-2 rounded-2xl border ${cardBg} p-6 shadow-soft`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Résultats d'évaluation</h2>
              <div className="flex items-center gap-2">
                {canRerunEvaluation && (
                  <button
                    onClick={handleRerunEvaluation}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white transition-all duration-200"
                  >
                    Re-run evaluation
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    void copyTextToClipboard(
                      evaluationCopyText,
                      "L'évaluation a été copiée.",
                    )
                  }
                  disabled={!evaluation}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                    darkMode
                      ? "border-slate-700 bg-slate-100 text-slate-900 hover:bg-white"
                      : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-50"
                  } ${!evaluation ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <CopyIcon className="w-4 h-4" />
                  Copy evaluation
                </button>
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
              <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 items-start">
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

                <div className={`rounded-xl ${subCardBg} border overflow-hidden`}>
                  <table className="w-full text-sm">
                    <thead className={`${darkMode ? "bg-slate-800" : "bg-slate-100"}`}>
                      <tr>
                        <th className="text-left px-6 py-4 font-semibold">Critère</th>
                        <th className="text-left px-6 py-4 font-semibold w-44">Résultat</th>
                        <th className="text-left px-6 py-4 font-semibold">
                          <div className="flex items-center gap-2">
                            <span>Feedback</span>
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                                darkMode
                                  ? "border-slate-700 bg-slate-800 text-slate-300"
                                  : "border-slate-200 bg-slate-100 text-slate-600"
                              }`}
                            >
                              {formatFeedbackDetailLabel(
                                lastEvaluatedFeedbackDetailLevel ??
                                  settings.feedbackDetailLevel,
                              )}
                            </span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {evaluation.details.map((detail, index) => (
                        <tr
                          key={`${detail.criterion}-${index}`}
                          className={darkMode ? "bg-slate-900/20" : "bg-white"}
                        >
                          <td className="px-6 py-5 align-top font-medium leading-relaxed">
                            {detail.criterion}
                          </td>
                          <td className="px-6 py-5 align-top">
                            <span
                              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${
                                detail.observed
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                                  : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                              }`}
                            >
                              <span
                                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                                  detail.observed
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                                }`}
                              >
                                {detail.observed ? "✓" : "×"}
                              </span>
                              {detail.observed ? "Observé" : "Non observé"}
                            </span>
                          </td>
                          <td className={`px-6 py-5 align-top leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                            {detail.feedback}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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

      {evaluationWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm px-4">
          <div className={`relative w-full max-w-md rounded-2xl border ${cardBg} p-8 shadow-2xl`}>
            <button
              type="button"
              onClick={() => setEvaluationWarning(null)}
              className={`absolute right-0 top-0 -translate-y-1/2 translate-x-1/2 rounded-full border p-2 shadow-lg transition-colors ${
                darkMode
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              aria-label="Close popup"
            >
              <XIcon className="h-4 w-4" />
            </button>

            <div className="text-center">
              <h3 className="text-xl font-bold">{evaluationWarning.title}</h3>
              <p className={`mt-3 text-sm leading-relaxed ${mutedText}`}>
                {evaluationWarning.body}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              {evaluationWarning.mode === "confirm" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEvaluationWarning(null)}
                    className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                      darkMode
                        ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEvaluationWarning(null);
                      void evaluateDiscussion();
                    }}
                    className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-primary-700"
                  >
                    Yes
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEvaluationWarning(null)}
                  className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-primary-700"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {sessionGuardDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border ${cardBg} p-8 shadow-2xl`}>
            <div className="text-center">
              <h3 className="text-xl font-bold">{sessionGuardDialog.title}</h3>
              <p className={`mt-3 text-sm leading-relaxed ${mutedText}`}>
                {sessionGuardDialog.body}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setSessionGuardDialog(null)}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                  darkMode
                    ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmSessionGuardAction}
                className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-primary-700"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {readinessDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border ${cardBg} p-8 shadow-2xl`}>
            <div className="text-center">
              <h3 className="text-xl font-bold">{readinessDialog.title}</h3>
              <p className={`mt-3 text-sm leading-relaxed ${mutedText}`}>
                {readinessDialog.body}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              {readinessDialog.mode === "confirm" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setReadinessDialog(null)}
                    className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                      darkMode
                        ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReadinessDialog(null);
                      void startDiscussionInternal();
                    }}
                    className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-primary-700"
                  >
                    Continuer
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setReadinessDialog(null)}
                  className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-primary-700"
                >
                  Fermer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {completionToast && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/10 backdrop-blur-[1px] pointer-events-none">
          <div className={`w-full max-w-sm rounded-2xl border ${cardBg} px-6 py-5 shadow-2xl`}>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <CheckIcon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold">{completionToast.title}</h3>
              <p className={`mt-2 text-sm ${mutedText}`}>{completionToast.body}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
