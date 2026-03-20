import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  TurnCoverage,
} from "@google/genai";
import { z } from "zod";
import {
  buildDashboardSnapshot,
  classifyErrorType,
  DEFAULT_USAGE_LEDGER_PATH,
  estimateCostUsd,
  loadUsageLedger,
  persistUsageLedger,
  type UsageEvent,
} from "./dashboard";
import { getFeedbackInstruction } from "./evaluation";
import { isSupportedVoiceName } from "../src/lib/voices";

const app = express();
const port = Number(process.env.PORT ?? 3001);

const geminiApiKey = process.env.GEMINI_API_KEY;
const evalModel = process.env.GEMINI_EVAL_MODEL ?? "gemini-2.5-flash";
const liveModel =
  process.env.GEMINI_LIVE_MODEL ??
  "gemini-2.5-flash-native-audio-preview-12-2025";
const usageEvents: UsageEvent[] = [];
let usageLedgerWrite = Promise.resolve();

function resolveApiKey(override?: string) {
  const trimmedOverride = override?.trim();
  if (trimmedOverride) {
    return trimmedOverride;
  }

  return geminiApiKey;
}

function resolveKeySource(override?: string) {
  if (override?.trim()) {
    return "custom" as const;
  }

  return geminiApiKey ? ("server" as const) : ("missing" as const);
}

function resolveTrackableKeySource(override?: string) {
  const keySource = resolveKeySource(override);
  return keySource === "missing" ? ("server" as const) : keySource;
}

function recordUsageEvent(event: UsageEvent) {
  usageEvents.push(event);

  if (usageEvents.length > 5000) {
    usageEvents.splice(0, usageEvents.length - 5000);
  }

  usageLedgerWrite = usageLedgerWrite
    .catch(() => undefined)
    .then(() => persistUsageLedger(usageEvents, DEFAULT_USAGE_LEDGER_PATH))
    .catch((error) => {
      console.error("Failed to persist usage ledger:", error);
    });
}

function usageMetadataToCounts(usageMetadata?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}) {
  return {
    inputTokens: usageMetadata?.promptTokenCount ?? 0,
    outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
    totalTokens:
      usageMetadata?.totalTokenCount ??
      (usageMetadata?.promptTokenCount ?? 0) +
        (usageMetadata?.candidatesTokenCount ?? 0),
  };
}

function stripParentheticalStageDirections(text: string) {
  return text.replace(/\s*\(([^)]*)\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

function normalizeEvaluationScore(payload: {
  score?: string;
  commentary?: string;
  details?: Array<{ criterion?: string; observed?: boolean; feedback?: string }>;
}) {
  const details = Array.isArray(payload.details) ? payload.details : [];
  const observedCount = details.filter((detail) => detail?.observed === true).length;
  const maxScore = 15;

  return {
    ...payload,
    score: `${observedCount}/${maxScore}`,
    details,
  };
}

app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    liveModel,
    evalModel,
    configured: Boolean(geminiApiKey),
  });
});

