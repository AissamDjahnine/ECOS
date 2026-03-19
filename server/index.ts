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

const app = express();
const port = Number(process.env.PORT ?? 3001);

const geminiApiKey = process.env.GEMINI_API_KEY;
const evalModel = process.env.GEMINI_EVAL_MODEL ?? "gemini-2.5-flash";
const liveModel =
  process.env.GEMINI_LIVE_MODEL ??
  "gemini-2.5-flash-native-audio-preview-12-2025";

function stripParentheticalStageDirections(text: string) {
  return text.replace(/\s*\(([^)]*)\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
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

app.post("/api/live-token", async (request, response) => {
  if (!geminiApiKey) {
    response.status(500).send("Missing GEMINI_API_KEY.");
    return;
  }

  const schema = z.object({
    patientScript: z.string().min(1),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(parsed.error.flatten());
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        apiVersion: "v1alpha",
      },
    });

    const cleanedPatientScript = stripParentheticalStageDirections(
      parsed.data.patientScript,
    );

    const systemInstruction = [
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

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: liveModel,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity:
                  StartSensitivity.START_SENSITIVITY_HIGH,
                endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
                prefixPaddingMs: 160,
                silenceDurationMs: 1200,
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
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create live token.";
    response.status(500).send(message);
  }
});

app.post("/api/evaluate", async (request, response) => {
  if (!geminiApiKey) {
    response.status(500).send("Missing GEMINI_API_KEY.");
    return;
  }


  const schema = z.object({
    transcript: z.string().min(1),
    gradingGrid: z.string().min(1),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(parsed.error.flatten());
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

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
                "Le feedback doit expliquer brièvement ce que l'étudiant a réellement fait ou n'a pas fait pour chaque critère.",
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
          required: ["score", "details"],
        },
      },
    });

    const text = result.text;
    if (!text) {
      response.status(502).send("Gemini returned an empty response.");
      return;
    }

    response.type("application/json").send(text);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to evaluate transcript.";
    response.status(500).send(message);
  }
});

app.post("/api/transcribe-turn", async (request, response) => {
  if (!geminiApiKey) {
    response.status(500).send("Missing GEMINI_API_KEY.");
    return;
  }

  const schema = z.object({
    audioBase64: z.string().min(1),
    mimeType: z.string().min(1),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json(parsed.error.flatten());
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const result = await ai.models.generateContent({
      model: evalModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Transcris fidèlement cet audio en français.",
                "Retourne uniquement le texte prononcé.",
                "N'ajoute aucun commentaire, aucune explication, aucun formatage.",
              ].join("\n"),
            },
            {
              inlineData: {
                data: parsed.data.audioBase64,
                mimeType: parsed.data.mimeType,
              },
            },
          ],
        },
      ],
    });

    response.json({ text: result.text?.trim() ?? "" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to transcribe audio.";
    response.status(500).send(message);
  }
});

app.listen(port, () => {
  console.log(`ECOS server listening on http://localhost:${port}`);
});
