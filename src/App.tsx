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
  | "processing";

type TranscriptFilter = "full" | "patient" | "student" | "system";

type LiveDebugEvent = {
  id: string;
  timestamp: string;
  label: string;
  details: string;
};

type PatientInfoItem = {
  label: string;
  value: string;
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

  for (let i = 0; i < uint8.length; i += chunkSize) {
    const sub = uint8.subarray(i, i + chunkSize);
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
  const age =
    parsedCase.patientAge || findField(script, ["âge", "age"]);
  const sex = findField(script, ["sexe", "genre"]);
  const weight = findField(script, ["poids"]);
  const height = findField(script, ["taille"]);
  const maritalStatus = findField(script, ["statut marital", "situation familiale"]);
  const children = findField(script, ["enfants"]);
  const job = findField(script, ["contexte sociopessionnel", "contexte socioprofessionnel", "profession", "métier"]);

  if (patientName) items.push({ label: "Nom", value: patientName });
  if (age) items.push({ label: "Âge", value: age });
  if (sex) items.push({ label: "Sexe", value: sex });
  if (weight) items.push({ label: "Poids", value: weight });
  if (height) items.push({ label: "Taille", value: height });
  if (maritalStatus) items.push({ label: "Statut marital", value: maritalStatus });
  if (children) items.push({ label: "Enfants", value: children });
  if (job) items.push({ label: "Profession", value: job });

  return items;
}

export default function App() {
  const [rawInput, setRawInput] = useState("");
  const [parsedCase, setParsedCase] = useState<ParsedCase>(() =>
    parseCaseInput(""),
  );
  const [parseError, setParseError] = useState<string>("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [status, setStatus] = useState("Ready");
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
  const [debugEvents, setDebugEvents] = useState<LiveDebugEvent[]>([]);
  const [audioChunkCount, setAudioChunkCount] = useState(0);
  const [audioBytesSent, setAudioBytesSent] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [micPeak, setMicPeak] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(() =>
    Array.from({ length: 32 }, () => 0),
  );
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(8 * 60);

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const micRef = useRef<AudioStreamer | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);

  const inputTranscriptRef = useRef("");
  const outputTranscriptRef = useRef("");
  const currentPatientEntryIdRef = useRef<string | null>(null);
  const studentTurnAudioChunksRef = useRef<Blob[]>([]);
  const isFinalizingStudentRef = useRef(false);

  const audioChunkCountRef = useRef(0);
  const audioBytesSentRef = useRef(0);
  const lastWaveUpdateRef = useRef(0);
  const recordedAudioUrlRef = useRef<string | null>(null);
  const shouldSendAudioRef = useRef(true);

  const patientInfo = useMemo(() => extractPatientInfo(parsedCase), [parsedCase]);

  function pushDebugEvent(label: string, details: string) {
    setDebugEvents((current) => [
      ...current.slice(-79),
      {
        id: crypto.randomUUID(),
        timestamp: createTimestamp(),
        label,
        details,
      },
    ]);
  }

  function handleParse() {
    const parsed = parseCaseInput(rawInput);
    setParsedCase(parsed);
    setEvaluation(null);

    if (!parsed.patientScript || !parsed.gradingGrid) {
      setParseError(
        "Le parser n'a pas trouvé les deux sections clairement. Vérifie les intitulés ou les séparateurs.",
      );
    } else {
      setParseError("");
    }

    setStatus("Case prepared");
    pushDebugEvent(
      "parse",
      `patient=${parsed.patientName || "n/a"} age=${parsed.patientAge || "n/a"}`,
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
          }
        }
      }
    } catch (error) {
      pushDebugEvent(
        "transcribe-error",
        error instanceof Error ? error.message : "transcription failed",
      );
    } finally {
      isFinalizingStudentRef.current = false;
    }
  }

  const fullTranscript = useMemo(
    () =>
      transcriptToPlainText(
        transcript
          .filter((entry) => entry.text.trim().length > 0)
          .map((entry) => ({
            role: entry.role,
            text: entry.text.trim(),
          })),
      ),
    [transcript],
  );

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

  async function startDiscussion() {
    try {
      setIsConnecting(true);
      setStatus("Requesting ephemeral token");
      setEvaluation(null);
      setAudioBytesSent(0);
      setAudioChunkCount(0);
      setRemainingSeconds(8 * 60);

      audioChunkCountRef.current = 0;
      audioBytesSentRef.current = 0;
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
      setMicLevel(0);
      setMicPeak(0);
      setWaveform(Array.from({ length: 32 }, () => 0));
      setDebugEvents([]);
      setTranscript([
        createTranscriptEntry("system", "Initialisation de la session Live Gemini..."),
      ]);
      pushDebugEvent("session", "requesting live token");
      pushDebugEvent("mic", "requesting microphone access");

      const mediaStream = await requestMicrophoneStream();
      pushDebugEvent("mic", "microphone access granted");

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

      pushDebugEvent(
        "session",
        `token received; model=${tokenPayload.model || liveModel}`,
      );

      setStatus("Opening Live session");

      const ai = new GoogleGenAI({
        apiKey: tokenPayload.token,
        httpOptions: {
          apiVersion: "v1alpha",
        },
      });

      const player = new PcmPlayer();
      playerRef.current = player;
      await player.resume();

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
            setStatus("Live session open, waiting for student");
            setConversationPhase("listening");
            pushDebugEvent("live", "socket open");
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

            pushDebugEvent(
              "message",
              JSON.stringify({
                hasInputTranscription: Boolean(
                  liveMessage.inputTranscription ??
                    liveMessage.serverContent?.inputTranscription,
                ),
                hasOutputTranscription: Boolean(
                  liveMessage.outputTranscription ??
                    liveMessage.serverContent?.outputTranscription,
                ),
                interrupted: Boolean(liveMessage.serverContent?.interrupted),
                generationComplete: Boolean(
                  liveMessage.serverContent?.generationComplete,
                ),
                turnComplete: Boolean(liveMessage.serverContent?.turnComplete),
                waitingForInput: Boolean(
                  liveMessage.serverContent?.waitingForInput,
                ),
                hasModelTurn: Boolean(
                  liveMessage.serverContent?.modelTurn?.parts?.length,
                ),
              }),
            );

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
              setStatus("Student speaking...");
              setShowStudentDraftIndicator(true);
              pushDebugEvent("student-transcript", inputTranscriptRef.current);
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
              setStatus("Patient speaking...");
              setTranscript((current) =>
                upsertTranscriptEntryById(
                  current,
                  currentPatientEntryIdRef.current!,
                  "patient",
                  outputTranscriptRef.current,
                ),
              );
              pushDebugEvent("patient-transcript", outputTranscriptRef.current);
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
              setStatus("Patient speaking...");
            }

            if (serverContent?.interrupted) {
              shouldSendAudioRef.current = true;
              currentPatientEntryIdRef.current = null;
              player.interrupt();
              outputTranscriptRef.current = "";
              setConversationPhase("student-speaking");
              setStatus("Student interrupted the patient");
              pushDebugEvent("turn", "model interrupted by student activity");
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
              pushDebugEvent("audio-out", `${binary.byteLength} bytes`);
            }

            if (serverContent?.generationComplete) {
              setConversationPhase("processing");
              setStatus("Patient response generated");
              pushDebugEvent("turn", "generation complete");
            }

            if (serverContent?.waitingForInput) {
              shouldSendAudioRef.current = true;
              await finalizeStudentDraft();
              outputTranscriptRef.current = "";
              currentPatientEntryIdRef.current = null;
              setShowStudentDraftIndicator(false);
              setConversationPhase("listening");
              setStatus("Waiting for student...");
              pushDebugEvent("turn", "waiting for input");
            }

            if (serverContent?.turnComplete) {
              shouldSendAudioRef.current = true;
              await finalizeStudentDraft();
              outputTranscriptRef.current = "";
              currentPatientEntryIdRef.current = null;
              setShowStudentDraftIndicator(false);
              setConversationPhase("listening");
              setStatus("Waiting for student...");
              pushDebugEvent("turn", "turn complete");
            }
          },

          onerror: (error) => {
            shouldSendAudioRef.current = true;
            setStatus(`Live error: ${error.message}`);
            setConversationPhase("idle");
            setShowStudentDraftIndicator(false);
            pushDebugEvent("error", error.message);
          },

          onclose: () => {
            shouldSendAudioRef.current = true;
            setStatus("Live session closed");
            setConversationPhase("idle");
            setShowStudentDraftIndicator(false);
            pushDebugEvent("live", "socket closed");
          },
        },
      })) as LiveSession;

      sessionRef.current = session;

      const microphone = await startMicrophoneStream(
        async (chunk) => {
          if (!shouldSendAudioRef.current) {
            return;
          }

          studentTurnAudioChunksRef.current.push(chunk);

          const arrayBuffer = await chunk.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          const base64Audio = uint8ToBase64(uint8);

          audioChunkCountRef.current += 1;
          audioBytesSentRef.current += chunk.size;
          setAudioChunkCount(audioChunkCountRef.current);
          setAudioBytesSent(audioBytesSentRef.current);

          session.sendRealtimeInput?.({
            audio: {
              data: base64Audio,
              mimeType: "audio/pcm;rate=16000",
            },
          });

          if (audioChunkCountRef.current % 20 === 0) {
            pushDebugEvent(
              "audio-in",
              `chunks=${audioChunkCountRef.current} bytes=${audioBytesSentRef.current} type=${chunk.type || "unknown"}`,
            );
          }
        },
        (sample: MicrophoneLevelSample) => {
          setMicLevel(sample.rms);
          setMicPeak(sample.peak);

          const now = performance.now();
          if (now - lastWaveUpdateRef.current < 50) {
            return;
          }

          lastWaveUpdateRef.current = now;
          setWaveform((current) => [
            ...current.slice(1),
            Math.min(1, sample.peak * 2.2),
          ]);
        },
        mediaStream,
      );

      micRef.current = microphone;
      pushDebugEvent("mic", "microphone stream started");

      setTranscript((current) => [
        ...current,
        createTranscriptEntry(
          "system",
          parsedCase.patientName
            ? `Session démarrée pour ${parsedCase.patientName}. Parle pour lancer l'entretien.`
            : "Session démarrée. Parle pour lancer l'entretien.",
        ),
      ]);

      setIsDiscussing(true);
      setConversationPhase("listening");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      shouldSendAudioRef.current = true;
      setStatus(`Unable to start: ${message}`);
      setConversationPhase("idle");
      setShowStudentDraftIndicator(false);
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur: ${message}`),
      ]);
      pushDebugEvent("error", message);
    } finally {
      setIsConnecting(false);
    }
  }

  async function stopDiscussion() {
    setStatus("Closing discussion");

    try {
      shouldSendAudioRef.current = false;
      await finalizeStudentDraft();
      sessionRef.current?.sendRealtimeInput?.({ audioStreamEnd: true });
      pushDebugEvent("session", "audioStreamEnd sent");

      const recordingBlob = await micRef.current?.stop();
      if (recordingBlob) {
        const nextUrl = URL.createObjectURL(recordingBlob);
        recordedAudioUrlRef.current = nextUrl;
        setRecordedAudioUrl(nextUrl);
        pushDebugEvent(
          "recording",
          `audio ready (${Math.round(recordingBlob.size / 1024)} KB)`,
        );
      }

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
      setConversationPhase("idle");
      setMicLevel(0);
      setMicPeak(0);
      setShowTranscriptReview(true);
    }
  }

  async function evaluateDiscussion() {
    try {
      setIsEvaluating(true);
      setStatus("Evaluating transcript");

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
      setStatus("Evaluation complete");
      setShowTranscriptReview(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown evaluation error";

      setStatus(`Evaluation failed: ${message}`);
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("system", `Erreur d'évaluation: ${message}`),
      ]);
    } finally {
      setTimeout(() => setIsEvaluating(false), 250);
    }
  }

  useEffect(() => {
    return () => {
      shouldSendAudioRef.current = false;
      void micRef.current?.stop();
      sessionRef.current?.close();
      void playerRef.current?.close();

      if (recordedAudioUrlRef.current) {
        URL.revokeObjectURL(recordedAudioUrlRef.current);
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.85),_rgba(233,241,242,0.95)_38%,_rgba(221,233,234,1)_100%)] px-4 py-5 text-slate-800 md:px-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <header className="rounded-[32px] border border-white/70 bg-white/75 p-6 shadow-panel backdrop-blur">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-clinic-700">
            Dynamic ECOS Simulator
          </p>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-3xl leading-tight text-clinic-950 md:text-5xl">
                Simulation clinique pilotée par Gemini Live
              </h1>
              <p className="mt-3 max-w-4xl text-sm text-slate-600 md:text-base">
                Setup dynamique, discussion vocale patient simulé, transcription
                temps réel et évaluation structurée.
              </p>
            </div>

            {patientInfo.length > 0 && (
              <div className="rounded-2xl bg-clinic-50/80 px-5 py-4 text-sm shadow-sm">
                <div className="font-semibold uppercase tracking-[0.18em] text-clinic-900">
                  {parsedCase.patientName || "Patient"}
                </div>
                <div className="mt-1 text-slate-600">
                  {parsedCase.patientAge || "Âge non détecté"}
                </div>
                {patientInfo.find((item) => item.label === "Profession") && (
                  <div className="mt-1 text-slate-500">
                    {
                      patientInfo.find((item) => item.label === "Profession")
                        ?.value
                    }
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(420px,520px)_minmax(760px,1fr)]">
          <div className="space-y-6">
            <div className="rounded-[32px] border border-white/70 bg-white/75 p-5 shadow-panel backdrop-blur">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-clinic-950">Setup</h2>
                <button
                  type="button"
                  onClick={handleParse}
                  className="rounded-full bg-clinic-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-clinic-900"
                >
                  Parse & Prepare
                </button>
              </div>

              <textarea
                value={rawInput}
                onChange={(event) => setRawInput(event.target.value)}
                className="min-h-[300px] w-full resize-none rounded-[28px] border border-slate-200 bg-slate-50/80 p-4 text-sm outline-none transition focus:border-clinic-300"
                placeholder="Colle ici la Trame du Patient et la Grille de Correction"
              />

              <div className="mt-4 text-sm text-slate-500">
                {parseError ||
                  "Le parser utilise des regex simples et reste tolérant aux séparateurs."}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/70 bg-white/75 p-5 shadow-panel backdrop-blur">
              <h2 className="text-2xl font-semibold text-clinic-950">
                Préparation
              </h2>

              {patientInfo.length === 0 ? (
                <div className="mt-4 rounded-[28px] bg-slate-50/80 p-5 text-sm text-slate-500">
                  Les informations patient apparaîtront ici après le parsing.
                </div>
              ) : (
                <div className="mt-4 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
                    Patient Information
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {patientInfo.map((item) => (
                      <div
                        key={`${item.label}-${item.value}`}
                        className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {item.label}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
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
            <div className="rounded-[32px] border border-white/70 bg-white/75 p-5 shadow-panel backdrop-blur">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-clinic-950">
                    Discussion
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">{status}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-clinic-800">
                    {conversationPhase.replace("-", " ")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      remainingSeconds <= 60
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    ⏱ {formatCountdown(remainingSeconds)}
                  </div>

                  <button
                    type="button"
                    onClick={startDiscussion}
                    disabled={
                      isConnecting || isDiscussing || !parsedCase.patientScript
                    }
                    className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isConnecting ? "Connecting..." : "Start Discussion"}
                  </button>

                  <button
                    type="button"
                    onClick={stopDiscussion}
                    disabled={!isDiscussing}
                    className="rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    End Discussion
                  </button>

                  <button
                    type="button"
                    onClick={evaluateDiscussion}
                    disabled={
                      isDiscussing ||
                      isEvaluating ||
                      transcript.length === 0 ||
                      !parsedCase.gradingGrid
                    }
                    className="rounded-full bg-clinic-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-clinic-900 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isEvaluating ? "Evaluating..." : "Judge Transcript"}
                  </button>
                </div>
              </div>

              <div
                ref={transcriptRef}
                className="mt-5 flex min-h-[460px] max-h-[460px] flex-col gap-3 overflow-y-auto rounded-[30px] bg-slate-950/95 p-4"
              >
                {transcript.length === 0 && !showStudentDraftIndicator ? (
                  <div className="m-auto max-w-sm text-center text-sm text-slate-400">
                    Le transcript live s'affichera ici pendant l'entretien.
                  </div>
                ) : (
                  <>
                    {transcript.map((entry) => (
                      <article
                        key={entry.id}
                        className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm ${
                          entry.role === "student"
                            ? "self-end bg-clinic-500 text-white"
                            : entry.role === "patient"
                              ? "self-start bg-white text-slate-900"
                              : "self-center bg-slate-800 text-slate-200"
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
                      <article className="self-end max-w-[90%] rounded-2xl bg-clinic-500 px-4 py-3 text-sm text-white opacity-85">
                        <div className="mb-1 flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.18em] opacity-80">
                          <span>student</span>
                          <span>{createTimestamp()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Student talking</span>
                          <span className="inline-flex gap-1">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/90" />
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/90 [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/90 [animation-delay:300ms]" />
                          </span>
                        </div>
                      </article>
                    )}
                  </>
                )}
              </div>

              <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
                    Mic Monitor
                  </h3>
                  <div className="text-xs text-slate-500">
                    rms {formatPercent(micLevel)} | peak {formatPercent(micPeak)}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <div className="mb-3 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-75 ${
                        micPeak > 0.12 ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                      style={{ width: `${Math.min(100, micPeak * 250)}%` }}
                    />
                  </div>

                  <div className="flex h-16 items-end gap-1">
                    {waveform.map((value, index) => (
                      <div
                        key={`${index}-${Math.round(value * 1000)}`}
                        className={`flex-1 rounded-full transition-[height] duration-75 ${
                          value > 0.08 ? "bg-clinic-700" : "bg-slate-200"
                        }`}
                        style={{ height: `${Math.max(8, value * 100)}%` }}
                      />
                    ))}
                  </div>

                  <p className="mt-3 text-xs text-slate-500">
                    This monitor is local to the browser. If it moves while you
                    speak, microphone capture works even if Gemini transcript
                    stays empty.
                  </p>
                </div>
              </div>

              {recordedAudioUrl && (
                <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
                      Student Audio Replay
                    </h3>
                    <div className="text-xs text-slate-500">
                      Recorded locally in browser
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white p-4">
                    <audio controls className="w-full" src={recordedAudioUrl}>
                      Your browser does not support audio playback.
                    </audio>
                  </div>
                </div>
              )}

              {transcript.length > 0 && (
                <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
                      Transcript Review
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setShowTranscriptReview((current) => !current)
                      }
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm"
                    >
                      {showTranscriptReview ? "Hide" : "Show"}
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
                                  ? "bg-clinic-800 text-white"
                                  : "bg-white text-slate-700 shadow-sm"
                              }`}
                            >
                              {filter}
                            </button>
                          ),
                        )}
                      </div>

                      <div className="max-h-[260px] overflow-y-auto rounded-2xl bg-white p-4 text-sm text-slate-700">
                        <pre className="m-0 whitespace-pre-wrap font-sans">
                          {filteredTranscriptText ||
                            "No transcript for this filter."}
                        </pre>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
                    Live Debug
                  </h3>
                  <div className="text-xs text-slate-500">
                    chunks in: {audioChunkCount} | bytes in: {audioBytesSent}
                  </div>
                </div>

                <div className="max-h-[220px] overflow-y-auto rounded-2xl bg-white p-3">
                  {debugEvents.length === 0 ? (
                    <div className="text-sm text-slate-500">
                      No live events yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {debugEvents.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-700"
                        >
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {event.label}
                            </span>
                            <span className="text-slate-400">
                              {event.timestamp}
                            </span>
                          </div>
                          <div className="break-words">{event.details}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/70 bg-white/75 p-5 shadow-panel backdrop-blur">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-clinic-950">
                  Results
                </h2>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                  {evaluation?.score ?? "--/15"}
                </div>
              </div>

              {!evaluation ? (
                <div className="mt-4 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center text-sm text-slate-500">
                  La grille d’évaluation reste masquée jusqu’au jugement final.
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-[28px] border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Critère</th>
                        <th className="px-4 py-3 font-semibold">Résultat</th>
                        <th className="px-4 py-3 font-semibold">Feedback</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {evaluation.details.map((detail, index) => (
                        <tr key={`${detail.criterion}-${index}`}>
                          <td className="px-4 py-3 text-slate-800">
                            {detail.criterion}
                          </td>
                          <td className="px-4 py-3">
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
                          <td className="px-4 py-3 text-slate-600">
                            {detail.feedback}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {isEvaluating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-white/60 bg-white p-6 shadow-2xl">
            <div className="text-center">
              <div className="text-lg font-semibold text-clinic-950">
                Evaluation en cours
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Analyse du transcript face à la grille de correction…
              </div>
            </div>

            <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-clinic-800 transition-[width] duration-300"
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