app.post("/api/dashboard", (request, response) => {
  const schema = z.object({
    googleApiKey: z.string().optional(),
    window: z.enum(["1h", "1d", "7d", "30d"]).optional().default("1d"),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(parsed.error.flatten());
    return;
  }

  response.json(
    buildDashboardSnapshot({
      events: usageEvents,
      keySource: resolveKeySource(parsed.data.googleApiKey),
      liveModel,
      evalModel,
      window: parsed.data.window,
    }),
  );
});

app.post("/api/usage/live", (request, response) => {
  const schema = z.object({
    sessionId: z.string().min(1),
    googleApiKey: z.string().optional(),
    inputTextTokens: z.number().nonnegative().default(0),
    inputAudioTokens: z.number().nonnegative().default(0),
    outputTextTokens: z.number().nonnegative().default(0),
    outputAudioTokens: z.number().nonnegative().default(0),
    totalTokens: z.number().nonnegative().default(0),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(parsed.error.flatten());
    return;
  }

  const keySource = resolveKeySource(parsed.data.googleApiKey);
  if (keySource === "missing") {
    response.status(200).json({ ok: true });
    return;
  }

  recordUsageEvent({
    endpoint: "live-usage",
    model: liveModel,
    keySource,
    sessionId: parsed.data.sessionId,
    occurredAt: new Date().toISOString(),
    statusCode: 200,
    outcome: "success",
    inputTokens: parsed.data.inputTextTokens + parsed.data.inputAudioTokens,
    outputTokens: parsed.data.outputTextTokens + parsed.data.outputAudioTokens,
    totalTokens:
      parsed.data.totalTokens ||
      parsed.data.inputTextTokens +
        parsed.data.inputAudioTokens +
        parsed.data.outputTextTokens +
        parsed.data.outputAudioTokens,
    estimatedCostUsd: estimateCostUsd({
      model: liveModel,
      inputTextTokens: parsed.data.inputTextTokens,
      inputAudioTokens: parsed.data.inputAudioTokens,
      outputTextTokens: parsed.data.outputTextTokens,
      outputAudioTokens: parsed.data.outputAudioTokens,
    }),
  });

  response.json({ ok: true });
});

app.post("/api/live-token", async (request, response) => {
  const schema = z.object({
    mode: z.enum(["interactive", "silent"]).optional().default("interactive"),
    patientScript: z.string().optional(),
    googleApiKey: z.string().optional(),
    sessionId: z.string().optional(),
    voiceName: z.string().optional(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(parsed.error.flatten());
    return;
  }

  if (
    parsed.data.mode === "interactive" &&
    !parsed.data.patientScript?.trim()
  ) {
    response.status(400).send("patientScript is required in interactive mode.");
    return;
  }

  try {
    const apiKey = resolveApiKey(parsed.data.googleApiKey);
    const keySource = resolveTrackableKeySource(parsed.data.googleApiKey);
    if (!apiKey) {
      recordUsageEvent({
        endpoint: "live-token",
        model: liveModel,
        keySource: "server",
        sessionId: parsed.data.sessionId,
        occurredAt: new Date().toISOString(),
        statusCode: 500,
        outcome: "error",
        errorType: "auth",
        message: "Missing GEMINI_API_KEY.",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      });
      response.status(500).send("Missing GEMINI_API_KEY.");
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "v1alpha",
      },
    });

    const cleanedPatientScript = stripParentheticalStageDirections(
      parsed.data.patientScript ?? "",
    );
    const voiceName = isSupportedVoiceName(parsed.data.voiceName ?? "")
      ? parsed.data.voiceName
      : undefined;

    const systemInstruction =
      parsed.data.mode === "silent"
        ? [
            "Tu accompagnes un ECOS sans patient simulé.",
            "L'étudiant parle seul pour exposer son raisonnement clinique.",
            "La langue parlée par l'étudiant est le français de France.",
            "Interprète toute entrée vocale en français et privilégie la reconnaissance fidèle des termes médicaux, des nombres, des unités et des valeurs biologiques.",
            "Ne joue jamais un patient, un examinateur ou un assistant.",
            "Ne donne jamais de contenu clinique, de conseil, de question, d'indice, de correction ou de réponse pédagogique.",
            "N'ajoute jamais d'information médicale.",
            "Quand l'étudiant parle, laisse uniquement la transcription d'entrée être produite par la session Live.",
            "Ne reformule jamais la parole de l'étudiant et ne corrige pas son raisonnement: la transcription doit rester au plus proche des mots prononcés.",
            "N'émet aucune réponse utile au modèle, aucun texte explicatif, aucun résumé, aucune reformulation.",
            "Si tu dois produire une sortie, elle doit être vide et silencieuse.",
          ].join("\n")
        : [
            "Tu es le patient décrit ci-dessous.",
            "Agis de façon réaliste et naturelle.",
            "Ne sors jamais de ton rôle.",
            "Tu réponds uniquement à ce que l'étudiant te demande.",
            "Ne donne jamais d'indices, d'aides, de pistes, ni d'orientation implicite ou explicite.",
            "Ne suggère jamais spontanément un symptôme, un diagnostic, un examen, un antécédent, un traitement ou une information non demandée.",
            "Si l'étudiant pose une question vague, réponds de façon vague comme un vrai patient, sans l'aider à mieux formuler.",
            "Ne structure pas tes réponses comme un enseignant, un correcteur ou un médecin.",
            "Ne donne jamais la réponse attendue à l'ECOS.",
            "Si une information importante n'est pas explicitement demandée, garde-la pour toi.",
            "Les émotions éventuelles doivent être exprimées uniquement par le ton, les pauses, l'intonation et la voix.",
            "Ne lis jamais de didascalies, de parenthèses, d'émotions ou d'indications scéniques à voix haute.",
            "Ne prononce jamais des mots comme fatiguée, gênée, stressée, perdue, soupir, hésitante, embarrassée, sauf si le patient les dit réellement comme contenu de sa réponse.",
            "Ne mentionne jamais d'informations qui sont déjà présentes sur la grille d'évaluation.",
            "Ne donne aucun détail supplémentaire si le médecin ne te le demande pas explicitement.",
            "",
            cleanedPatientScript,
          ].join("\n");

    const promptTokenEstimate = await ai.models.countTokens({
      model: liveModel,
      contents: systemInstruction,
    });

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: liveModel,
          config: {
            responseModalities:
              parsed.data.mode === "silent"
                ? [Modality.AUDIO]
                : [Modality.AUDIO],
            ...(parsed.data.mode !== "silent" && voiceName
              ? {
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: {
                        voiceName,
                      },
                    },
                  },
                }
              : {}),
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity:
                  StartSensitivity.START_SENSITIVITY_HIGH,
                endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
                prefixPaddingMs: 320,
                silenceDurationMs: parsed.data.mode === "silent" ? 1800 : 1200,
              },
              activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
              turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
            },
            systemInstruction,
          },
        },
      },
    });

    response.json({
      token: token.name,
      model: liveModel,
    });

    recordUsageEvent({
      endpoint: "live-token",
      model: liveModel,
      keySource,
      sessionId: parsed.data.sessionId,
      occurredAt: new Date().toISOString(),
      statusCode: 200,
      outcome: "success",
      inputTokens: promptTokenEstimate.totalTokens ?? 0,
      outputTokens: 0,
      totalTokens: promptTokenEstimate.totalTokens ?? 0,
      estimatedCostUsd: estimateCostUsd({
        model: liveModel,
        inputTextTokens: promptTokenEstimate.totalTokens ?? 0,
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create live token.";
    recordUsageEvent({
      endpoint: "live-token",
      model: liveModel,
      keySource: resolveTrackableKeySource(parsed.data.googleApiKey),
      sessionId: parsed.data.sessionId,
      occurredAt: new Date().toISOString(),
      statusCode: 500,
      outcome: "error",
      errorType: classifyErrorType(500, message),
      message,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    });
    response.status(500).send(message);
  }
});

app.post("/api/evaluate", async (request, response) => {
  const schema = z.object({
    transcript: z.string().min(1),
    gradingGrid: z.string().min(1),
    feedbackDetailLevel: z
      .enum(["brief", "standard", "detailed"])
      .optional()
      .default("standard"),
    googleApiKey: z.string().optional(),
    sessionId: z.string().optional(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(parsed.error.flatten());
    return;
  }

  try {
    const apiKey = resolveApiKey(parsed.data.googleApiKey);
    const keySource = resolveTrackableKeySource(parsed.data.googleApiKey);
    if (!apiKey) {
      response.status(500).send("Missing GEMINI_API_KEY.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    const feedbackInstruction = getFeedbackInstruction(
      parsed.data.feedbackDetailLevel,
    );

    const result = await ai.models.generateContent({
      model: evalModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Tu es un correcteur ECOS.",
                "Analyse le transcript complet face à la grille de correction.",
                "Un critère est observé uniquement si l'étudiant l'a activement recherché, demandé, vérifié, reformulé ou exploré.",
                "Une information donnée spontanément par le patient ne suffit jamais à valider un critère.",
                "Si seul le patient mentionne un élément sans question, vérification ou exploration claire par l'étudiant, le critère doit être non observé.",
                "Ne crédite pas l'étudiant pour une information simplement entendue, acceptée passivement ou suivie d'un acquiescement vague.",
                feedbackInstruction,
                "Ajoute un champ `commentary` de 2 à 4 phrases maximum, rédigé en français, avec une synthèse professionnelle et personnalisée de la performance réelle de l'étudiant.",
                "Le commentaire doit s'appuyer sur ce qui est effectivement observé dans le transcript et les critères validés ou manqués.",
                "Le commentaire doit analyser en priorité la qualité du langage, le niveau d'explication, la technique d'entretien et la méthodologie clinique de l'étudiant.",
                "Évite les généralités vagues et n'utilise jamais l'expression 'smart analysis'.",
                "Retourne uniquement un JSON conforme au schema.",
                "",
                "Transcript:",
                parsed.data.transcript,
                "",
                "Grille de correction:",
                parsed.data.gradingGrid,
              ].join("\n"),
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            score: {
              type: "string",
              description: "Score global sous la forme X/15",
            },
            commentary: {
              type: "string",
              description:
                "Synthèse personnalisée et concise de la performance de l'étudiant.",
            },
            details: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  criterion: { type: "string" },
                  observed: { type: "boolean" },
                  feedback: { type: "string" },
                },
                required: ["criterion", "observed", "feedback"],
              },
            },
          },
          required: ["score", "commentary", "details"],
        },
      },
    });

    const text = result.text;
    if (!text) {
      response.status(502).send("Gemini returned an empty response.");
      return;
    }

    const usage = usageMetadataToCounts(result.usageMetadata);
    recordUsageEvent({
      endpoint: "evaluate",
      model: evalModel,
      keySource,
      sessionId: parsed.data.sessionId,
      occurredAt: new Date().toISOString(),
      statusCode: 200,
      outcome: "success",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: estimateCostUsd({
        model: evalModel,
        inputTextTokens: usage.inputTokens,
        outputTextTokens: usage.outputTokens,
      }),
    });

    const normalized = normalizeEvaluationScore(JSON.parse(text) as {
      score?: string;
      commentary?: string;
      details?: Array<{ criterion?: string; observed?: boolean; feedback?: string }>;
    });

    response.json(normalized);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to evaluate transcript.";
    recordUsageEvent({
      endpoint: "evaluate",
      model: evalModel,
      keySource: resolveTrackableKeySource(parsed.data.googleApiKey),
      sessionId: parsed.data.sessionId,
      occurredAt: new Date().toISOString(),
      statusCode: 500,
      outcome: "error",
      errorType: classifyErrorType(500, message),
      message,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    });
    response.status(500).send(message);
  }
});

