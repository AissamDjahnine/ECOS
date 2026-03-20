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
import {
  requestMicrophoneStream,
  startMicrophoneStream,
  type AudioStreamer,
  type MicrophoneLevelSample,
} from "./lib/audio";
import { extractGradingGridOnly, transcriptToPlainText } from "./lib/parser";
import { buildSansPsPdfDocument } from "./lib/pdf";
import { EvaluationReport } from "./EvaluationReport";
import { ConfirmDialog } from "./ConfirmDialog";
import { RecordingPlayer } from "./RecordingPlayer";
import type {
  AppSettings,
  DashboardSnapshot,
  EvaluationResult,
  TranscriptEntry,
} from "./types";

type SessionPhase = "idle" | "student-speaking" | "paused";

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
  sendClientContent?: (params?: { turnComplete?: boolean }) => void;
};

type SansPsLiveMessage = LiveServerMessage & {
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
  serverContent?: {
    inputTranscription?: { text?: string };
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

const EVALUATION_PROGRESS_MESSAGES = [
  "Transcription du monologue...",
  "Analyse du contenu...",
  "Lecture de la grille de correction...",
  "Vérification des critères observés...",
  "Calcul de la note...",
  "Génération du commentaire...",
  "Finalisation des résultats...",
];

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

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
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

  const canonicalize = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[.,;:!?،؛۔]+$/g, "")
      .toLowerCase();

  const incomingCanonical = canonicalize(trimmed);

  const index = current.findIndex((entry) => entry.id === entryId);

  if (index === -1) {
    const lastEntry = current.at(-1);
    if (lastEntry?.role === role) {
      const lastCanonical = canonicalize(lastEntry.text);
      if (
        lastCanonical === incomingCanonical ||
        incomingCanonical.startsWith(lastCanonical) ||
        lastCanonical.startsWith(incomingCanonical)
      ) {
        const updated = [...current];
        updated[updated.length - 1] = {
          ...lastEntry,
          text: trimmed.length >= lastEntry.text.trim().length ? trimmed : lastEntry.text,
          timestamp: createTimestamp(),
        };
        return updated;
      }
    }

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
  if (canonicalize(existing.text) === incomingCanonical) {
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

function upsertTranscriptEntryAtEndById(
  current: TranscriptEntry[],
  entryId: string,
  role: TranscriptEntry["role"],
  text: string,
) {
  const trimmed = text.trim();
  if (!trimmed) {
    return current;
  }

  const existing = current.find((entry) => entry.id === entryId);
  const nextText =
    existing && existing.role === role
      ? appendTranscriptChunk(existing.text, trimmed)
      : trimmed;
  const withoutEntry = current.filter((entry) => entry.id !== entryId);
  return [
    ...withoutEntry,
    {
      id: entryId,
      role,
      text: nextText,
      timestamp: createTimestamp(),
    },
  ];
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

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="23" />
      <line x1="8" x2="16" y1="23" y2="23" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" x2="23" y1="1" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <path d="M15 5.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 10v2a5 5 0 0 1-.82 2.71" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <line x1="12" x2="12" y1="19" y2="23" />
      <line x1="8" x2="16" y1="23" y2="23" />
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
      <path d="M18 20a6 6 0 0 0-12 0" />
      <circle cx="12" cy="10" r="4" />
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

type SansPsPageProps = {
  currentMode: "ps" | "sans-ps";
  onNavigate: (mode: "ps" | "sans-ps") => void;
  settings: AppSettings;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  darkMode: boolean;
  onDarkModeChange: (value: boolean) => void;
  onShowToast?: (title: string, body?: string, tone?: "success" | "error" | "info") => void;
};

export default function SansPsPage({
  currentMode,
  onNavigate,
  settings,
  onOpenDashboard,
  onOpenSettings,
  darkMode,
  onDarkModeChange,
  onShowToast = () => {},
}: SansPsPageProps) {
  const [rawInput, setRawInput] = useState("");
  const [gradingGrid, setGradingGrid] = useState("");
  const [parseError, setParseError] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [status, setStatus] = useState("Session sans PS prête");
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("idle");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasEndedDiscussion, setHasEndedDiscussion] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationProgress, setEvaluationProgress] = useState(0);
  const [evaluationMessageIndex, setEvaluationMessageIndex] = useState(0);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [showEvaluationReport, setShowEvaluationReport] = useState(false);
  const [showReportAudioPlayer, setShowReportAudioPlayer] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(
    settings.defaultTimerSeconds,
  );
  const [showStudentDraftIndicator, setShowStudentDraftIndicator] =
    useState(false);
  const [studentDraftText, setStudentDraftText] = useState("");
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micPeak, setMicPeak] = useState(0);
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
  const micRef = useRef<AudioStreamer | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const recordedAudioUrlRef = useRef<string | null>(null);
  const autoEvaluateHandledRef = useRef(false);
  const autoExportedEvaluationRef = useRef<string | null>(null);
  const shouldSendAudioRef = useRef(true);
  const isMicMutedRef = useRef(false);
  const pendingManualTurnEndRef = useRef(false);
  const turnEndFallbackTimerRef = useRef<number | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const inputTranscriptRef = useRef("");
  const monologueEntryIdRef = useRef<string | null>(null);
  const audioChunkCountRef = useRef(0);
  const lastAudioDebugAtRef = useRef(0);
  const lastLiveUsageTotalsRef = useRef({
    inputTextTokens: 0,
    inputAudioTokens: 0,
    outputTextTokens: 0,
    outputAudioTokens: 0,
    totalTokens: 0,
  });

  const gridReady = Boolean(gradingGrid);
  const hasCommittedStudentTranscript = transcript.some(
    (entry) => entry.role === "student" && entry.text.trim().length > 0,
  );
  const hasStudentTranscript =
    hasCommittedStudentTranscript ||
    inputTranscriptRef.current.trim().length > 0 ||
    studentDraftText.trim().length > 0;
  const canStart =
    gridReady &&
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
    hasStudentTranscript &&
    Boolean(gradingGrid);
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
    !isConnecting &&
    !isEvaluating &&
    !isDiscussing &&
    !isPaused &&
    (rawInput.trim().length > 0 ||
      gradingGrid.length > 0 ||
      parseError.length > 0 ||
      transcript.length > 0 ||
      evaluation !== null ||
      recordedAudioUrl !== null ||
      hasEndedDiscussion);
  const timerDanger = remainingSeconds <= 60;
  const sessionDurationSeconds = settings.defaultTimerSeconds;
  const canSwitchModes = !isDiscussing && !isPaused;

  const theme = darkMode ? "dark" : "light";
  const bgClass = darkMode
    ? "bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.10),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.08),_transparent_24%),linear-gradient(135deg,_#020617_0%,_#0b1120_48%,_#111827_100%)]"
    : "bg-gradient-to-br from-slate-50 via-white to-slate-100";
  const textClass = darkMode ? "text-slate-100" : "text-slate-900";
  const cardBg = darkMode
    ? "bg-slate-900/72 shadow-[0_12px_40px_rgba(2,6,23,0.38)] backdrop-blur-xl"
    : "bg-white/90 border-slate-200/60";
  const subCardBg = darkMode
    ? "bg-slate-800/55"
    : "bg-slate-50/80 border-slate-200/50";
  const inputBg = darkMode
    ? "bg-slate-950/80 border-transparent text-slate-100 placeholder-slate-500"
    : "bg-white border-slate-200 text-slate-900 placeholder-slate-400";
  const mutedText = darkMode ? "text-slate-300/90" : "text-slate-500";
  const subtleBg = darkMode ? "bg-slate-800/45" : "bg-slate-100/60";
  const transcriptForDisplay = useMemo(() => {
    const withVisibleRoles = settings.showSystemMessages
      ? transcript
      : transcript.filter((entry) => entry.role !== "system");

    if (
      settings.showLiveTranscript ||
      hasEndedDiscussion ||
      showStudentDraftIndicator ||
      hasCommittedStudentTranscript
    ) {
      return withVisibleRoles;
    }

    return [];
  }, [
    hasCommittedStudentTranscript,
    hasEndedDiscussion,
    showStudentDraftIndicator,
    settings.showLiveTranscript,
    settings.showSystemMessages,
    transcript,
  ]);
  const showLiveTranscriptContent =
    settings.showLiveTranscript || hasEndedDiscussion || showStudentDraftIndicator;
  const showDraftIndicatorForDisplay =
    showStudentDraftIndicator && showLiveTranscriptContent;
  const transcriptCopyText = useMemo(
    () => buildTranscriptCopy(transcript, settings.showSystemMessages),
    [settings.showSystemMessages, transcript],
  );
  const canCopyTranscript =
    (settings.showLiveTranscript || hasEndedDiscussion || hasCommittedStudentTranscript) &&
    transcriptCopyText.trim().length > 0;
  const transcriptPanelHeightClass = hasEndedDiscussion
    ? "h-[460px]"
    : "h-[560px]";
  const discussionPanelHeightClass = hasEndedDiscussion
    ? "lg:h-[460px]"
    : "lg:h-[560px]";
  const evaluationCopyText = evaluation ? buildEvaluationCopy(evaluation) : "";
  const canRerunEvaluation =
    Boolean(evaluation) &&
    !isEvaluating &&
    lastEvaluatedFeedbackDetailLevel !== null &&
    lastEvaluatedFeedbackDetailLevel !== settings.feedbackDetailLevel;

  const statusColor = useMemo(() => {
    switch (sessionPhase) {
      case "student-speaking":
        return "bg-emerald-500";
      case "paused":
        return "bg-amber-500";
      default:
        return "bg-slate-400";
    }
  }, [sessionPhase]);

  const statusLabel = useMemo(() => {
    switch (sessionPhase) {
      case "student-speaking":
        return "Discussion";
      case "paused":
        return "En pause";
      default:
        return "Inactif";
    }
  }, [sessionPhase]);

  function pushDebugEvent(message: string) {
    const timestamp = new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setDebugEvents((current) => [
      ...current.slice(-11),
      `${timestamp}  ${message}`,
    ]);
  }

  function handleParse() {
    const nextGrid = extractGradingGridOnly(rawInput);
    setGradingGrid(nextGrid);
    setEvaluation(null);
    setShowEvaluationReport(false);
    setShowReportAudioPlayer(false);
    setLastEvaluatedFeedbackDetailLevel(null);
    setHasEndedDiscussion(false);

    if (!nextGrid) {
      setParseError(
        "Impossible d'identifier une grille de correction exploitable dans ce texte.",
      );
      setStatus("Session sans PS prête");
      return;
    }

    setParseError("");
    setStatus("Grille prête pour évaluation");
  }

  function resetRecordingState() {
    shouldSendAudioRef.current = true;
    pendingManualTurnEndRef.current = false;
    if (turnEndFallbackTimerRef.current !== null) {
      window.clearTimeout(turnEndFallbackTimerRef.current);
      turnEndFallbackTimerRef.current = null;
    }
    inputTranscriptRef.current = "";
    monologueEntryIdRef.current = null;
    audioChunkCountRef.current = 0;
    lastAudioDebugAtRef.current = 0;
    lastLiveUsageTotalsRef.current = {
      inputTextTokens: 0,
      inputAudioTokens: 0,
      outputTextTokens: 0,
      outputAudioTokens: 0,
      totalTokens: 0,
    };
    setShowStudentDraftIndicator(false);
    setStudentDraftText("");
    setMicLevel(0);
    setMicPeak(0);

    if (recordedAudioUrlRef.current) {
      URL.revokeObjectURL(recordedAudioUrlRef.current);
      recordedAudioUrlRef.current = null;
    }

    setRecordedAudioUrl(null);
  }

  function flushStudentDraft() {
    const text = inputTranscriptRef.current.trim();
    if (!text) {
      setShowStudentDraftIndicator(false);
      setStudentDraftText("");
      return;
    }

    const entryId = monologueEntryIdRef.current ?? crypto.randomUUID();
    monologueEntryIdRef.current = entryId;
    setTranscript((current) =>
      upsertTranscriptEntryAtEndById(current, entryId, "student", text),
    );
    inputTranscriptRef.current = "";
    setShowStudentDraftIndicator(false);
    setStudentDraftText("");
  }

  function clearTurnEndFallbackTimer() {
    if (turnEndFallbackTimerRef.current !== null) {
      window.clearTimeout(turnEndFallbackTimerRef.current);
      turnEndFallbackTimerRef.current = null;
    }
  }

  function scheduleTurnEndFallbackFlush(reason: string) {
    clearTurnEndFallbackTimer();
    turnEndFallbackTimerRef.current = window.setTimeout(() => {
      turnEndFallbackTimerRef.current = null;
      if (!pendingManualTurnEndRef.current) {
        return;
      }

      pushDebugEvent(`${reason}: flush de secours du draft`);
      flushStudentDraft();
      pendingManualTurnEndRef.current = false;
      setSessionPhase("idle");
      setStatus("En attente de l'étudiant");
    }, 1600);
  }

  function requestTurnCompletion(reason: string) {
    pendingManualTurnEndRef.current = true;
    sessionRef.current?.sendRealtimeInput?.({ audioStreamEnd: true });
    pushDebugEvent(`${reason}: audioStreamEnd envoyé`);
    scheduleTurnEndFallbackFlush(reason);
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
      await micRef.current?.stop();
      sessionRef.current?.close();
    } catch {
      //
    } finally {
      micRef.current = null;
      sessionRef.current = null;
      currentSessionIdRef.current = null;
      shouldSendAudioRef.current = true;
      inputTranscriptRef.current = "";
      monologueEntryIdRef.current = null;
      autoEvaluateHandledRef.current = false;
      autoExportedEvaluationRef.current = null;
      setTranscript([]);
      setEvaluation(null);
      setShowEvaluationReport(false);
      setShowReportAudioPlayer(false);
      setLastEvaluatedFeedbackDetailLevel(null);
      setHasEndedDiscussion(false);
      setIsConnecting(false);
      setIsDiscussing(false);
      setIsPaused(false);
      setSessionPhase("idle");
      setStatus(gradingGrid ? "Grille prête pour évaluation" : "Session sans PS prête");
      setRemainingSeconds(settings.defaultTimerSeconds);
      setShowStudentDraftIndicator(false);
      setMicLevel(0);
      setMicPeak(0);
      setEvaluationProgress(0);
      setIsEvaluating(false);
      setIsMicMuted(false);
      isMicMutedRef.current = false;
      resetRecordingState();
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
    setRawInput("");
    setGradingGrid("");
    setParseError("");
    setShowEvaluationReport(false);
    setShowReportAudioPlayer(false);
    setStatus("Session sans PS prête");
    onShowToast(
      "Zone vidée",
      "Le texte collé et les résultats associés ont été supprimés.",
      "success",
    );
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

    if (action === "reset") {
      void handleResetSession();
      return;
    }

    void handleClearText();
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

  async function startSessionInternal() {
    try {
      currentSessionIdRef.current = crypto.randomUUID();
      setIsConnecting(true);
      setEvaluation(null);
      setHasEndedDiscussion(false);
      setStatus("Préparation de la session");
      setRemainingSeconds(sessionDurationSeconds);
      setTranscript([
        createTranscriptEntry(
          "system",
          "Session démarrée. Présentez votre raisonnement et votre conduite à tenir.",
        ),
      ]);
      setDebugEvents([]);
      pushDebugEvent("Session Sans PS initialisée");
      setIsPaused(false);
      setIsMicMuted(false);
      isMicMutedRef.current = false;
      resetRecordingState();
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
          mode: "silent",
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
      pushDebugEvent(
        `Jeton Live reçu (mode=silent, model=${tokenPayload.model || liveModel})`,
      );

      setStatus("Ouverture de la session Live");

      const ai = new GoogleGenAI({
        apiKey: tokenPayload.token,
        httpOptions: {
          apiVersion: "v1alpha",
        },
      });

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
              silenceDurationMs: 1800,
            },
            activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
            turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
          },
        },
        callbacks: {
          onopen: () => {
            shouldSendAudioRef.current = true;
            setStatus("Session Live ouverte, en attente de l'étudiant");
            setSessionPhase("idle");
            pushDebugEvent("Connexion Live ouverte");
          },

          onmessage: (message: LiveServerMessage) => {
            const liveMessage = message as SansPsLiveMessage;
            const serverContent = liveMessage.serverContent;
            const modelTurn = serverContent?.modelTurn;

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

            const inputTranscription =
              liveMessage.inputTranscription ??
              serverContent?.inputTranscription;

            pushDebugEvent(
              [
                "Live msg",
                inputTranscription?.text?.trim()
                  ? `inputTx=${inputTranscription.text.trim().length}c`
                  : "inputTx=0",
                serverContent?.generationComplete ? "generationComplete" : null,
                serverContent?.turnComplete ? "turnComplete" : null,
                serverContent?.waitingForInput
                  ? "waitingForInput"
                  : null,
              ]
                .filter(Boolean)
                .join(" | "),
            );

            if (inputTranscription?.text) {
              pushDebugEvent(
                `Transcription reçue: ${inputTranscription.text.slice(0, 80)}`,
              );
              inputTranscriptRef.current = appendTranscriptChunk(
                inputTranscriptRef.current,
                inputTranscription.text,
              );
              setStudentDraftText(inputTranscriptRef.current);
              setSessionPhase("student-speaking");
              setStatus("Session en cours");
              setShowStudentDraftIndicator(true);
              if (pendingManualTurnEndRef.current) {
                scheduleTurnEndFallbackFlush("Mute");
              }
            }

            const parts = modelTurn?.parts ?? [];
            const hasAudioParts = parts.some(
              (part) =>
                !!part.inlineData?.data &&
                !!part.inlineData.mimeType?.startsWith("audio/pcm"),
            );

            if (hasAudioParts) {
              pushDebugEvent("Audio modèle détecté, draft étudiant finalisé");
              shouldSendAudioRef.current = false;
              flushStudentDraft();
              setShowStudentDraftIndicator(false);
            }

            if (serverContent?.interrupted) {
              shouldSendAudioRef.current = true;
              setSessionPhase("student-speaking");
              setStatus("Session en cours");
              setShowStudentDraftIndicator(true);
            }

            if (serverContent?.generationComplete) {
              setSessionPhase("idle");
              setStatus("Traitement de la fin de tour");
            }

            if (serverContent?.waitingForInput) {
              shouldSendAudioRef.current = true;
              clearTurnEndFallbackTimer();
              pendingManualTurnEndRef.current = false;
              pushDebugEvent("waitingForInput détecté, flush du draft");
              flushStudentDraft();
              setSessionPhase("idle");
              setStatus("En attente de l'étudiant");
            }

            if (serverContent?.turnComplete) {
              shouldSendAudioRef.current = true;
              clearTurnEndFallbackTimer();
              pendingManualTurnEndRef.current = false;
              pushDebugEvent("turnComplete détecté, flush du draft");
              flushStudentDraft();
              setSessionPhase("idle");
              setStatus("En attente de l'étudiant");
            }
          },

          onerror: (error) => {
            shouldSendAudioRef.current = true;
            clearTurnEndFallbackTimer();
            pendingManualTurnEndRef.current = false;
            setStatus(`Erreur Live : ${error.message}`);
            setSessionPhase("idle");
            setShowStudentDraftIndicator(false);
            setStudentDraftText("");
            pushDebugEvent(`Erreur Live: ${error.message}`);
          },

          onclose: () => {
            shouldSendAudioRef.current = true;
            clearTurnEndFallbackTimer();
            pendingManualTurnEndRef.current = false;
            setSessionPhase("idle");
            setShowStudentDraftIndicator(false);
            setStudentDraftText("");
            pushDebugEvent("Connexion Live fermée");
          },
        },
      })) as LiveSession;

      sessionRef.current = session;

      const microphone = await startMicrophoneStream(
        async (chunk) => {
          if (!shouldSendAudioRef.current || isPaused || isMicMutedRef.current) {
            return;
          }

          const arrayBuffer = await chunk.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          const base64Audio = uint8ToBase64(uint8);

          audioChunkCountRef.current += 1;
          const now = Date.now();
          if (now - lastAudioDebugAtRef.current > 1500) {
            lastAudioDebugAtRef.current = now;
            pushDebugEvent(`Audio envoyé (${audioChunkCountRef.current} chunks)`);
          }

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

          const isSpeaking = sample.rms >= 0.02 || sample.peak >= 0.06;
          if (isSpeaking && !isPaused && shouldSendAudioRef.current) {
            setSessionPhase("student-speaking");
            setStatus("Session en cours");
            setShowStudentDraftIndicator(true);
          }
        },
        mediaStream,
      );

      micRef.current = microphone;
      setIsDiscussing(true);
      setSessionPhase("idle");
      setStatus("Session Live ouverte, en attente de l'étudiant");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setStatus(`Impossible de démarrer : ${message}`);
      onShowToast("Démarrage impossible", message, "error");
      setSessionPhase("idle");
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur : ${message}`),
      ]);
    } finally {
      setIsConnecting(false);
    }
  }

  async function startSession() {
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

      await startSessionInternal();
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

  async function togglePauseSession() {
    if (!isDiscussing && !isPaused) {
      return;
    }

    if (!isPaused) {
      requestTurnCompletion("Pause");
      shouldSendAudioRef.current = false;
      isMicMutedRef.current = true;
      setIsMicMuted(true);
      setMicLevel(0);
      setMicPeak(0);
      setIsDiscussing(false);
      setIsPaused(true);
      setSessionPhase("paused");
      setStatus("Session en pause");
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", "Session mise en pause."),
      ]);
      return;
    }

    shouldSendAudioRef.current = true;
    isMicMutedRef.current = false;
    setIsMicMuted(false);
    pushDebugEvent("Session reprise");
    setIsDiscussing(true);
    setIsPaused(false);
    setSessionPhase("idle");
    setStatus("Session reprise");
    setTranscript((current) => [
      ...current,
      createTranscriptEntry("system", "Session reprise."),
    ]);
  }

  async function stopSession() {
    setStatus("Finalisation de la session");
    let finished = false;
    let elapsedSummary = "";

    try {
      elapsedSummary = formatElapsedDiscussion(
        sessionDurationSeconds - remainingSeconds,
      );
      shouldSendAudioRef.current = false;
      clearTurnEndFallbackTimer();
      pendingManualTurnEndRef.current = false;
      flushStudentDraft();
      requestTurnCompletion("Terminer");
      const recordedBlob = await micRef.current?.stop();
      if (recordedBlob) {
        const nextUrl = URL.createObjectURL(recordedBlob);
        recordedAudioUrlRef.current = nextUrl;
        setRecordedAudioUrl(nextUrl);
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 1400);
      });

      flushStudentDraft();

      sessionRef.current?.close();

      finished = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur : ${message}`),
      ]);
    } finally {
      micRef.current = null;
      sessionRef.current = null;
      currentSessionIdRef.current = null;
      shouldSendAudioRef.current = true;
      clearTurnEndFallbackTimer();
      pendingManualTurnEndRef.current = false;
      inputTranscriptRef.current = "";
      setShowStudentDraftIndicator(false);
      setIsDiscussing(false);
      setIsPaused(false);
      setHasEndedDiscussion(true);
      setSessionPhase("idle");
      setStatus("Session terminée. Transcription prête pour évaluation.");
      setMicLevel(0);
      setMicPeak(0);

      if (finished) {
        onShowToast(
          "Session terminée",
          `Vous avez terminé en ${elapsedSummary}.`,
          "success",
        );
      }
    }
  }

  async function evaluateDiscussion() {
    try {
      setIsEvaluating(true);
      setStatus("Évaluation de la transcription");

      const cleanedTranscript = transcriptToPlainText(
        transcript
          .filter(
            (entry) => entry.role === "student" && entry.text.trim().length > 0,
          )
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
          gradingGrid,
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

  function toggleMicMute() {
    setIsMicMuted((current) => {
      const next = !current;
      isMicMutedRef.current = next;

      if (next) {
        requestTurnCompletion("Mute");
        setSessionPhase("idle");
        setStatus("Transcription en attente");
        shouldSendAudioRef.current = false;
        setMicLevel(0);
        setMicPeak(0);
      } else {
        shouldSendAudioRef.current = true;
        pushDebugEvent("Micro réactivé");
        if (isDiscussing && !isPaused) {
          setStatus("Session en cours");
        }
      }

      return next;
    });
  }

  function exportPdf() {
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) {
      onShowToast(
        "Export PDF bloqué",
        "Autorisez les popups pour ouvrir l’aperçu d’impression.",
        "error",
      );
      return;
    }

    popup.document.open();
    popup.document.write(
      buildSansPsPdfDocument(
        rawInput,
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
  }

  function downloadRecordedAudio() {
    if (!recordedAudioUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = recordedAudioUrl;
    link.download = `ecos-monologue-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`;
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
    if (!isDiscussing) {
      return;
    }

    if (remainingSeconds <= 0) {
      void stopSession();
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
    return () => {
      shouldSendAudioRef.current = false;
      clearTurnEndFallbackTimer();
      pendingManualTurnEndRef.current = false;
      void micRef.current?.stop();
      sessionRef.current?.close();
      if (recordedAudioUrlRef.current) {
        URL.revokeObjectURL(recordedAudioUrlRef.current);
      }
    };
  }, []);

  return (
    <div className={`min-h-screen ${theme} ${bgClass} ${textClass} transition-colors duration-300`}>
      <header className="sticky top-0 z-40 border-b border-slate-200/20 backdrop-blur-xl dark:border-slate-700/20">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/20">
              <ActivityIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ECOS-AI</h1>
              <p className={`text-xs ${mutedText}`}>Simulateur d&apos;examen clinique</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`flex items-center rounded-xl border p-1 ${
              darkMode
                ? "border-transparent bg-slate-800"
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
              className={`rounded-xl border p-2.5 transition-all duration-200 ${
                darkMode
                  ? "border-transparent bg-slate-800/70 hover:bg-slate-700/80"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              aria-label="Open dashboard"
            >
              <ActivityIcon className={`h-5 w-5 ${darkMode ? "text-slate-200" : "text-slate-600"}`} />
            </button>

            <button
              onClick={() => onDarkModeChange(!darkMode)}
              className={`rounded-xl border p-2.5 transition-all duration-200 ${
                darkMode
                  ? "border-transparent bg-slate-800/70 hover:bg-slate-700/80"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              aria-label="Basculer le mode sombre"
            >
              {darkMode ? (
                <SunIcon className="h-5 w-5 text-amber-400" />
              ) : (
                <MoonIcon className="h-5 w-5 text-slate-600" />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className={`rounded-xl border p-2.5 transition-all duration-200 ${
                darkMode
                  ? "border-transparent bg-slate-800/70 hover:bg-slate-700/80"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              aria-label="Open settings"
            >
              <SettingsIcon className={`h-5 w-5 ${darkMode ? "text-slate-200" : "text-slate-600"}`} />
            </button>
          </div>
        </div>
      </header>

      {showEvaluationReport && evaluation ? (
        <main className="mx-auto max-w-[1280px] px-6 py-8">
          <div className="space-y-6">
            <div className={`rounded-2xl ${darkMode ? "" : "border"} ${cardBg} p-6 shadow-soft`}>
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
                    ← Retour à la session
                  </button>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight">Résultats de l&apos;évaluation</h1>
                  <p className={`mt-2 text-sm ${mutedText}`}>
                    Rapport détaillé de la station avec synthèse pédagogique et recommandations.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[440px] xl:max-w-[860px] xl:items-end">
                  <div className="flex flex-nowrap items-center gap-2">
                    {canRerunEvaluation && (
                      <button
                        onClick={handleRerunEvaluation}
                        className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-primary-700"
                      >
                        Re-run evaluation
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
                          <PlayIcon className="h-4 w-4" />
                          Play discussion audio
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
                          <DownloadIcon className="h-4 w-4" />
                          Download discussion audio
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
                      <CopyIcon className="h-4 w-4" />
                      Copy evaluation
                    </button>
                    <button
                      onClick={exportPdf}
                      className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-slate-800 px-3.5 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
                    >
                      <FileTextIcon className="h-4 w-4" />
                      Export PDF
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
              feedbackDetailLabel={formatFeedbackDetailLabel(
                lastEvaluatedFeedbackDetailLevel ?? settings.feedbackDetailLevel,
              )}
              elapsedSeconds={sessionDurationSeconds - remainingSeconds}
            />
          </div>
        </main>
      ) : (
      <main className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[470px_1fr]">
          <div className="space-y-6">
            <div className={`rounded-2xl ${darkMode ? "" : "border"} ${cardBg} p-6 shadow-soft`}>
              <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <h2 className="flex min-w-0 items-center gap-2 whitespace-nowrap text-base font-semibold md:text-lg">
                  <FileTextIcon className="h-5 w-5 shrink-0 text-primary-500" />
                  <span>Configuration de station</span>
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
                        : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700"
                    }`}
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleParse}
                    className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-primary-500/20 transition-colors hover:bg-primary-700 md:px-4 md:text-sm"
                  >
                    Analyser
                  </button>
                </div>
              </div>

              <textarea
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                placeholder="Collez ici la grille de correction de la station..."
                className={`h-64 w-full resize-none rounded-xl border p-4 text-sm leading-relaxed transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 ${inputBg}`}
              />

              {parseError ? (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
                  {parseError}
                </div>
              ) : (
                <p className={`mt-3 text-xs ${mutedText}`}>
                  Aucun patient n&apos;est simulé. La grille sert de référence pour l&apos;évaluation finale.
                </p>
              )}
            </div>

            <div className={`rounded-2xl ${darkMode ? "" : "border"} ${cardBg} p-6 shadow-soft`}>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <ActivityIcon className="h-5 w-5 text-primary-500" />
                Consigne
              </h2>
              <div className={`rounded-xl ${darkMode ? "" : "border"} ${subCardBg} p-4`}>
                <p className="text-sm font-medium">
                  Présentez votre raisonnement à voix haute comme devant un examinateur.
                </p>
                <p className={`mt-2 text-sm leading-relaxed ${mutedText}`}>
                  Le mode sans PS reprend la logique de la station sans patient interactif : l&apos;étudiant parle librement, la session est transcrite, puis le contenu final est comparé à la grille après `Terminer`.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={`rounded-2xl ${darkMode ? "" : "border"} ${cardBg} p-6 shadow-soft`}>
              <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="flex min-w-0 items-center gap-4">
                  <div className={`h-3 w-3 rounded-full ${statusColor} ${sessionPhase !== "idle" ? "animate-pulse" : ""}`} />
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">Session de discussion</h2>
                    <p className={`text-sm ${mutedText}`}>{status}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${subtleBg}`}>
                    {statusLabel}
                  </span>
                </div>

                <div className="flex flex-nowrap items-center gap-3 lg:shrink-0">
                  <button
                    onClick={startSession}
                    disabled={!canStart}
                    className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                      canStart
                        ? darkMode
                          ? "bg-primary-500 text-white shadow-lg shadow-primary-500/20 hover:bg-primary-400"
                          : "bg-primary-600 text-white shadow-lg shadow-primary-500/20 hover:bg-primary-700"
                        : darkMode
                          ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                          : "cursor-not-allowed bg-slate-200 text-slate-400"
                    }`}
                  >
                    <PlayIcon className="h-4 w-4" />
                    {isConnecting ? "Connexion..." : "Démarrer"}
                  </button>

                  <button
                    onClick={togglePauseSession}
                    disabled={!canPause && !isPaused}
                    className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                      canPause || isPaused
                        ? darkMode
                          ? "bg-slate-800/85 text-slate-100 hover:bg-slate-700/90"
                          : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
                        : darkMode
                          ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                          : "cursor-not-allowed bg-slate-200 text-slate-400"
                    }`}
                  >
                    {isPaused ? (
                      <PlayIcon className="h-4 w-4" />
                    ) : (
                      <PauseIcon className="h-4 w-4" />
                    )}
                    {isPaused ? "Reprendre" : "Pause"}
                  </button>

                  <button
                    onClick={stopSession}
                    disabled={!canEnd}
                    className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                      canEnd
                        ? darkMode
                          ? "bg-slate-800/85 text-slate-100 hover:bg-slate-700/90"
                          : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
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
                    className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                      canJudge
                        ? darkMode
                          ? "bg-slate-800/85 text-slate-100 hover:bg-slate-700/90"
                          : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
                        : darkMode
                          ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                          : "cursor-not-allowed bg-slate-200 text-slate-400"
                    }`}
                  >
                    <CheckIcon className="h-4 w-4" />
                    Évaluer
                  </button>

                  <button
                    onClick={requestResetSession}
                    disabled={!canResetSession}
                    className={`flex min-w-[112px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                      canResetSession
                        ? darkMode
                          ? "bg-slate-800/85 text-slate-100 hover:bg-slate-700/90"
                          : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
                        : darkMode
                          ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                          : "cursor-not-allowed bg-slate-200 text-slate-400"
                    }`}
                  >
                    <ResetIcon className="h-4 w-4" />
                    Reset
                  </button>
                </div>
              </div>
            </div>

            <div className={`grid min-h-0 items-start grid-cols-1 gap-6 lg:grid-cols-[320px_1fr] ${discussionPanelHeightClass}`}>
              <div className={`self-start rounded-2xl ${darkMode ? "" : "border"} ${cardBg} p-6 shadow-soft lg:h-full`}>
                <div className="flex items-center gap-2">
                  <ClockIcon className={`h-4 w-4 ${mutedText}`} />
                  <span className="text-sm font-semibold">Outils de session</span>
                </div>

                <div className={`mt-5 rounded-2xl p-5 ${darkMode ? "bg-slate-950/36" : "border border-slate-200/70"}`}>
                  <div className="flex items-center gap-2">
                    <ClockIcon className={`h-4 w-4 ${mutedText}`} />
                    <span className={`text-sm font-medium ${mutedText}`}>Temps restant</span>
                  </div>

                  <div className={`mt-3 text-center text-5xl font-bold tracking-tight tabular-nums ${timerDanger ? "animate-pulse text-rose-500" : ""}`}>
                    {formatCountdown(remainingSeconds)}
                  </div>

                  <div className="mt-4">
                    <div className={`h-2 overflow-hidden rounded-full ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${timerDanger ? "bg-rose-500" : "bg-primary-500"}`}
                        style={{
                          width: `${Math.max(0, Math.min(100, (remainingSeconds / sessionDurationSeconds) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-200/70 pt-5 dark:border-slate-700/60">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {isMicMuted ? (
                        <MicOffIcon className={`h-4 w-4 ${mutedText}`} />
                      ) : (
                        <MicIcon className={`h-4 w-4 ${mutedText}`} />
                      )}
                      <span className={`text-sm font-medium ${mutedText}`}>Microphone</span>
                    </div>
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

                  <div className="relative mx-auto mt-5 h-32 w-32">
                    <div
                      className={`pointer-events-none absolute inset-0 rounded-full ${
                        isMicMuted
                          ? darkMode
                            ? "bg-rose-950/25"
                            : "bg-rose-50/80"
                          : darkMode
                            ? "bg-slate-800/30"
                            : "bg-primary-100/50"
                      }`}
                    />
                    {Array.from({ length: 36 }, (_, i) => {
                      const angle = (360 / 36) * i;
                      const displayPeak = isMicMuted ? 0 : micPeak;
                      const active =
                        !isMicMuted && i < Math.max(3, Math.round(displayPeak * 36));
                      const barHeight = active ? 12 + displayPeak * 18 : 6;

                      return (
                        <div
                          key={i}
                          className="pointer-events-none absolute left-1/2 top-1/2 origin-bottom rounded-full"
                          style={{
                            width: 4,
                            height: barHeight,
                            transform: `translate(-50%, -100%) rotate(${angle}deg) translateY(-38px)`,
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
                    <button
                      type="button"
                      onClick={toggleMicMute}
                      aria-pressed={isMicMuted}
                      aria-label={
                        isMicMuted
                          ? "Réactiver le microphone"
                          : "Couper le microphone"
                      }
                      title={
                        isMicMuted
                          ? "Réactiver le microphone"
                          : "Couper le microphone"
                      }
                      className={`absolute inset-0 z-10 m-auto flex h-16 w-16 items-center justify-center rounded-full transition-all ${
                        isMicMuted
                          ? darkMode
                            ? "border-transparent bg-slate-900"
                            : "border border-rose-200 bg-white"
                          : darkMode
                            ? "border-transparent bg-slate-800 hover:bg-slate-700"
                            : "border border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      {isMicMuted ? (
                        <MicOffIcon className="h-7 w-7 text-rose-500" />
                      ) : (
                        <MicIcon className="h-7 w-7 text-slate-700 dark:text-slate-200" />
                      )}
                    </button>
                  </div>

                  <div className="mt-5 border-t border-slate-200/70 pt-5 dark:border-slate-700/60">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold">Voix du patient</h3>
                        <p className={`mt-1 text-xs ${mutedText}`}>
                          Disponible uniquement en mode PS / PSS.
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                        darkMode
                          ? "bg-slate-800 text-slate-300"
                          : "bg-slate-100 text-slate-500"
                      }`}>
                        Disabled
                      </span>
                    </div>

                    <div className={`mt-4 rounded-xl ${darkMode ? "" : "border"} ${subCardBg} p-3 opacity-75`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                              darkMode
                                ? "bg-slate-800 text-slate-300"
                                : "bg-slate-100 text-slate-500"
                            }`}>
                              <VoiceFemaleIcon className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold leading-tight">
                                Voix disponible en mode PS / PSS
                              </div>
                              <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-[11px] ${mutedText}`}>
                                <span className={`rounded-full px-2 py-0.5 ${
                                  darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"
                                }`}>
                                  Sélection désactivée
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled
                          className="shrink-0 cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-400 dark:border-transparent dark:bg-slate-800 dark:text-slate-500"
                        >
                          Modifier
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`flex ${transcriptPanelHeightClass} min-h-0 flex-col overflow-hidden rounded-2xl ${darkMode ? "" : "border"} ${cardBg} p-6 shadow-soft lg:h-full`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Transcription du monologue</h3>
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
                        ? "border-transparent bg-slate-100 text-slate-900 hover:bg-white"
                        : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-50"
                    } ${!canCopyTranscript ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <CopyIcon className="h-4 w-4" />
                    Copy transcript
                  </button>
                </div>
                <div
                  ref={transcriptRef}
                  className={`min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth rounded-xl ${
                    darkMode ? "bg-slate-950/50" : "bg-slate-50/80"
                  }`}
                >
                  {transcriptForDisplay.length === 0 && !showDraftIndicatorForDisplay ? (
                    <div className="flex h-full items-center justify-center rounded-xl p-4">
                      <div className="text-center">
                        <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${subtleBg}`}>
                          <ActivityIcon className={`h-8 w-8 ${mutedText}`} />
                        </div>
                        {!settings.showLiveTranscript && !hasEndedDiscussion ? (
                          <>
                            <p className={`text-sm ${mutedText}`}>
                              La transcription en direct est masquée
                            </p>
                            <p className={`mt-1 text-xs ${mutedText}`}>
                              Elle sera visible à la fin du monologue.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className={`text-sm ${mutedText}`}>
                              La transcription du monologue apparaîtra ici
                            </p>
                            <p className={`mt-1 text-xs ${mutedText}`}>
                              Démarrez la session puis laissez les silences segmenter votre discours
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
                            entry.role === "student" ? "w-full" : "mx-auto max-w-full"
                          }`}
                        >
                          {entry.role === "system" ? (
                            <div className="mx-auto max-w-[78%] py-1.5 text-center">
                              <div className="flex items-center gap-3">
                                <span className={`h-px flex-1 ${darkMode ? "bg-slate-800" : "bg-slate-200"}`} />
                                <span className={`max-w-[80%] text-[11px] font-medium leading-relaxed whitespace-pre-wrap ${mutedText}`}>
                                  {entry.text}
                                </span>
                                <span className={`h-px flex-1 ${darkMode ? "bg-slate-800" : "bg-slate-200"}`} />
                              </div>
                              <div className={`mt-1 text-[10px] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                                {entry.timestamp}
                              </div>
                            </div>
                          ) : (
                            <div className="flex w-full justify-start">
                              <div className="w-full max-w-[84%]">
                                <div className={`mb-1.5 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                  darkMode ? "text-slate-400" : "text-slate-500"
                                }`}>
                                  <span>STUDENT</span>
                                  <span className={darkMode ? "text-slate-500" : "text-slate-400"}>
                                    {entry.timestamp}
                                  </span>
                                </div>
                                <div className={`rounded-2xl px-4 py-3 text-left shadow-sm ${
                                  darkMode
                                    ? "border border-slate-700 bg-slate-900/95 text-slate-100"
                                    : "border border-slate-200 bg-white text-slate-700"
                                }`}>
                                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                    {entry.text}
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
                            <div className="w-full max-w-[84%]">
                              <div className={`mb-1.5 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                darkMode ? "text-slate-400" : "text-slate-500"
                              }`}>
                                <span>STUDENT</span>
                                <span className={darkMode ? "text-slate-500" : "text-slate-400"}>
                                  {createTimestamp()}
                                </span>
                              </div>
                              <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                                darkMode
                                  ? "border border-slate-700 bg-slate-900/95 text-slate-100"
                                  : "border border-slate-200 bg-white text-slate-700"
                              }`}>
                                {studentDraftText.trim() ? (
                                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                    {studentDraftText}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-sm">
                                    <span>En train de parler</span>
                                    <span className="flex gap-1">
                                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-500" />
                                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-500 [animation-delay:150ms]" />
                                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-500 [animation-delay:300ms]" />
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div
                  className={`mt-4 rounded-xl border px-4 py-3 text-xs ${
                    darkMode
                      ? "border-slate-700 bg-slate-950/60 text-slate-300"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-semibold uppercase tracking-[0.18em]">
                      Debug Live
                    </span>
                    <span className={mutedText}>
                      {debugEvents.length > 0 ? `${debugEvents.length} événements` : "Aucun événement"}
                    </span>
                  </div>
                  {debugEvents.length === 0 ? (
                    <p className={mutedText}>
                      Les messages debug de la session Sans PS apparaîtront ici.
                    </p>
                  ) : (
                    <div className="space-y-1 font-mono">
                      {debugEvents.map((event, index) => (
                        <div key={`${event}-${index}`} className="break-words">
                          {event}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
      )}

      {isEvaluating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border ${cardBg} p-8 shadow-2xl`}>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100 dark:bg-primary-900/30">
                <ActivityIcon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="mb-2 text-xl font-bold">Évaluation en cours</h3>
              <p className={`mb-6 text-sm ${mutedText}`}>
                {EVALUATION_PROGRESS_MESSAGES[evaluationMessageIndex]}
              </p>
            </div>

            <div className={`h-3 overflow-hidden rounded-full ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
              <div
                className="h-full rounded-full bg-primary-500 transition-all duration-300"
                style={{ width: `${evaluationProgress}%` }}
              />
            </div>

            <div className="mt-4 text-center">
              <div className={`mb-2 inline-flex items-center gap-2 text-xs font-medium ${mutedText}`}>
                <span className="h-2 w-2 rounded-full bg-primary-500 animate-pulse" />
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
        confirmLabel={sessionGuardDialog?.action === "clear" ? "Effacer" : "Réinitialiser"}
        cancelLabel="Annuler"
        tone="danger"
        onCancel={() => setSessionGuardDialog(null)}
        onConfirm={confirmSessionGuardAction}
      />

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
                      void startSessionInternal();
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

    </div>
  );
}
