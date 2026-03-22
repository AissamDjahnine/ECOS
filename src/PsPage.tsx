import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
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
import psExampleText from "./examples/ps-example.txt?raw";
import { buildPsPdfDocument } from "./lib/pdf";
import { ConfirmDialog } from "./ConfirmDialog";
import { EvaluationReport } from "./EvaluationReport";
import { RecordingPlayer } from "./RecordingPlayer";
import {
  FEMALE_VOICE_OPTIONS,
  hasVoicePreviewSample,
  inferVoiceFromPatientSex,
  MALE_VOICE_OPTIONS,
  VOICE_OPTIONS,
} from "./lib/voices";
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

const PATIENT_INFO_PLACEHOLDERS: PatientInfoItem[] = [
  { label: "Nom", value: "John Doe" },
  { label: "Âge", value: "35 ans" },
  { label: "Sexe", value: "Masculin" },
  { label: "Poids", value: "72 kg" },
  { label: "Taille", value: "1m78" },
  { label: "Statut marital", value: "Célibataire" },
  { label: "Enfants", value: "0" },
  { label: "Profession", value: "Ingénieur" },
];

const EVALUATION_PROGRESS_MESSAGES = [
  "Transcription des échanges...",
  "Analyse de la discussion...",
  "Lecture de la grille de correction...",
  "Vérification des critères observés...",
  "Calcul de la note...",
  "Génération du commentaire...",
  "Finalisation des résultats...",
];

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

const NO_LEADING_SPACE_BEFORE = new Set([
  ".", ",", ";", ":", "!", "?", ")", "]", "}", "'", "\u2019",
]);

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

  if (NO_LEADING_SPACE_BEFORE.has(chunk)) {
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

  const firstName =
    parsedCase.patientFirstName ||
    findField(script, ["prénom", "prenom", "prénoms", "prenoms"]);
  const lastName =
    parsedCase.patientLastName ||
    findField(script, ["nom", "name", "nom du patient", "nom de famille"]);
  const patientName = parsedCase.patientName;
  const age = parsedCase.patientAge || findField(script, ["âge", "age"]);
  const sex = parsedCase.patientSex || findField(script, ["sexe", "genre"]);
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
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || patientName;

  if (displayName) {
    items.push({ label: "Nom complet", value: displayName });
  }
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

function VoiceMaleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="14" r="5" />
      <path d="M14 10 21 3" />
      <path d="M15 3h6v6" />
    </svg>
  );
}

function VoiceFemaleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M12 13v8" />
      <path d="M9 18h6" />
    </svg>
  );
}

function BeakerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 3h15" />
      <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3" />
      <path d="M6 14h12" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function HeartIcon({
  className,
  filled = false,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 21-1.4-1.27C5.4 15 2 11.86 2 8a5 5 0 0 1 8.2-3.84L12 5.75l1.8-1.59A5 5 0 0 1 22 8c0 3.86-3.4 7-8.6 11.73Z" />
    </svg>
  );
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
    `Commentaire: ${evaluation.commentary || "Commentaire indisponible."}`,
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

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5v14" />
    </svg>
  );
}

type ModalInputFormProps = {
  darkMode: boolean;
  inputBg: string;
  parseError: string;
  isLocked: boolean;
  onAnalyse: (studentRaw: string, examinatorRaw: string) => void;
  initialStudentRaw: string;
  initialExaminatorRaw: string;
};