app.post("/api/transcript-debug", async (request, response) => {
  const schema = z.object({
    transcriptSegment: z.string().min(1),
    googleApiKey: z.string().optional(),
    sessionId: z.string().optional(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(parsed.error.flatten());
    return;
  }

  try {
    const apiKey = resolveApiKey(parsed.data.googleApiKey);
    const keySource = resolveTrackableKeySource(parsed.data.googleApiKey);
    if (!apiKey) {
      response.status(500).send("Missing GEMINI_API_KEY.");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: evalModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Tu aides à corriger minimalement une transcription vocale d'ECOS sans patient simulé.",
                "On te donne un transcript brut, potentiellement bruité.",
                "Ta tâche est de produire une correction IA au plus proche de la source.",
                "Conserve l'ordre, la structure et le sens apparent du texte original.",
                "Fais uniquement des corrections minimales et prudentes : espaces, apostrophes, coupures de mots évidentes, ponctuation simple, nombres et unités quand ils sont manifestes.",
                "N'ajoute jamais d'information absente et ne reformule pas librement.",
                "Si un mot, un nombre ou un terme médical reste ambigu, laisse une version prudente dans la correction et signale l'ambiguïté explicitement.",
                "Réponds uniquement en JSON conforme au schema.",
                "",
                "Transcript brut:",
                parsed.data.transcriptSegment,
              ].join("\n"),
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            understoodText: {
              type: "string",
              description:
                "Transcript corrigé minimalement, au plus proche de la source.",
            },
            confidence: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Niveau de confiance global sur l'interprétation.",
            },
            ambiguities: {
              type: "array",
              items: { type: "string" },
              description:
                "Mots, nombres ou expressions qui restent ambigus ou mal compris.",
            },
          },
          required: ["understoodText", "confidence", "ambiguities"],
        },
      },
    });

    const text = result.text;
    if (!text) {
      response.status(502).send("Gemini returned an empty response.");
      return;
    }

    const usage = usageMetadataToCounts(result.usageMetadata);
    recordUsageEvent({
      endpoint: "transcript-debug",
      model: evalModel,
      keySource,
      sessionId: parsed.data.sessionId,
      occurredAt: new Date().toISOString(),
      statusCode: 200,
      outcome: "success",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: estimateCostUsd({
        model: evalModel,
        inputTextTokens: usage.inputTokens,
        outputTextTokens: usage.outputTokens,
      }),
    });

    response.json(
      JSON.parse(text) as {
        understoodText: string;
        confidence: "low" | "medium" | "high";
        ambiguities: string[];
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to debug transcript.";
    recordUsageEvent({
      endpoint: "transcript-debug",
      model: evalModel,
      keySource: resolveTrackableKeySource(parsed.data.googleApiKey),
      sessionId: parsed.data.sessionId,
      occurredAt: new Date().toISOString(),
      statusCode: 500,
      outcome: "error",
      errorType: classifyErrorType(500, message),
      message,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    });
    response.status(500).send(message);
  }
});

async function bootstrap() {
  const persistedEvents = await loadUsageLedger(DEFAULT_USAGE_LEDGER_PATH);
  usageEvents.splice(0, usageEvents.length, ...persistedEvents);

  app.listen(port, () => {
    console.log(`ECOS server listening on http://localhost:${port}`);
  });
}

void bootstrap();
