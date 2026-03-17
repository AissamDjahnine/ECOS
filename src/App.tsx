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
    "’",
  ]);

  if (noLeadingSpaceBefore.has(chunk)) {
    return `${current}${chunk}`;
  }

  if (current.endsWith("'") || current.endsWith("’")) {
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

    setTranscript((current) => [
      ...current,
      {
        id: entryId,
        role: "student",
        text: fallbackText || "…",
        timestamp: createTimestamp(),
      },
    ]);

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
              upsertTranscriptEntryById(
                current,
                entryId,
                "student",
                improvedText,
              ),
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
          if (!shouldSendAudioRef.current || isPaused) {
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

  const shellClass = darkMode
    ? "min-h-screen bg-slate-950 text-slate-100"
    : "min-h-screen bg-slate-100 text-slate-900";

  const cardClass = darkMode
    ? "rounded-[32px] border border-slate-800 bg-slate-900/90 shadow-xl"
    : "rounded-[32px] border border-slate-200 bg-white/90 shadow-lg";

  const subCardClass = darkMode
    ? "rounded-[28px] border border-slate-800 bg-slate-950/60"
    : "rounded-[28px] border border-slate-200 bg-slate-50";

  const actionButtonBase =
    "inline-flex h-[60px] w-[170px] shrink-0 items-center justify-center rounded-full px-5 text-center text-sm font-semibold shadow-md transition-all duration-200 disabled:cursor-not-allowed";

  const startButtonClass = canStart
    ? "bg-emerald-600 text-white hover:bg-emerald-700"
    : "bg-slate-300 text-slate-500";

  const pauseButtonClass = canPause || isPaused
    ? "bg-amber-500 text-white hover:bg-amber-600"
    : "bg-slate-300 text-slate-500";

  const endButtonClass = canEnd
    ? "bg-slate-800 text-white hover:bg-slate-900"
    : "bg-slate-300 text-slate-500";

  const judgeButtonClass = canJudge
    ? "bg-blue-600 text-white hover:bg-blue-700"
    : "bg-slate-200 text-slate-400";

  return (
    <main className={shellClass}>
      <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8">
        <div className="flex flex-col gap-6">
          <header className={`${cardClass} p-6 md:p-8`}>
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="mb-4 text-sm font-bold uppercase tracking-[0.32em] text-blue-700">
                  ECOS-AI
                </div>
                <h1 className="text-3xl font-black leading-tight md:text-6xl">
                  Simulation clinique pilotée par Gemini Live
                </h1>
                <p
                  className={`mt-4 max-w-4xl text-sm md:text-xl ${
                    darkMode ? "text-slate-300" : "text-slate-600"
                  }`}
                >
                  Setup dynamique, discussion vocale patient simulé, transcription
                  temps réel et évaluation structurée.
                </p>
              </div>

              <div className="flex shrink-0 items-start gap-4">
                {patientInfo.length > 0 && (
                  <div
                    className={`min-w-[210px] rounded-[26px] border px-5 py-4 ${
                      darkMode
                        ? "border-slate-700 bg-slate-800"
                        : "border-blue-100 bg-blue-50"
                    }`}
                  >
                    <div className="text-sm font-bold uppercase tracking-[0.24em] text-blue-800">
                      {parsedCase.patientName || "Patient"}
                    </div>
                    <div
                      className={`mt-2 text-sm ${
                        darkMode ? "text-slate-300" : "text-slate-600"
                      }`}
                    >
                      {parsedCase.patientAge || "Âge non détecté"}
                    </div>
                    {patientInfo.find((item) => item.label === "Profession") && (
                      <div
                        className={`mt-2 text-sm ${
                          darkMode ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        {
                          patientInfo.find((item) => item.label === "Profession")
                            ?.value
                        }
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setDarkMode((current) => !current)}
                  className={`inline-flex h-14 w-14 items-center justify-center rounded-full border text-2xl shadow-md ${
                    darkMode
                      ? "border-slate-700 bg-slate-800"
                      : "border-slate-200 bg-white"
                  }`}
                  aria-label="Basculer le mode sombre"
                >
                  {darkMode ? "☀️" : "☾"}
                </button>
              </div>
            </div>
          </header>

          <section className="grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)]">
            <div className="space-y-6">
              <div className={`${cardClass} p-5`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-bold">Setup</h2>
                  <button
                    type="button"
                    onClick={handleParse}
                    className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700"
                  >
                    Analyser & préparer
                  </button>
                </div>

                <textarea
                  value={rawInput}
                  onChange={(event) => setRawInput(event.target.value)}
                  className={`min-h-[300px] w-full resize-none rounded-[28px] border p-4 text-sm outline-none transition ${
                    darkMode
                      ? "border-slate-700 bg-slate-950 text-slate-100"
                      : "border-slate-200 bg-slate-50 text-slate-900"
                  }`}
                  placeholder="Collez ici la trame du patient et la grille de correction"
                />

                <div
                  className={`mt-4 text-sm ${
                    parseError
                      ? "text-rose-500"
                      : darkMode
                        ? "text-slate-400"
                        : "text-slate-500"
                  }`}
                >
                  {parseError ||
                    "Le parser utilise des regex simples et reste tolérant aux séparateurs."}
                </div>
              </div>

              <div className={`${cardClass} p-5`}>
                <h2 className="text-2xl font-bold">Préparation</h2>

                {patientInfo.length === 0 ? (
                  <div
                    className={`mt-4 rounded-[28px] p-5 text-sm ${
                      darkMode
                        ? "bg-slate-950/60 text-slate-400"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    Les informations patient apparaîtront ici après le parsing.
                  </div>
                ) : (
                  <div className={`${subCardClass} mt-4 p-4`}>
                    <div
                      className={`mb-3 text-sm font-semibold uppercase tracking-[0.18em] ${
                        darkMode ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      Informations patient
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {patientInfo.map((item) => (
                        <div
                          key={`${item.label}-${item.value}`}
                          className={`rounded-2xl border px-4 py-3 ${
                            darkMode
                              ? "border-slate-800 bg-slate-900"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {item.label}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap text-sm">
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className={`${cardClass} p-5`}>
                <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Discussion</h2>
                    <p
                      className={`mt-2 text-sm ${
                        darkMode ? "text-slate-400" : "text-slate-600"
                      }`}
                    >
                      {status}
                    </p>
                    <p className="mt-1 text-sm font-bold uppercase tracking-[0.24em] text-blue-700">
                      {conversationPhase === "idle"
                        ? "Inactif"
                        : conversationPhase === "listening"
                          ? "Écoute"
                          : conversationPhase === "student-speaking"
                            ? "Étudiant"
                            : conversationPhase === "patient-speaking"
                              ? "Patient"
                              : conversationPhase === "paused"
                                ? "Pause"
                                : "Traitement"}
                    </p>
                  </div>

                  <div className="w-full overflow-x-auto xl:w-auto">
                    <div className="flex min-w-max flex-nowrap items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={startDiscussion}
                        disabled={!canStart}
                        className={`${actionButtonBase} ${startButtonClass}`}
                      >
                        {isConnecting ? "Connexion..." : "Démarrer la discussion"}
                      </button>

                      <button
                        type="button"
                        onClick={togglePauseDiscussion}
                        disabled={!canPause && !isPaused}
                        className={`${actionButtonBase} ${pauseButtonClass}`}
                      >
                        {isPaused ? "Reprendre" : "Mettre en pause"}
                      </button>

                      <button
                        type="button"
                        onClick={stopDiscussion}
                        disabled={!canEnd}
                        className={`${actionButtonBase} ${endButtonClass}`}
                      >
                        Terminer
                      </button>

                      <button
                        type="button"
                        onClick={evaluateDiscussion}
                        disabled={!canJudge}
                        className={`${actionButtonBase} ${judgeButtonClass}`}
                      >
                        Corriger la transcription
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className={`${subCardClass} p-5`}>
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        Timer
                      </div>
                      <div
                        className={`mt-5 text-center text-6xl font-black ${
                          timerDanger ? "animate-pulse text-rose-600" : "text-inherit"
                        }`}
                      >
                        {formatCountdown(remainingSeconds)}
                      </div>
                      <div
                        className={`mt-4 rounded-full px-4 py-2 text-center text-sm font-semibold ${
                          darkMode
                            ? "bg-slate-800 text-slate-300"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        Temps restant
                      </div>
                      <div
                        className={`mt-5 h-2 overflow-hidden rounded-full ${
                          darkMode ? "bg-slate-800" : "bg-slate-200"
                        }`}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 ${
                            timerDanger ? "bg-rose-500" : "bg-blue-600"
                          }`}
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, (remainingSeconds / (8 * 60)) * 100),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className={`${subCardClass} p-5`}>
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                          Mic
                        </div>
                        <div className="text-sm font-semibold text-slate-500">
                          {formatPercent(micPeak)}
                        </div>
                      </div>

                      <div className="relative mx-auto mt-4 flex h-40 w-40 items-center justify-center">
                        <div
                          className={`absolute inset-0 rounded-full ${
                            darkMode
                              ? "bg-[radial-gradient(circle,_rgba(30,41,59,0.2),_rgba(15,23,42,0.05))]"
                              : "bg-[radial-gradient(circle,_rgba(37,99,235,0.08),_rgba(37,99,235,0.02))]"
                          }`}
                        />
                        {Array.from({ length: 48 }, (_, index) => {
                          const angle = (360 / 48) * index;
                          const active =
                            index < Math.max(4, Math.round(micPeak * 48));
                          const barHeight = active
                            ? 18 + micPeak * 28 + (index % 4) * 2
                            : 10;

                          return (
                            <div
                              key={index}
                              className="absolute left-1/2 top-1/2 origin-bottom rounded-full"
                              style={{
                                width: 5,
                                height: barHeight,
                                transform: `translate(-50%, -100%) rotate(${angle}deg) translateY(-56px)`,
                                background: active
                                  ? "linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)"
                                  : darkMode
                                    ? "rgba(148,163,184,0.28)"
                                    : "rgba(148,163,184,0.38)",
                                boxShadow: active
                                  ? "0 0 12px rgba(37,99,235,0.35)"
                                  : "none",
                              }}
                            />
                          );
                        })}

                        <div
                          className={`relative z-10 flex h-24 w-24 flex-col items-center justify-center rounded-full border ${
                            darkMode
                              ? "border-slate-700 bg-slate-900"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="text-3xl font-black">
                            {Math.round(micPeak * 100)}
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                            Mic
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 text-center text-sm text-slate-500">
                        rms {formatPercent(micLevel)} | peak {formatPercent(micPeak)}
                      </div>
                    </div>
                  </div>

                  <div
                    ref={transcriptRef}
                    className={`min-h-[470px] max-h-[470px] overflow-y-auto rounded-[32px] border p-5 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950"
                        : "border-slate-800 bg-white"
                    }`}
                  >
                    {transcript.length === 0 && !showStudentDraftIndicator ? (
                      <div className="m-auto flex min-h-[420px] items-center justify-center text-center text-sm text-slate-400">
                        Le transcript live s'affichera ici pendant l'entretien.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {transcript.map((entry) => (
                          <article
                            key={entry.id}
                            className={`max-w-[80%] rounded-[22px] px-4 py-3 shadow-md ${
                              entry.role === "student"
                                ? "self-end bg-blue-600 text-white"
                                : entry.role === "patient"
                                  ? "self-start bg-emerald-50 text-slate-900"
                                  : darkMode
                                    ? "self-center bg-slate-800 text-slate-100"
                                    : "self-center bg-slate-100 text-slate-900"
                            }`}
                          >
                            <div className="mb-1 flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.18em] opacity-80">
                              <span>{entry.role}</span>
                              <span>{entry.timestamp}</span>
                            </div>
                            <div className="whitespace-pre-wrap break-words">
                              {entry.text}
                            </div>
                          </article>
                        ))}

                        {showStudentDraftIndicator && (
                          <article className="self-end max-w-[80%] rounded-[22px] bg-blue-600 px-4 py-3 text-white opacity-90 shadow-md">
                            <div className="mb-1 flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.18em] opacity-80">
                              <span>étudiant</span>
                              <span>{createTimestamp()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>Étudiant en train de parler</span>
                              <span className="inline-flex gap-1">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/90" />
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/90 [animation-delay:150ms]" />
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/90 [animation-delay:300ms]" />
                              </span>
                            </div>
                          </article>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {recordedAudioUrl && (
                <div className={`${cardClass} p-5`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em]">
                      Replay audio complet
                    </h3>
                    <div className="text-xs text-slate-500">
                      Étudiant + patient
                    </div>
                  </div>

                  <div className={`${subCardClass} p-4`}>
                    <audio controls className="w-full" src={recordedAudioUrl}>
                      Votre navigateur ne supporte pas la lecture audio.
                    </audio>
                  </div>
                </div>
              )}

              {transcript.length > 0 && (
                <div className={`${cardClass} p-5`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em]">
                      Revue de transcription
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowTranscriptReview((current) => !current)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        darkMode ? "bg-slate-800" : "bg-slate-100"
                      }`}
                    >
                      {showTranscriptReview ? "Masquer" : "Afficher"}
                    </button>
                  </div>

                  {showTranscriptReview && (
                    <>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {(["full", "patient", "student", "system"] as const).map(
                          (filter) => (
                            <button
                              key={filter}
                              type="button"
                              onClick={() => setTranscriptFilter(filter)}
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                transcriptFilter === filter
                                  ? "bg-blue-600 text-white"
                                  : darkMode
                                    ? "bg-slate-800 text-slate-300"
                                    : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {filter === "full"
                                ? "complet"
                                : filter === "patient"
                                  ? "patient"
                                  : filter === "student"
                                    ? "étudiant"
                                    : "système"}
                            </button>
                          ),
                        )}
                      </div>

                      <div
                        className={`${subCardClass} max-h-[260px] overflow-y-auto p-4 text-sm`}
                      >
                        <pre className="m-0 whitespace-pre-wrap font-sans">
                          {filteredTranscriptText ||
                            "Aucune transcription pour ce filtre."}
                        </pre>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div ref={resultsRef} className={`${cardClass} p-5`}>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold">Résultats</h2>
                  <button
                    type="button"
                    onClick={exportPdf}
                    disabled={!evaluation}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      evaluation
                        ? "bg-slate-800 text-white hover:bg-slate-900"
                        : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    Export PDF
                  </button>
                </div>

                {!evaluation ? (
                  <div
                    className={`${subCardClass} px-5 py-10 text-center text-sm text-slate-500`}
                  >
                    La grille d’évaluation reste masquée jusqu’au jugement final.
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                    <div className={`${subCardClass} p-4`}>
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        Note finale
                      </div>
                      <div className="mt-4 text-center text-6xl font-black">
                        {evaluation.score}
                      </div>
                      <div
                        className={`mt-4 rounded-full px-4 py-2 text-center text-sm font-semibold ${
                          darkMode
                            ? "bg-slate-800 text-slate-300"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        Évaluation complète
                      </div>
                      <div
                        className={`mt-5 h-3 overflow-hidden rounded-full ${
                          darkMode ? "bg-slate-800" : "bg-slate-200"
                        }`}
                      >
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
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
                        {scoreState.value} point(s) sur {scoreState.max}
                      </div>
                    </div>

                    <div className={`${subCardClass} overflow-hidden`}>
                      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                        <thead
                          className={`${
                            darkMode ? "bg-slate-900" : "bg-slate-100"
                          } text-slate-600`}
                        >
                          <tr>
                            <th className="px-4 py-3 font-semibold">Critère</th>
                            <th className="px-4 py-3 font-semibold">Résultat</th>
                            <th className="px-4 py-3 font-semibold">Feedback</th>
                          </tr>
                        </thead>
                        <tbody
                          className={`divide-y ${
                            darkMode
                              ? "divide-slate-800 bg-slate-950"
                              : "divide-slate-200 bg-white"
                          }`}
                        >
                          {evaluation.details.map((detail, index) => (
                            <tr key={`${detail.criterion}-${index}`}>
                              <td className="px-4 py-3 align-top">
                                {detail.criterion}
                              </td>
                              <td className="px-4 py-3 align-top">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                    detail.observed
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-rose-100 text-rose-700"
                                  }`}
                                >
                                  {detail.observed ? "✓ Observé" : "✕ Non observé"}
                                </span>
                              </td>
                              <td className="px-4 py-3 align-top text-slate-600">
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
          </section>
        </div>
      </div>

      {isEvaluating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-white/60 bg-white p-6 shadow-2xl">
            <div className="text-center">
              <div className="text-lg font-semibold text-slate-950">
                Évaluation en cours
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Analyse du transcript face à la grille de correction…
              </div>
            </div>

            <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
                style={{ width: `${evaluationProgress}%` }}
              />
            </div>

            <div className="mt-3 text-center text-sm font-medium text-slate-600">
              {evaluationProgress}%
            </div>
          </div>
        </div>
      )}
    </main>
  );
}