function ModalInputForm({
  darkMode,
  inputBg,
  parseError,
  isLocked,
  onAnalyse,
  initialStudentRaw,
  initialExaminatorRaw,
}: ModalInputFormProps) {
  const [studentRaw, setStudentRaw] = useState(initialStudentRaw);
  const [examinatorRaw, setExaminatorRaw] = useState(initialExaminatorRaw);
  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${mutedText}`}>
            Pour l&apos;examinateur
          </label>
          <textarea
            value={examinatorRaw}
            onChange={(e) => setExaminatorRaw(e.target.value)}
            placeholder="Collez ici le contenu SDD pour l'examinateur (grille de correction)..."
            disabled={isLocked}
            className={`h-64 w-full resize-none rounded-xl border p-3 text-sm leading-relaxed transition-all focus:outline-none focus:ring-2 focus:ring-[#008282]/30 ${inputBg} ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
          />
        </div>
        <div>
          <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${mutedText}`}>
            Pour l&apos;étudiant
          </label>
          <textarea
            value={studentRaw}
            onChange={(e) => setStudentRaw(e.target.value)}
            placeholder="Collez ici le contenu SDD pour l'étudiant (cas clinique affiché)..."
            disabled={isLocked}
            className={`h-64 w-full resize-none rounded-xl border p-3 text-sm leading-relaxed transition-all focus:outline-none focus:ring-2 focus:ring-[#008282]/30 ${inputBg} ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
          />
        </div>
      </div>
      {parseError && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
          {parseError}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={isLocked || (!studentRaw.trim() && !examinatorRaw.trim())}
          onClick={() => onAnalyse(studentRaw, examinatorRaw)}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #006767 0%, #008282 100%)" }}
        >
          <SearchIcon className="h-4 w-4" />
          Analyser
        </button>
      </div>
    </div>
  );
}

type PsPageProps = {
  currentMode: "ps" | "sans-ps";
  onNavigate: (mode: "ps" | "sans-ps" | "library" | "home") => void;
  settings: AppSettings;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  darkMode: boolean;
  onDarkModeChange: (value: boolean) => void;
  onShowToast?: (title: string, body?: string, tone?: "success" | "error" | "info") => void;
  initialRawInput?: string;
};

export default function App({
  currentMode,
  onNavigate,
  settings,
  onOpenDashboard,
  onOpenSettings,
  darkMode,
  onDarkModeChange,
  onShowToast = () => {},
  initialRawInput,
}: PsPageProps) {
  const [studentRawInput, setStudentRawInput] = useState(initialRawInput ?? "");
  const [examinatorRawInput, setExaminatorRawInput] = useState("");
  const [isStationModalOpen, setIsStationModalOpen] = useState(
    () => Boolean(initialRawInput),
  );
  const [parsedCase, setParsedCase] = useState<ParsedCase>(() =>
    parseCaseInput(initialRawInput ?? ""),
  );
  const [parseError, setParseError] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const isConnectingRef = useRef(false);
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [hasEndedDiscussion, setHasEndedDiscussion] = useState(false);
  const [status, setStatus] = useState("Mode PS/PSS prêt");
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [showEvaluationReport, setShowEvaluationReport] = useState(false);
  const [showReportAudioPlayer, setShowReportAudioPlayer] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationProgress, setEvaluationProgress] = useState(0);
  const [evaluationMessageIndex, setEvaluationMessageIndex] = useState(0);
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
  const [lastSessionElapsedSeconds, setLastSessionElapsedSeconds] = useState(0);
  const [sessionGuardDialog, setSessionGuardDialog] = useState<{
    action: "reset" | "clear" | "stop";
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
  const [selectedVoiceName, setSelectedVoiceName] = useState(() =>
    inferVoiceFromPatientSex(parsedCase.patientSex),
  );
  const [voiceSelectionMode, setVoiceSelectionMode] = useState<"auto" | "manual">(
    "auto",
  );
  const [playingVoicePreviewName, setPlayingVoicePreviewName] = useState<
    string | null
  >(null);
  const [isVoicePreviewPaused, setIsVoicePreviewPaused] = useState(false);
  const [voicePreviewProgress, setVoicePreviewProgress] = useState(0);
  const [favoriteVoiceNames, setFavoriteVoiceNames] = useState<string[]>([]);
  const [isVoiceDrawerOpen, setIsVoiceDrawerOpen] = useState(false);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

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
  const displayedPatientInfo = patientInfo.length > 0 ? patientInfo : PATIENT_INFO_PLACEHOLDERS;
  const selectedVoiceOption = useMemo(
    () => VOICE_OPTIONS.find((voice) => voice.value === selectedVoiceName),
    [selectedVoiceName],
  );
  const parsedReady = Boolean(parsedCase.patientScript && parsedCase.gradingGrid);
  const sessionDurationSeconds = settings.defaultTimerSeconds;
  const canEditVoice =
    parsedReady && !isConnecting && !isDiscussing && !isPaused;
  const canToggleFavoriteVoice = !isConnecting && !isDiscussing && !isPaused;
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
      hasEndedDiscussion);
  const canClearText =
    !isDiscussing &&
    !isPaused &&
    !isEvaluating &&
    !isConnecting &&
    (studentRawInput.trim().length > 0 ||
      examinatorRawInput.trim().length > 0 ||
      parsedReady ||
      hasEndedDiscussion);

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
  const patientTranscriptLabel = useMemo(() => {
    const candidate =
      parsedCase.patientFirstName?.trim() ||
      parsedCase.patientName?.trim() ||
      "Patient";
    return `${candidate.toUpperCase()} (AI)`;
  }, [parsedCase.patientFirstName, parsedCase.patientName]);
  const transcriptCopyText = useMemo(
    () => buildTranscriptCopy(transcript, settings.showSystemMessages),
    [settings.showSystemMessages, transcript],
  );
  const canCopyTranscript =
    (settings.showLiveTranscript || hasEndedDiscussion) &&
    transcriptCopyText.trim().length > 0;
  const transcriptPanelHeightClass = hasEndedDiscussion
    ? "h-[460px]"
    : "h-[560px]";
  const discussionPanelHeightClass = hasEndedDiscussion
    ? "lg:h-[500px]"
    : "lg:h-[640px]";
  const evaluationCopyText = evaluation ? buildEvaluationCopy(evaluation) : "";
  const canRerunEvaluation =
    Boolean(evaluation) &&
    !isEvaluating &&
    lastEvaluatedFeedbackDetailLevel !== null &&
    lastEvaluatedFeedbackDetailLevel !== settings.feedbackDetailLevel;

  useEffect(() => {
    if (voiceSelectionMode !== "auto") {
      return;
    }

    setSelectedVoiceName(inferVoiceFromPatientSex(parsedCase.patientSex));
  }, [parsedCase.patientSex, voiceSelectionMode]);

  useEffect(() => {
    return () => {
      if (voicePreviewAudioRef.current) {
        voicePreviewAudioRef.current.pause();
        voicePreviewAudioRef.current = null;
      }
    };
  }, []);

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
    const wasMuted = isMicMutedRef.current;
    const next = !wasMuted;
    isMicMutedRef.current = next;
    setIsMicMuted(next);

    if (next) {
      setMicLevel(0);
      setMicPeak(0);
      // Muting acts like detected silence: finalize draft and let AI respond
      setShowStudentDraftIndicator(false);
      finalizeStudentDraft();
    }
  }

  function handleAnalyse(studentRaw: string, examinatorRaw: string) {
    const combined = studentRaw.trim() + "\n" + examinatorRaw.trim();
    const parsed = parseCaseInput(combined);
    if (!parsed.patientScript || !parsed.gradingGrid) {
      setParseError(
        "Le texte ne contient pas de script patient ou de grille détectable. Vérifiez les sections.",
      );
      return;
    }
    setParseError("");
    setStudentRawInput(studentRaw);
    setExaminatorRawInput(examinatorRaw);
    setParsedCase(parsed);
    setIsStationModalOpen(false);
  }

  function toggleFavoriteVoice(voiceName: string) {
    setFavoriteVoiceNames((current) =>
      current.includes(voiceName)
        ? current.filter((entry) => entry !== voiceName)
        : [...current, voiceName],
    );
  }

  function stopVoicePreview() {
    if (voicePreviewAudioRef.current) {
      voicePreviewAudioRef.current.pause();
      voicePreviewAudioRef.current.currentTime = 0;
      voicePreviewAudioRef.current = null;
    }
    setPlayingVoicePreviewName(null);
    setIsVoicePreviewPaused(false);
    setVoicePreviewProgress(0);
  }

  async function toggleVoicePreview(voiceName: string) {
    if (!hasVoicePreviewSample(voiceName)) {
      return;
    }

    if (playingVoicePreviewName === voiceName) {
      if (voicePreviewAudioRef.current && !voicePreviewAudioRef.current.paused) {
        voicePreviewAudioRef.current.pause();
        return;
      }

      if (voicePreviewAudioRef.current?.paused) {
        try {
          await voicePreviewAudioRef.current.play();
        } catch {
          stopVoicePreview();
        }
      }
      return;
    }

    stopVoicePreview();

    const audio = new Audio(`/voice-samples/${voiceName.toLowerCase()}.wav`);
    voicePreviewAudioRef.current = audio;
    setPlayingVoicePreviewName(voiceName);
    setIsVoicePreviewPaused(false);
    setVoicePreviewProgress(0);

    const syncProgress = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (duration > 0) {
        setVoicePreviewProgress(
          Math.max(0, Math.min(1, audio.currentTime / duration)),
        );
      }
    };

    audio.addEventListener("timeupdate", syncProgress);
    audio.addEventListener("loadedmetadata", syncProgress);
    audio.addEventListener("play", () => {
      setIsVoicePreviewPaused(false);
    });
    audio.addEventListener("pause", () => {
      if (!audio.ended) {
        setIsVoicePreviewPaused(true);
        syncProgress();
      }
    });

    audio.addEventListener(
      "ended",
      () => {
        if (voicePreviewAudioRef.current === audio) {
          voicePreviewAudioRef.current = null;
        }
        setPlayingVoicePreviewName(null);
        setIsVoicePreviewPaused(false);
        setVoicePreviewProgress(0);
      },
      { once: true },
    );

    try {
      await audio.play();
    } catch {
      if (voicePreviewAudioRef.current === audio) {
        voicePreviewAudioRef.current = null;
      }
      setPlayingVoicePreviewName(null);
    }
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
      sessionRef.current?.sendRealtimeInput?.({ audioStreamEnd: true });
      shouldSendAudioRef.current = false;
      isMicMutedRef.current = true;
      setIsMicMuted(true);
      setMicLevel(0);
      setMicPeak(0);
      setIsDiscussing(false);
      setIsPaused(true);
      isPausedRef.current = true;
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
    isMicMutedRef.current = false;
    setIsMicMuted(false);
    setIsDiscussing(true);
    setIsPaused(false);
    isPausedRef.current = false;
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
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    try {
      const sessionVoiceName =
        voiceSelectionMode === "auto"
          ? inferVoiceFromPatientSex(parsedCase.patientSex, selectedVoiceName)
          : selectedVoiceName;

      currentSessionIdRef.current = crypto.randomUUID();
      setIsConnecting(true);
      setHasEndedDiscussion(false);
      setStatus("Demande de jeton temporaire");
      setEvaluation(null);
      setShowEvaluationReport(false);
      setShowReportAudioPlayer(false);
      setIsVoiceDrawerOpen(false);
      setRemainingSeconds(sessionDurationSeconds);
      setTranscript([]);
      setMicLevel(0);
      setMicPeak(0);
      setIsPaused(false);
      isPausedRef.current = false;

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
      setSelectedVoiceName(sessionVoiceName);
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
          voiceName: sessionVoiceName,
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
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: sessionVoiceName,
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity:
                StartSensitivity.START_SENSITIVITY_HIGH,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
              prefixPaddingMs: 320,
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
              }).catch(() => {});
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
              if (isMicMutedRef.current) {
                // Buffered transcription arrived after mute — finalize immediately
                await finalizeStudentDraft();
              } else {
                setConversationPhase("student-speaking");
                setStatus("Étudiant en train de parler");
                setShowStudentDraftIndicator(true);
              }
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
        (chunk, rawPcm) => {
          if (
            !shouldSendAudioRef.current ||
            isPausedRef.current ||
            isMicMutedRef.current
          ) {
            return;
          }

          studentTurnAudioChunksRef.current.push(chunk);

          const base64Audio = uint8ToBase64(rawPcm);

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
      isPausedRef.current = false;
      setConversationPhase("listening");
      setStatus("Session Live ouverte, en attente de l'étudiant");
    } catch (error) {
      const message =
        (error instanceof Error ? error.message : String(error)) ||
        "Impossible de se connecter au serveur. Vérifiez que le backend est lancé.";

      shouldSendAudioRef.current = true;
      setStatus(`Impossible de démarrer : ${message}`);
      onShowToast("Démarrage impossible", message, "error");
      setConversationPhase("idle");
      setShowStudentDraftIndicator(false);
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur : ${message}`),
      ]);
    } finally {
      setIsConnecting(false);
      isConnectingRef.current = false;
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
      onShowToast("Vérification indisponible", message, "error");
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
      const elapsedSeconds = sessionDurationSeconds - remainingSeconds;
      elapsedSummary = formatElapsedDiscussion(
        elapsedSeconds,
      );
      setLastSessionElapsedSeconds(elapsedSeconds);
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
      isPausedRef.current = false;
      setHasEndedDiscussion(true);
      setConversationPhase("idle");
      setStatus("Discussion terminée. Transcription prête pour évaluation.");
      setMicLevel(0);
      setMicPeak(0);

      if (discussionFinished) {
        onShowToast(
          "Discussion terminée",
          `Vous avez fini en ${elapsedSummary}.`,
          "success",
        );
      }
    }
  }

  async function copyTextToClipboard(text: string, successMessage: string) {
    if (!text.trim()) {
      return;
    }
    if (!navigator.clipboard?.writeText) {
      onShowToast(
        "Copie indisponible",
        "Le presse-papiers n'est pas disponible dans ce navigateur.",
        "error",
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      onShowToast("Copie effectuée", successMessage, "success");
    } catch (error) {
      onShowToast(
        "Échec de la copie",
        error instanceof Error ? error.message : "Impossible de copier ce contenu.",
        "error",
      );
    }
  }

  async function resetSessionState() {
    try {
      shouldSendAudioRef.current = false;
      await stopMixedRecorder();
      await micRef.current?.stop();
      sessionRef.current?.close();
      await playerRef.current?.close();
    } catch (err) {
      console.warn("Erreur lors du nettoyage de session :", err);
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
      isPausedRef.current = false;
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
      setLastSessionElapsedSeconds(0);
    }
  }

  async function handleResetSession() {
    await resetSessionState();
    onShowToast(
      "Session réinitialisée",
      "La session a été vidée. Le texte collé est conservé.",
      "success",
    );
  }

  async function handleClearText() {
    await resetSessionState();
    setStudentRawInput("");
    setExaminatorRawInput("");
    setParsedCase(parseCaseInput(""));
    setParseError("");
    setShowEvaluationReport(false);
    setShowReportAudioPlayer(false);
    setStatus("Mode PS/PSS prêt");
    setVoiceSelectionMode("auto");
    setSelectedVoiceName(inferVoiceFromPatientSex(""));
    setIsVoiceDrawerOpen(false);
    onShowToast(
      "Zone vidée",
      "Le texte collé et les résultats associés ont été supprimés.",
      "success",
    );
  }

  function requestStopDiscussion() {
    if (!canEnd) {
      return;
    }

    setSessionGuardDialog({
      action: "stop",
      title: "Terminer la session ?",
      body: "La session en cours sera arrêtée. Vous pourrez ensuite évaluer la transcription.",
    });
  }

  function requestResetSession() {
    if (!canResetSession) {
      return;
    }

    setSessionGuardDialog({
      action: "reset",
      title: "Réinitialiser la session ?",
      body: "La transcription, l’enregistrement audio et l’évaluation seront supprimés. Le texte collé sera conservé.",
    });
  }

  function requestClearText() {
    if (!canClearText) {
      return;
    }

    setSessionGuardDialog({
      action: "clear",
      title: "Effacer le texte collé ?",
      body: "Le texte collé, la transcription, l’enregistrement audio et l’évaluation seront supprimés.",
    });
  }

  function confirmSessionGuardAction() {
    if (!sessionGuardDialog) {
      return;
    }

    const { action } = sessionGuardDialog;
    setSessionGuardDialog(null);

    if (action === "stop") {
      void stopDiscussion();
      return;
    }

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
      setShowEvaluationReport(true);
      setShowReportAudioPlayer(false);
      setLastEvaluatedFeedbackDetailLevel(settings.feedbackDetailLevel);
      setStatus("Évaluation terminée");
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur d'évaluation inconnue";

      setStatus(`Échec de l'évaluation : ${message}`);
      onShowToast("Échec de l'évaluation", message, "error");
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur d'évaluation : ${message}`),
      ]);
    } finally {
      setTimeout(() => setIsEvaluating(false), 250);
    }
  }

  function handleEvaluateClick() {
    void evaluateDiscussion();
  }

  function exportPdf(): boolean {
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) {
      onShowToast(
        "Export PDF bloqué",
        "Autorisez les popups pour ouvrir l’aperçu d’impression.",
        "error",
      );
      return false;
    }

    popup.document.open();
    popup.document.write(
      buildPsPdfDocument(
        parsedCase,
        transcript,
        evaluation,
        lastEvaluatedFeedbackDetailLevel ?? settings.feedbackDetailLevel,
      ),
    );
    popup.document.close();
    popup.focus();
    popup.print();
    onShowToast(
      "Export PDF lancé",
      "L’aperçu d’impression du compte rendu est ouvert.",
      "success",
    );
    return true;
  }

  function downloadRecordedAudio() {
    if (!recordedAudioUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = recordedAudioUrl;
    link.download = `ecos-discussion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    onShowToast(
      "Téléchargement lancé",
      "L’enregistrement audio est en cours de téléchargement.",
      "success",
    );
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
      if (exportPdf()) {
        autoExportedEvaluationRef.current = evaluationKey;
      }
    }
  }, [evaluation, settings.autoExportPdfAfterEvaluation]);

  useEffect(() => {
    if (!isDiscussing) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          void stopDiscussion();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isDiscussing]);

  useEffect(() => {
    if (!isEvaluating) {
      setEvaluationProgress(0);
      setEvaluationMessageIndex(0);
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
    if (!isEvaluating) {
      setEvaluationMessageIndex(0);
      return;
    }

    setEvaluationMessageIndex(0);
    const interval = window.setInterval(() => {
      setEvaluationMessageIndex((current) =>
        Math.min(current + 1, EVALUATION_PROGRESS_MESSAGES.length - 1),
      );
    }, 1200);

    return () => {
      window.clearInterval(interval);
    };
  }, [isEvaluating]);

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

    };
  }, []);

  // Theme classes
  const theme = darkMode ? "dark" : "light";
  const bgClass = darkMode
    ? "bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.06),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.04),_transparent_24%),linear-gradient(135deg,_#0f172a_0%,_#1e293b_100%)]"
    : "bg-[#f7f9fe]";
  const textClass = darkMode ? "text-slate-100" : "text-[#181c20]";
  const cardBg = darkMode
    ? "bg-slate-800/80 border-slate-700/60 shadow-lg backdrop-blur-xl"
    : "bg-white border-[#bcc9c8]";
  const subCardBg = darkMode
    ? "bg-slate-900/70 border-slate-700/40"
    : "bg-slate-50/80 border-slate-200/50";
  const inputBg = darkMode
    ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-400"
    : "bg-white border-slate-200 text-slate-900 placeholder-slate-400";
  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";
  const subtleBg = darkMode ? "bg-slate-700/50" : "bg-slate-100/60";

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
        return "bg-[#008282]";
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

  function renderStudentContent(text: string) {
    const lines = text.split("\n");
    const elements: ReactNode[] = [];
    let bulletGroup: string[] = [];

    function flushBullets() {
      if (bulletGroup.length === 0) return;
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 space-y-1 pl-4">
          {bulletGroup.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#008282]" />
              {b}
            </li>
          ))}
        </ul>,
      );
      bulletGroup = [];
    }

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushBullets();
        elements.push(<div key={`gap-${i}`} className="h-2" />);
        return;
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("\u2022 ") || trimmed.startsWith("* ")) {
        bulletGroup.push(trimmed.replace(/^[-\u2022*]\s/, ""));
        return;
      }
      flushBullets();
      const isHeading =
        trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-Z\u00C0\u00C2\u00C9\u00C8\u00CA\u00D9\u00DB\u00CE]/.test(trimmed);
      if (isHeading) {
        elements.push(
          <h3 key={i} className={`mb-2 mt-5 text-sm font-bold uppercase tracking-wide ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
            {trimmed}
          </h3>,
        );
        return;
      }
      if (trimmed.endsWith(":") && trimmed.length < 60) {
        elements.push(
          <p key={i} className={`mb-1 mt-4 text-sm font-semibold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
            {trimmed}
          </p>,
        );
        return;
      }
      elements.push(
        <p key={i} className={`text-sm leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
          {trimmed}
        </p>,
      );
    });
    flushBullets();
    return elements;
  }

  return (
    <div className={`flex h-screen flex-row overflow-hidden ${theme} ${bgClass} ${textClass} transition-colors duration-300`}>
      <Sidebar
        darkMode={darkMode}
        onDarkModeChange={onDarkModeChange}
        currentRoute={currentMode}
        canSwitchModes={canSwitchModes}
        onNavigate={onNavigate}
        onOpenDashboard={onOpenDashboard}
        onOpenSettings={onOpenSettings}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* EVALUATION REPORT (full-width) */}
        {showEvaluationReport && evaluation ? (
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto max-w-[1280px]">
              <div className="space-y-6">
                <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setShowEvaluationReport(false);
                          setShowReportAudioPlayer(false);
                        }}
                        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                          darkMode
                            ? "border-transparent bg-slate-800 text-slate-100 hover:bg-slate-700"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        &larr; Retour &agrave; la session
                      </button>
                      <h1 className="mt-4 text-3xl font-bold tracking-tight">R&eacute;sultats de l&apos;&eacute;valuation</h1>
                      <p className={`mt-2 text-sm ${mutedText}`}>
                        Rapport d&eacute;taill&eacute; de la station avec synth&egrave;se p&eacute;dagogique et recommandations.
                      </p>
                    </div>
                    <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[440px] xl:max-w-[860px] xl:items-end">
                      <div className="flex flex-wrap items-center gap-2">
                        {canRerunEvaluation && (
                          <button
                            type="button"
                            onClick={handleRerunEvaluation}
                            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium text-white transition-all duration-200 hover:opacity-90"
                            style={{ background: "linear-gradient(135deg, #006767 0%, #008282 100%)" }}
                          >
                            R&eacute;&eacute;valuer
                          </button>
                        )}
                        {recordedAudioUrl && (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowReportAudioPlayer((current) => !current)}
                              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                                darkMode
                                  ? "border-transparent bg-slate-100 text-slate-900 hover:bg-white"
                                  : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              <PlayIcon className="w-4 h-4" />
                              &Eacute;couter l&apos;audio
                            </button>
                            <button
                              type="button"
                              onClick={downloadRecordedAudio}
                              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                                darkMode
                                  ? "border-transparent bg-slate-100 text-slate-900 hover:bg-white"
                                  : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              <DownloadIcon className="w-4 h-4" />
                              T&eacute;l&eacute;charger l&apos;audio
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void copyTextToClipboard(
                              evaluationCopyText,
                              "L'évaluation a été copiée.",
                            )
                          }
                          className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                            darkMode
                              ? "border-transparent bg-slate-100 text-slate-900 hover:bg-white"
                              : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <CopyIcon className="w-4 h-4" />
                          Copier l&apos;&eacute;valuation
                        </button>
                        <button
                          type="button"
                          onClick={exportPdf}
                          className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
                        >
                          <FileTextIcon className="w-4 h-4" />
                          Exporter en PDF
                        </button>
                      </div>
                      {recordedAudioUrl && showReportAudioPlayer && (
                        <RecordingPlayer
                          src={recordedAudioUrl}
                          darkMode={darkMode}
                          playbackRate={settings.recordedAudioPlaybackRate}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <EvaluationReport
                  evaluation={evaluation}
                  darkMode={darkMode}
                  elapsedSeconds={lastSessionElapsedSeconds}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* TOP BAR */}
            <div className={`flex shrink-0 items-center justify-between gap-4 border-b px-6 py-3 ${
              darkMode ? "border-slate-700/60 bg-slate-900/80" : "border-slate-200 bg-white"
            }`}>
              <div className="min-w-0">
                <h2 className={`text-lg font-bold ${darkMode ? "text-slate-100" : "text-[#181c20]"}`}>
                  Cas Clinique
                </h2>
                {parsedCase.patientName ? (
                  <p className={`text-xs ${mutedText}`}>
                    {parsedCase.patientName}{parsedCase.patientAge ? ` \u00b7 ${parsedCase.patientAge}` : ""}
                  </p>
                ) : (
                  <p className={`text-xs ${mutedText}`}>Aucun cas charg&eacute;</p>
                )}
              </div>

              {parsedReady && (
                <div className="flex shrink-0 items-center gap-3">
                  {/* Timer */}
                  <div className="text-right">
                    <div className={`text-[10px] font-semibold uppercase tracking-widest ${mutedText}`}>
                      Temps restant
                    </div>
                    <div className={`text-xl font-bold tabular-nums tracking-tight ${
                      timerDanger ? "animate-pulse text-rose-500" : darkMode ? "text-slate-100" : "text-[#181c20]"
                    }`}>
                      {formatCountdown(remainingSeconds)}
                    </div>
                  </div>

                  {/* Voice chip */}
                  <button
                    type="button"
                    onClick={() => setIsVoiceDrawerOpen(true)}
                    disabled={!parsedReady || isDiscussing || isConnecting}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                      darkMode
                        ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    } ${(!parsedReady || isDiscussing || isConnecting) ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    {selectedVoiceOption?.label ?? selectedVoiceName}
                    <span className="opacity-60">{selectedVoiceOption?.gender === "female" ? "\u2640" : "\u2642"}</span>
                  </button>

                  {/* Mic button */}
                  <button
                    type="button"
                    onClick={toggleMicMute}
                    disabled={!isDiscussing && !isPaused}
                    aria-pressed={isMicMuted}
                    aria-label={isMicMuted ? "R\u00e9activer le microphone" : "Couper le microphone"}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-full transition-all ${
                      isMicMuted
                        ? darkMode ? "bg-slate-800 text-rose-400" : "bg-rose-50 text-rose-500"
                        : "text-white shadow-lg"
                    } ${(!isDiscussing && !isPaused) ? "cursor-not-allowed opacity-40" : ""}`}
                    style={(!isMicMuted && (isDiscussing || isPaused))
                      ? { background: "linear-gradient(135deg, #006767 0%, #008282 100%)" }
                      : undefined}
                  >
                    {isMicMuted ? (
                      <MicOffIcon className="h-5 w-5" />
                    ) : (
                      <MicIcon className="h-5 w-5" />
                    )}
                    {!isMicMuted && (isDiscussing || isPaused) && conversationPhase === "patient-speaking" && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-[#008282] opacity-30" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* CONTENT AREA: case content + transcript */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* Middle: scrollable case content */}
              <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
                {!parsedReady ? (
                  <div className="flex flex-1 items-center justify-center p-8">
                    <div className="text-center">
                      <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${darkMode ? "bg-slate-800" : "bg-slate-100"}`}>
                        <FileTextIcon className={`h-8 w-8 ${mutedText}`} />
                      </div>
                      <p className={`mb-1 text-sm font-semibold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                        Aucune station charg&eacute;e
                      </p>
                      <p className={`mb-5 text-xs ${mutedText}`}>
                        Chargez une station pour commencer la simulation
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsStationModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90"
                        style={{ background: "linear-gradient(135deg, #006767 0%, #008282 100%)" }}
                      >
                        <PlusIcon className="h-4 w-4" />
                        D&eacute;marrer une station
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className={`rounded-2xl border p-5 ${cardBg}`}>
                      {renderStudentContent(studentRawInput)}
                    </div>
                    {hasEndedDiscussion && !isDiscussing && (
                      <div className="mt-4 text-center">
                        <button
                          type="button"
                          onClick={() => setIsStationModalOpen(true)}
                          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                            darkMode
                              ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          Changer de station
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right panel: Transcription en live */}
              <div className={`flex w-[380px] shrink-0 flex-col border-l ${
                darkMode ? "border-slate-700/60" : "border-slate-200"
              }`}>
                {/* Header */}
                <div className={`flex shrink-0 items-start justify-between border-b px-4 py-3 ${
                  darkMode ? "border-slate-700/60" : "border-slate-200"
                }`}>
                  <div>
                    <h3 className={`text-sm font-semibold ${darkMode ? "text-slate-100" : "text-[#181c20]"}`}>
                      Transcription en live
                    </h3>
                    <p className={`text-xs ${mutedText}`}>Live transcription &amp; analysis feed</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyTextToClipboard(transcriptCopyText, "La transcription a \u00e9t\u00e9 copi\u00e9e.")}
                    disabled={!canCopyTranscript}
                    title="Copier le transcript"
                    aria-label="Copier le transcript"
                    className={`rounded-lg p-1.5 transition-colors ${
                      darkMode
                        ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    } ${!canCopyTranscript ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <CopyIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Transcript feed */}
                <div
                  ref={transcriptRef}
                  className={`min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth ${
                    darkMode ? "bg-slate-950/50" : "bg-slate-50/80"
                  }`}
                >
                  {transcriptForDisplay.length === 0 && !showDraftIndicatorForDisplay ? (
                    <div className="flex h-full items-center justify-center rounded-xl p-4">
                      <div className="text-center">
                        <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl ${subtleBg} flex items-center justify-center`}>
                          <ActivityIcon className={`w-8 h-8 ${mutedText}`} />
                        </div>
                        {!settings.showLiveTranscript && !hasEndedDiscussion ? (
                          <>
                            <p className={`text-sm ${mutedText}`}>
                              La transcription en direct est masqu&eacute;e
                            </p>
                            <p className={`text-xs ${mutedText} mt-1`}>
                              Elle sera visible &agrave; la fin de la session.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className={`text-sm ${mutedText}`}>
                              La transcription appara&icirc;tra ici
                            </p>
                            <p className={`text-xs ${mutedText} mt-1`}>
                              D&eacute;marrez une session pour commencer
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-full flex-col justify-end space-y-4 p-4">
                      {transcriptForDisplay.map((entry) => (
                        <div
                          key={entry.id}
                          className={`animate-fade-in ${
                            entry.role === "system" ? "mx-auto max-w-full" : "w-full"
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
                            <div className={`flex w-full ${entry.role === "patient" ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`inline-flex w-fit max-w-[78%] items-start gap-3 ${
                                  entry.role === "patient" ? "flex-row-reverse" : ""
                                }`}
                              >
                                <div
                                  className={`mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                    entry.role === "patient"
                                      ? "bg-[#b3e3e3] text-[#004f4f]"
                                      : darkMode
                                        ? "bg-slate-800 text-slate-300"
                                        : "bg-indigo-100 text-slate-500"
                                  }`}
                                >
                                  <UserIcon className="h-4 w-4" />
                                </div>
                                <div className={`flex min-w-0 flex-col ${entry.role === "patient" ? "items-end" : "items-start"}`}>
                                  <div
                                    className={`mb-1.5 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                      entry.role === "patient"
                                        ? "text-[#004f4f]"
                                        : darkMode
                                          ? "text-slate-400"
                                          : "text-slate-500"
                                    } ${entry.role === "patient" ? "justify-end" : ""}`}
                                  >
                                    <span>
                                      {entry.role === "patient"
                                        ? patientTranscriptLabel
                                        : "STUDENT"}
                                    </span>
                                    <span className={darkMode ? "text-slate-500" : "text-slate-400"}>
                                      {entry.timestamp}
                                    </span>
                                  </div>
                                  <div
                                    className={`inline-block w-fit max-w-full rounded-[22px] px-4 py-3 text-left text-sm leading-relaxed shadow-sm ${
                                      entry.role === "patient"
                                        ? "bg-[#006767] text-white"
                                        : darkMode
                                          ? "border border-slate-700 bg-slate-900 text-slate-100"
                                          : "border border-slate-200 bg-white text-slate-700"
                                    }`}
                                  >
                                    <div className="whitespace-pre-wrap">{entry.text}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {showDraftIndicatorForDisplay && (
                        <div className="animate-fade-in">
                          <div className="flex w-full justify-start">
                            <div className="inline-flex w-fit max-w-[78%] items-start gap-3">
                              <div className={`${darkMode ? "bg-slate-800 text-slate-300" : "bg-indigo-100 text-slate-500"} mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full`}>
                                <UserIcon className="h-4 w-4" />
                              </div>
                              <div className="flex min-w-0 flex-col items-start">
                                <div className={`mb-1.5 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                  darkMode ? "text-slate-400" : "text-slate-500"
                                }`}>
                                  <span>STUDENT</span>
                                  <span className={darkMode ? "text-slate-500" : "text-slate-400"}>
                                    {createTimestamp()}
                                  </span>
                                </div>
                                <div className={`inline-block w-fit max-w-full rounded-[22px] px-4 py-3 shadow-sm ${
                                  darkMode
                                    ? "border border-slate-700 bg-slate-900 text-slate-100"
                                    : "border border-slate-200 bg-white text-slate-700"
                                }`}>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span>En train de parler</span>
                                    <span className="flex gap-1">
                                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#008282]" />
                                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#008282] [animation-delay:150ms]" />
                                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#008282] [animation-delay:300ms]" />
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className={`shrink-0 border-t p-3 ${darkMode ? "border-slate-700/60" : "border-slate-200"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      const text = transcriptCopyText;
                      const blob = new Blob([text], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "transcription.txt";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    disabled={!canCopyTranscript}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                      canCopyTranscript
                        ? darkMode
                          ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : darkMode
                          ? "cursor-not-allowed bg-slate-800/50 text-slate-500 opacity-40"
                          : "cursor-not-allowed bg-slate-100 text-slate-400 opacity-40"
                    }`}
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Exporter la transcription
                  </button>
                </div>
              </div>
            </div>

            {/* BOTTOM ACTION BAR */}
            <div className={`flex shrink-0 items-center gap-3 border-t px-6 py-3 ${
              darkMode ? "border-slate-700/60 bg-slate-900/80" : "border-slate-200 bg-white"
            }`} style={{ backdropFilter: "blur(12px)" }}>
              <button
                onClick={startDiscussion}
                disabled={!canStart}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  canStart
                    ? "text-white shadow-lg hover:opacity-90"
                    : darkMode
                      ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                      : "cursor-not-allowed bg-slate-200 text-slate-400"
                }`}
                style={canStart ? { background: "linear-gradient(135deg, #006767 0%, #008282 100%)" } : undefined}
              >
                <PlayIcon className="h-4 w-4" />
                {isConnecting ? "Connexion..." : "D\u00e9marrer"}
              </button>

              <button
                onClick={togglePauseDiscussion}
                disabled={!canPause && !isPaused}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  canPause || isPaused
                    ? darkMode
                      ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                      : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : darkMode
                      ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                      : "cursor-not-allowed bg-slate-200 text-slate-400"
                }`}
              >
                {isPaused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
                {isPaused ? "Reprendre" : "Pause"}
              </button>

              <button
                type="button"
                onClick={requestStopDiscussion}
                disabled={!canEnd}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  canEnd
                    ? darkMode
                      ? "bg-rose-900/40 text-rose-300 hover:bg-rose-900/60"
                      : "border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                    : darkMode
                      ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                      : "cursor-not-allowed bg-slate-200 text-slate-400"
                }`}
              >
                <StopIcon className="h-4 w-4" />
                Terminer
              </button>

              <button
                onClick={handleEvaluateClick}
                disabled={!canJudge}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  canJudge
                    ? darkMode
                      ? "bg-slate-700 text-slate-100 hover:bg-slate-600"
                      : "border border-slate-200 bg-slate-800 text-white hover:bg-slate-900"
                    : darkMode
                      ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                      : "cursor-not-allowed bg-slate-200 text-slate-400"
                }`}
              >
                <CheckIcon className="h-4 w-4" />
                &Eacute;valuer
              </button>

              <button
                onClick={requestResetSession}
                disabled={!canResetSession}
                title="R\u00e9initialiser la session"
                aria-label="R\u00e9initialiser la session"
                className={`flex items-center justify-center rounded-xl p-2.5 transition-all duration-200 ${
                  canResetSession
                    ? darkMode
                      ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                      : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : darkMode
                      ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                      : "cursor-not-allowed bg-slate-200 text-slate-400"
                }`}
              >
                <ResetIcon className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* STATION INPUT MODAL */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-3xl rounded-2xl border shadow-2xl ${cardBg} p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className={`text-lg font-bold ${darkMode ? "text-slate-100" : "text-[#181c20]"}`}>
                  Nouvelle station
                </h2>
                <p className={`text-sm ${mutedText}`}>Collez les deux documents de la station SDD</p>
              </div>
              {!isDiscussing && !isConnecting && !isPaused && (
                <button
                  type="button"
                  onClick={() => { setIsStationModalOpen(false); setParseError(""); }}
                  className={`rounded-xl p-2 transition-colors ${darkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}
                  aria-label="Fermer"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              )}
            </div>
            <ModalInputForm
              darkMode={darkMode}
              inputBg={inputBg}
              parseError={parseError}
              isLocked={isDiscussing || isConnecting || isPaused}
              onAnalyse={handleAnalyse}
              initialStudentRaw={studentRawInput}
              initialExaminatorRaw={examinatorRawInput}
            />
          </div>
        </div>
      )}

      {/* Evaluation Modal */}
      {isEvaluating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border ${cardBg} p-8 shadow-2xl`}>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#b3e3e3] dark:bg-[#002424]/30 flex items-center justify-center">
                <ActivityIcon className="w-8 h-8 text-[#006767] dark:text-[#26aeae]" />
              </div>
              <h3 className="text-xl font-bold mb-2">Évaluation en cours</h3>
              <p className={`text-sm ${mutedText} mb-6`}>
                {EVALUATION_PROGRESS_MESSAGES[evaluationMessageIndex]}
              </p>
            </div>

            <div className={`h-3 rounded-full overflow-hidden ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
              <div
                className="h-full rounded-full bg-[#008282] transition-all duration-300"
                style={{ width: `${evaluationProgress}%` }}
              />
            </div>

            <div className="mt-4 text-center">
              <div className={`mb-2 inline-flex items-center gap-2 text-xs font-medium ${mutedText}`}>
                <span className="h-2 w-2 rounded-full bg-[#008282] animate-pulse" />
                <span>{EVALUATION_PROGRESS_MESSAGES[evaluationMessageIndex]}</span>
              </div>
              <br />
              <span className="text-2xl font-bold">{evaluationProgress}%</span>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(sessionGuardDialog)}
        darkMode={darkMode}
        title={sessionGuardDialog?.title ?? ""}
        body={sessionGuardDialog?.body ?? ""}
        confirmLabel={sessionGuardDialog?.action === "clear" ? "Oui, effacer" : sessionGuardDialog?.action === "stop" ? "Oui, terminer" : "Oui, réinitialiser"}
        cancelLabel="Annuler"
        tone="danger"
        onCancel={() => setSessionGuardDialog(null)}
        onConfirm={confirmSessionGuardAction}
      />

      {isVoiceDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setIsVoiceDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            className={`relative h-full w-full max-w-[520px] overflow-y-auto border-l ${
              darkMode
                ? "border-slate-800 bg-slate-950 text-slate-100"
                : "border-slate-200 bg-white text-slate-900"
            } shadow-2xl`}
            role="dialog"
            aria-modal="true"
            aria-label="Choisir la voix du patient"
          >
            <div className={`sticky top-0 z-10 border-b px-6 py-5 backdrop-blur ${
              darkMode
                ? "border-slate-800 bg-slate-950/90"
                : "border-slate-200 bg-white/92"
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Choisir la voix du patient</h2>
                  <p className={`mt-1 text-sm ${mutedText}`}>
                    Sélectionnez une voix avant le démarrage de la discussion.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVoiceDrawerOpen(false)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                    darkMode
                      ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                  aria-label="Fermer le panneau des voix"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-6">
              {[
                { title: "Voix féminines", voices: FEMALE_VOICE_OPTIONS },
                { title: "Voix masculines", voices: MALE_VOICE_OPTIONS },
              ].map((group) => (
                <section key={group.title}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${mutedText}`}>
                      {group.title}
                    </div>
                    <span className={`text-xs ${mutedText}`}>{group.voices.length} voix</span>
                  </div>

                  <div className="space-y-2.5">
                    {group.voices.map((voice) => {
                      const isSelected = selectedVoiceName === voice.value;
                      const isFavorite = favoriteVoiceNames.includes(voice.value);
                      const canPreviewVoice = hasVoicePreviewSample(voice.value);
                      const isPlayingPreview = playingVoicePreviewName === voice.value;
                      const previewProgressDegrees = Math.round(voicePreviewProgress * 360);

                      return (
                        <div
                          key={voice.value}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-3 transition-all ${
                            isSelected
                              ? darkMode
                                ? "border-[#26aeae] bg-[#008282]/10 text-slate-50"
                                : "border-[#4dbdbd] bg-[#e0f4f4] text-slate-900"
                              : darkMode
                                ? "border-slate-700 bg-slate-900/60 text-slate-200"
                                : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVoiceName(voice.value);
                              setVoiceSelectionMode("manual");
                            }}
                            disabled={!canEditVoice}
                            className={`flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-left ${
                              !canEditVoice ? "cursor-not-allowed opacity-60" : ""
                            }`}
                            aria-pressed={isSelected}
                            aria-label={`Sélectionner la voix ${voice.label}`}
                          >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                              isSelected
                                ? darkMode
                                  ? "bg-primary-500/20 text-primary-300"
                                  : "bg-[#b3e3e3] text-[#004f4f]"
                                : darkMode
                                  ? "bg-slate-800 text-slate-300"
                                  : "bg-slate-100 text-slate-500"
                            }`}>
                              {voice.gender === "male" ? (
                                <VoiceMaleIcon className="h-5 w-5" />
                              ) : (
                                <VoiceFemaleIcon className="h-5 w-5" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="truncate pr-1 text-sm font-semibold">{voice.label}</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleFavoriteVoice(voice.value)}
                            disabled={!canToggleFavoriteVoice}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all ${
                              isFavorite
                                ? "border-rose-300 bg-rose-500 text-white shadow-sm shadow-rose-500/20 dark:border-rose-500 dark:bg-rose-500"
                                : darkMode
                                  ? "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white"
                            } ${!canToggleFavoriteVoice ? "cursor-not-allowed opacity-50" : ""}`}
                            aria-pressed={isFavorite}
                            aria-label={
                              isFavorite
                                ? `Retirer ${voice.label} des favoris`
                                : `Ajouter ${voice.label} aux favoris`
                            }
                          >
                            <HeartIcon className="h-3.5 w-3.5" filled={isFavorite} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void toggleVoicePreview(voice.value);
                            }}
                            disabled={!canPreviewVoice}
                            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all ${
                              canPreviewVoice
                                ? darkMode
                                  ? "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white"
                                : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600"
                            }`}
                            aria-label={
                              !canPreviewVoice
                                ? `Aucun aperçu disponible pour ${voice.label}`
                                : isPlayingPreview && !isVoicePreviewPaused
                                  ? `Mettre en pause l'aperçu de ${voice.label}`
                                  : isPlayingPreview && isVoicePreviewPaused
                                    ? `Reprendre l'aperçu de ${voice.label}`
                                    : `Écouter l'aperçu de ${voice.label}`
                            }
                          >
                            {isPlayingPreview ? (
                              <span
                                className="absolute inset-0 rounded-lg"
                                style={{
                                  background: `conic-gradient(from 0deg, ${
                                    darkMode ? "#80d0d0" : "#008282"
                                  } 0deg, ${
                                    darkMode ? "#80d0d0" : "#008282"
                                  } ${previewProgressDegrees}deg, transparent ${previewProgressDegrees}deg 360deg)`,
                                  mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))",
                                  WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))",
                                }}
                              />
                            ) : null}
                            <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-md ${
                              darkMode ? "bg-slate-900" : "bg-white"
                            }`}>
                              {isPlayingPreview && !isVoicePreviewPaused ? (
                                <PauseIcon className="h-3.5 w-3.5" />
                              ) : (
                                <PlayIcon className="h-3.5 w-3.5" />
                              )}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </aside>
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
                    className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #006767 0%, #008282 100%)" }}
                  >
                    Continuer
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setReadinessDialog(null)}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #006767 0%, #008282 100%)" }}
                >
                  Fermer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
