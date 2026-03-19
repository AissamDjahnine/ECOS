import { useEffect, useMemo, useRef, useState } from "react";
import {
  requestMicrophoneStream,
  startMicrophoneStream,
  type AudioStreamer,
  type MicrophoneLevelSample,
} from "./lib/audio";
import { extractGradingGridOnly, transcriptToPlainText } from "./lib/parser";
import type {
  AppSettings,
  EvaluationResult,
  TranscriptEntry,
} from "./types";

type SessionPhase = "idle" | "student-speaking" | "paused";

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
  rawInput: string,
  transcript: TranscriptEntry[],
  evaluation: EvaluationResult | null,
) {
  const transcriptHtml = transcript
    .filter((entry) => entry.text.trim().length > 0)
    .map((entry) => {
      const background =
        entry.role === "student" ? "#dbeafe" : "#e5e7eb";
      const align = entry.role === "student" ? "margin-left:auto;" : "margin:0 auto;";

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
        <p style="margin:0 0 24px; color:#475569;">Station sans PS</p>

        <h2>Sujet</h2>
        <div style="border:1px solid #cbd5e1; border-radius:16px; padding:16px; white-space:pre-wrap;">
          ${rawInput
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

type SansPsPageProps = {
  currentMode: "ps" | "sans-ps";
  onNavigate: (mode: "ps" | "sans-ps") => void;
  settings: AppSettings;
  onOpenSettings: () => void;
  darkMode: boolean;
  onDarkModeChange: (value: boolean) => void;
};

export default function SansPsPage({
  currentMode,
  onNavigate,
  settings,
  onOpenSettings,
  darkMode,
  onDarkModeChange,
}: SansPsPageProps) {
  const [rawInput, setRawInput] = useState("");
  const [gradingGrid, setGradingGrid] = useState("");
  const [parseError, setParseError] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [status, setStatus] = useState("Mode sans PS prêt");
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("idle");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasEndedDiscussion, setHasEndedDiscussion] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationProgress, setEvaluationProgress] = useState(0);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(
    settings.defaultTimerSeconds,
  );
  const [showStudentDraftIndicator, setShowStudentDraftIndicator] =
    useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micPeak, setMicPeak] = useState(0);
  const [completionToast, setCompletionToast] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [evaluationWarning, setEvaluationWarning] = useState<{
    mode: "confirm" | "blocked";
    title: string;
    body: string;
  } | null>(null);
  const [lastEvaluatedFeedbackDetailLevel, setLastEvaluatedFeedbackDetailLevel] =
    useState<AppSettings["feedbackDetailLevel"] | null>(null);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const micRef = useRef<AudioStreamer | null>(null);
  const recordedAudioUrlRef = useRef<string | null>(null);
  const autoEvaluateHandledRef = useRef(false);
  const autoExportedEvaluationRef = useRef<string | null>(null);
  const completionToastTimerRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const currentTurnChunksRef = useRef<Blob[]>([]);
  const isSpeechActiveRef = useRef(false);
  const isFinalizingTurnRef = useRef(false);
  const shouldCaptureAudioRef = useRef(true);
  const isMicMutedRef = useRef(false);

  const gridReady = Boolean(gradingGrid);
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
    transcript.some((entry) => entry.role === "student") &&
    Boolean(gradingGrid);
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
      gradingGrid.length > 0 ||
      parseError.length > 0 ||
      transcript.length > 0 ||
      evaluation !== null ||
      recordedAudioUrl !== null ||
      hasEndedDiscussion);
  const timerDanger = remainingSeconds <= 60;
  const scoreState = parseScore(evaluation?.score);
  const sessionDurationSeconds = settings.defaultTimerSeconds;
  const canSwitchModes = !isDiscussing && !isPaused;

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
        return "Monologue";
      case "paused":
        return "En pause";
      default:
        return "Inactif";
    }
  }, [sessionPhase]);

  async function transcribeAudioChunks(audioChunks: Blob[]) {
    if (audioChunks.length === 0) {
      return "";
    }

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

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = (await response.json()) as { text?: string };
    return result.text?.trim() ?? "";
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  async function finalizeStudentTurn() {
    if (isFinalizingTurnRef.current) {
      return;
    }

    const audioChunks = [...currentTurnChunksRef.current];
    if (audioChunks.length === 0) {
      isSpeechActiveRef.current = false;
      setShowStudentDraftIndicator(false);
      return;
    }

    isFinalizingTurnRef.current = true;
    currentTurnChunksRef.current = [];
    isSpeechActiveRef.current = false;
    setShowStudentDraftIndicator(false);

    try {
      const text = await transcribeAudioChunks(audioChunks);
      if (!text) {
        return;
      }

      setTranscript((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "student",
          text,
          timestamp: createTimestamp(),
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur de transcription : ${message}`),
      ]);
    } finally {
      isFinalizingTurnRef.current = false;
    }
  }

  function handleParse() {
    const nextGrid = extractGradingGridOnly(rawInput);
    setGradingGrid(nextGrid);
    setEvaluation(null);
    setLastEvaluatedFeedbackDetailLevel(null);
    setHasEndedDiscussion(false);
    setCompletionToast(null);

    if (!nextGrid) {
      setParseError(
        "Impossible d'identifier une grille de correction exploitable dans ce texte.",
      );
      setStatus("Mode sans PS prêt");
      return;
    }

    setParseError("");
    setStatus("Grille prête pour monologue");
  }

  function resetRecordingState() {
    currentTurnChunksRef.current = [];
    isSpeechActiveRef.current = false;
    isFinalizingTurnRef.current = false;
    shouldCaptureAudioRef.current = true;
    clearSilenceTimer();
    setShowStudentDraftIndicator(false);
    setMicLevel(0);
    setMicPeak(0);

    if (recordedAudioUrlRef.current) {
      URL.revokeObjectURL(recordedAudioUrlRef.current);
      recordedAudioUrlRef.current = null;
    }

    setRecordedAudioUrl(null);
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
      shouldCaptureAudioRef.current = false;

      if (completionToastTimerRef.current) {
        window.clearTimeout(completionToastTimerRef.current);
        completionToastTimerRef.current = null;
      }

      setCompletionToast(null);
      setEvaluationWarning(null);
      clearSilenceTimer();
      await micRef.current?.stop();
    } catch {
      //
    } finally {
      micRef.current = null;
      clearSilenceTimer();
      currentTurnChunksRef.current = [];
      isSpeechActiveRef.current = false;
      isFinalizingTurnRef.current = false;
      shouldCaptureAudioRef.current = true;
      autoEvaluateHandledRef.current = false;
      autoExportedEvaluationRef.current = null;
      setTranscript([]);
      setEvaluation(null);
      setLastEvaluatedFeedbackDetailLevel(null);
      setHasEndedDiscussion(false);
      setIsConnecting(false);
      setIsDiscussing(false);
      setIsPaused(false);
      setSessionPhase("idle");
      setStatus(gradingGrid ? "Grille prête pour monologue" : "Mode sans PS prêt");
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
  }

  async function handleClearText() {
    await resetSessionState();
    setRawInput("");
    setGradingGrid("");
    setParseError("");
    setStatus("Mode sans PS prêt");
  }

  async function startSession() {
    try {
      setIsConnecting(true);
      setEvaluation(null);
      setHasEndedDiscussion(false);
      setCompletionToast(null);
      setStatus("Préparation du monologue");
      setRemainingSeconds(sessionDurationSeconds);
      setTranscript([
        createTranscriptEntry(
          "system",
          "Monologue démarré. Présentez votre raisonnement et votre conduite à tenir.",
        ),
      ]);
      setIsPaused(false);
      setIsMicMuted(false);
      isMicMutedRef.current = false;
      resetRecordingState();

      const stream = await requestMicrophoneStream();
      const microphone = await startMicrophoneStream(
        async (chunk) => {
          if (
            !shouldCaptureAudioRef.current ||
            isPaused ||
            isMicMutedRef.current ||
            !isSpeechActiveRef.current
          ) {
            return;
          }

          currentTurnChunksRef.current.push(chunk);
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

          if (isSpeaking) {
            clearSilenceTimer();
            isSpeechActiveRef.current = true;
            setShowStudentDraftIndicator(true);
            setSessionPhase("student-speaking");
            setStatus("Monologue en cours");
            return;
          }

          if (
            isSpeechActiveRef.current &&
            !silenceTimerRef.current &&
            !isPaused &&
            shouldCaptureAudioRef.current
          ) {
            silenceTimerRef.current = window.setTimeout(() => {
              silenceTimerRef.current = null;
              void finalizeStudentTurn();
            }, 1200);
          }
        },
        stream,
      );

      micRef.current = microphone;
      setIsDiscussing(true);
      setSessionPhase("student-speaking");
      setStatus("Monologue en cours");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setStatus(`Impossible de démarrer : ${message}`);
      setSessionPhase("idle");
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur : ${message}`),
      ]);
    } finally {
      setIsConnecting(false);
    }
  }

  async function togglePauseSession() {
    if (!isDiscussing && !isPaused) {
      return;
    }

    if (!isPaused) {
      shouldCaptureAudioRef.current = false;
      setIsDiscussing(false);
      setIsPaused(true);
      setSessionPhase("paused");
      setStatus("Monologue en pause");
      clearSilenceTimer();
      await finalizeStudentTurn();
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", "Monologue mis en pause."),
      ]);
      return;
    }

    shouldCaptureAudioRef.current = true;
    setIsDiscussing(true);
    setIsPaused(false);
    setSessionPhase("student-speaking");
    setStatus("Monologue repris");
    setTranscript((current) => [
      ...current,
      createTranscriptEntry("system", "Monologue repris."),
    ]);
  }

  async function stopSession() {
    setStatus("Finalisation du monologue");
    let finished = false;
    let elapsedSummary = "";

    try {
      elapsedSummary = formatElapsedDiscussion(
        sessionDurationSeconds - remainingSeconds,
      );
      shouldCaptureAudioRef.current = false;
      clearSilenceTimer();
      await finalizeStudentTurn();

      const recordedBlob = await micRef.current?.stop();
      if (recordedBlob) {
        const nextUrl = URL.createObjectURL(recordedBlob);
        recordedAudioUrlRef.current = nextUrl;
        setRecordedAudioUrl(nextUrl);
      }

      finished = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur : ${message}`),
      ]);
    } finally {
      micRef.current = null;
      clearSilenceTimer();
      currentTurnChunksRef.current = [];
      isSpeechActiveRef.current = false;
      isFinalizingTurnRef.current = false;
      setShowStudentDraftIndicator(false);
      setIsDiscussing(false);
      setIsPaused(false);
      setHasEndedDiscussion(true);
      setSessionPhase("idle");
      setStatus("Monologue terminé. Transcription prête pour évaluation.");
      setMicLevel(0);
      setMicPeak(0);

      if (finished) {
        setCompletionToast({
          title: "Monologue terminé",
          body: `Vous avez fini en ${elapsedSummary}.`,
        });
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
        body: "Evaluation is unavailable for discussions shorter than 2 minutes. Please continue the monologue and try again.",
      });
      return;
    }

    if (discussionDurationSeconds < 180) {
      setEvaluationWarning({
        mode: "confirm",
        title: "Short monologue",
        body: "This monologue is shorter than 3 minutes, so the evaluation may be unreliable. Do you want to continue?",
      });
      return;
    }

    void evaluateDiscussion();
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

  function exportPdf() {
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (!popup) {
      return;
    }

    popup.document.open();
    popup.document.write(buildPdfDocument(rawInput, transcript, evaluation));
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
    return () => {
      shouldCaptureAudioRef.current = false;
      clearSilenceTimer();
      void micRef.current?.stop();
      if (recordedAudioUrlRef.current) {
        URL.revokeObjectURL(recordedAudioUrlRef.current);
      }
      if (completionToastTimerRef.current) {
        window.clearTimeout(completionToastTimerRef.current);
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
              <p className={`text-xs ${mutedText}`}>Mode sans PS</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
              onClick={() => onDarkModeChange(!darkMode)}
              className={`rounded-xl border p-2.5 transition-all duration-200 ${
                darkMode
                  ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
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
                  ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              aria-label="Open settings"
            >
              <SettingsIcon className={`h-5 w-5 ${darkMode ? "text-slate-200" : "text-slate-600"}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
          <div className="space-y-6">
            <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <FileTextIcon className="h-5 w-5 text-primary-500" />
                  Configuration de station
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleClearText()}
                    disabled={!canClearText}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
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
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary-500/20 transition-colors hover:bg-primary-700"
                  >
                    Analyser
                  </button>
                </div>
              </div>

              <textarea
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                placeholder="Collez ici la station sans PS et sa grille de correction..."
                className={`h-64 w-full resize-none rounded-xl border p-4 text-sm leading-relaxed transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 ${inputBg}`}
              />

              {parseError ? (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
                  {parseError}
                </div>
              ) : (
                <p className={`mt-3 text-xs ${mutedText}`}>
                  Aucun patient n&apos;est simulé. Seule la grille sert à l&apos;évaluation finale.
                </p>
              )}
            </div>

            <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <ActivityIcon className="h-5 w-5 text-primary-500" />
                Consigne
              </h2>
              <div className={`rounded-xl border ${subCardBg} p-4`}>
                <p className="text-sm font-medium">
                  Présentez votre raisonnement à voix haute comme devant un examinateur.
                </p>
                <p className={`mt-2 text-sm leading-relaxed ${mutedText}`}>
                  Le mode sans PS écoute uniquement l&apos;étudiant, segmente la parole sur les silences, transcrit le monologue au fil de la station, puis compare le texte final à la grille.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
              <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
                <div className="flex items-center gap-4">
                  <div className={`h-3 w-3 rounded-full ${statusColor} ${sessionPhase !== "idle" ? "animate-pulse" : ""}`} />
                  <div>
                    <h2 className="text-lg font-semibold">Session Monologue</h2>
                    <p className={`text-sm ${mutedText}`}>{status}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${subtleBg}`}>
                    {statusLabel}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={startSession}
                    disabled={!canStart}
                    className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                      canStart
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700"
                        : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700"
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
                        ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600"
                        : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700"
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
                        ? "bg-slate-800 text-white shadow-lg shadow-slate-500/20 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
                        : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700"
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
                        ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20 hover:bg-primary-700"
                        : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700"
                    }`}
                  >
                    <CheckIcon className="h-4 w-4" />
                    Évaluer
                  </button>

                  <button
                    onClick={() => void handleResetSession()}
                    disabled={!canResetSession}
                    className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 ${
                      canResetSession
                        ? darkMode
                          ? "border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700"
                    }`}
                  >
                    <ResetIcon className="h-4 w-4" />
                    Reset
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
              <div className="space-y-6">
                <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
                  <div className="mb-4 flex items-center gap-2">
                    <ClockIcon className={`h-4 w-4 ${mutedText}`} />
                    <span className={`text-sm font-medium ${mutedText}`}>Temps restant</span>
                  </div>

                  <div className={`text-center text-5xl font-bold tracking-tight tabular-nums ${timerDanger ? "animate-pulse text-rose-500" : ""}`}>
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

                <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
                  <div className="mb-5">
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

                    <button
                      type="button"
                      onClick={toggleMicMute}
                      className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                        isMicMuted
                          ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                          : "border-slate-200 bg-slate-900 text-white hover:bg-slate-800 dark:border-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                      }`}
                    >
                      {isMicMuted ? (
                        <MicOffIcon className="h-4 w-4" />
                      ) : (
                        <MicIcon className="h-4 w-4" />
                      )}
                      {isMicMuted ? "Réactiver le microphone" : "Couper le microphone"}
                    </button>
                  </div>

                  <div className="relative mx-auto h-40 w-40">
                    <div className={`absolute inset-0 rounded-full ${darkMode ? "bg-slate-800/30" : "bg-primary-100/50"}`} />
                    {Array.from({ length: 36 }, (_, i) => {
                      const angle = (360 / 36) * i;
                      const displayPeak = isMicMuted ? 0 : micPeak;
                      const active =
                        !isMicMuted && i < Math.max(3, Math.round(displayPeak * 36));
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
                    <div className={`absolute inset-0 m-auto flex h-20 w-20 items-center justify-center rounded-full ${
                      darkMode ? "border border-slate-700 bg-slate-800" : "border border-slate-200 bg-white"
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

              <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
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
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      canCopyTranscript
                        ? darkMode
                          ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700"
                    }`}
                  >
                    <CopyIcon className="h-4 w-4" />
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
                    <div className="flex h-full items-center justify-center">
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
                    <div className="space-y-3">
                      {transcriptForDisplay.map((entry) => (
                        <div
                          key={entry.id}
                          className={`animate-fade-in ${
                            entry.role === "student"
                              ? "ml-auto max-w-[85%]"
                              : "mx-auto max-w-full"
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
                            <div className="rounded-2xl bg-primary-600 px-4 py-3 text-white">
                              <div className="mb-1.5 flex items-center justify-between gap-4 text-[10px] uppercase tracking-wider text-primary-100">
                                <span className="font-semibold">étudiant</span>
                                <span>{entry.timestamp}</span>
                              </div>
                              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                {entry.text}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {showDraftIndicatorForDisplay && (
                        <div className="ml-auto max-w-[85%] animate-fade-in">
                          <div className="rounded-2xl bg-primary-500/90 px-4 py-3 text-white shadow-sm">
                            <div className="mb-1.5 flex items-center justify-between gap-4 text-[10px] uppercase tracking-wider text-primary-100">
                              <span className="font-semibold">étudiant</span>
                              <span>{createTimestamp()}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span>En train de parler</span>
                              <span className="flex gap-1">
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-delay:150ms]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-delay:300ms]" />
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

          {recordedAudioUrl && (
            <div className={`xl:col-span-2 rounded-2xl border ${cardBg} p-6 shadow-soft`}>
              <h3 className="mb-4 text-lg font-semibold">Enregistrement audio</h3>
              <div className={`rounded-xl border p-4 ${subCardBg}`}>
                <audio ref={audioRef} controls className="w-full" src={recordedAudioUrl}>
                  Votre navigateur ne supporte pas la lecture audio.
                </audio>
              </div>
            </div>
          )}

          <div ref={resultsRef} className={`xl:col-span-2 rounded-2xl border ${cardBg} p-6 shadow-soft`}>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold">Résultats d'évaluation</h2>
              <div className="flex items-center gap-2">
                {canRerunEvaluation && (
                  <button
                    onClick={handleRerunEvaluation}
                    className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-primary-700"
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
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                      evaluation
                        ? darkMode
                          ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700"
                  }`}
                >
                  <CopyIcon className="h-4 w-4" />
                  Copy evaluation
                </button>
                <button
                  onClick={exportPdf}
                  disabled={!evaluation}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                    evaluation
                      ? "bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
                      : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700"
                  }`}
                >
                  <FileTextIcon className="h-4 w-4" />
                  Export PDF
                </button>
              </div>
            </div>

            {!evaluation ? (
              <div className={`rounded-xl p-12 text-center ${subtleBg}`}>
                <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${subtleBg}`}>
                  <CheckIcon className={`h-8 w-8 ${mutedText}`} />
                </div>
                <p className={`text-sm ${mutedText}`}>
                  Les résultats d'évaluation apparaîtront ici après la correction.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[320px_1fr]">
                <div className={`rounded-xl border p-6 ${subCardBg}`}>
                  <div className={`mb-4 text-sm font-medium uppercase tracking-wider ${mutedText}`}>
                    Note finale
                  </div>
                  <div className="text-center">
                    <div className="mb-2 text-6xl font-bold">{evaluation.score}</div>
                    <div className={`mb-4 text-sm ${mutedText}`}>Évaluation complète</div>
                  </div>
                  <div className={`h-3 overflow-hidden rounded-full ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${scoreState.ratio * 100}%`,
                        background: scoreGradient(scoreState.ratio),
                      }}
                    />
                  </div>
                  <div
                    className="mt-3 text-center text-sm font-semibold"
                    style={{ color: scoreColor(scoreState.ratio) }}
                  >
                    {scoreState.value} / {scoreState.max} points
                  </div>
                </div>

                <div className={`overflow-hidden rounded-xl border ${subCardBg}`}>
                  <table className="w-full text-sm">
                    <thead className={darkMode ? "bg-slate-800" : "bg-slate-100"}>
                      <tr>
                        <th className="px-6 py-4 text-left font-semibold">Critère</th>
                        <th className="w-44 px-6 py-4 text-left font-semibold">Résultat</th>
                        <th className="px-6 py-4 text-left font-semibold">
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
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
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

      {isEvaluating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border ${cardBg} p-8 shadow-2xl`}>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100 dark:bg-primary-900/30">
                <ActivityIcon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="mb-2 text-xl font-bold">Évaluation en cours</h3>
              <p className={`mb-6 text-sm ${mutedText}`}>
                Analyse du monologue face à la grille de correction...
              </p>
            </div>

            <div className={`h-3 overflow-hidden rounded-full ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border ${cardBg} p-8 shadow-2xl`}>
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

      {completionToast && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-slate-950/10 backdrop-blur-[1px]">
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
