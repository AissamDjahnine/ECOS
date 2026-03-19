import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const VOICE_OPTIONS = [
  { value: "Zephyr" },
  { value: "Kore" },
  { value: "Leda" },
  { value: "Aoede" },
  { value: "Callirrhoe" },
  { value: "Autonoe" },
  { value: "Despina" },
  { value: "Erinome" },
  { value: "Laomedeia" },
  { value: "Achernar" },
  { value: "Gacrux" },
  { value: "Vindemiatrix" },
  { value: "Sulafat" },
  { value: "Puck" },
  { value: "Charon" },
  { value: "Fenrir" },
  { value: "Orus" },
  { value: "Enceladus" },
  { value: "Iapetus" },
  { value: "Umbriel" },
  { value: "Algieba" },
  { value: "Algenib" },
  { value: "Rasalgethi" },
  { value: "Alnilam" },
  { value: "Schedar" },
  { value: "Pulcherrima" },
  { value: "Achird" },
  { value: "Zubenelgenubi" },
  { value: "Sadachbia" },
  { value: "Sadaltager" },
];

const apiKey = process.env.GEMINI_API_KEY;
const outputDir = path.resolve(process.cwd(), "public/voice-samples");
const model = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
const phrase =
  process.env.VOICE_SAMPLE_TEXT ??
  "Bonjour Docteur, je suis prêt à répondre à vos questions.";
const forceRegenerate = process.env.FORCE_REGENERATE === "1";
const regenerateOnly = new Set(
  (process.env.REGENERATE_ONLY ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.toLowerCase()),
);
const batchSize = Number(process.env.BATCH_SIZE ?? "2");
const delayMs = Number(process.env.DELAY_MS ?? "120000");

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createWaveHeader(
  pcmByteLength,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16,
) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = Buffer.alloc(44);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcmByteLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcmByteLength, 40);

  return buffer;
}

async function shouldGenerateSample(voice) {
  const outputPath = path.join(outputDir, `${voice.value.toLowerCase()}.wav`);

  if (regenerateOnly.size > 0 && !regenerateOnly.has(voice.value.toLowerCase())) {
    console.log(`Leaving untouched ${outputPath}`);
    return false;
  }

  if (!forceRegenerate) {
    try {
      await fs.access(outputPath);
      console.log(`Skipping existing ${outputPath}`);
      return false;
    } catch {
      return true;
    }
  }

  return true;
}

async function generateSample(ai, voice) {
  const outputPath = path.join(outputDir, `${voice.value.toLowerCase()}.wav`);

  const response = await ai.models.generateContent({
    model,
    contents: phrase,
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice.value,
          },
        },
      },
    },
  });

  const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) {
    throw new Error(`No audio returned for voice ${voice.value}.`);
  }

  const pcmBuffer = Buffer.from(audioData, "base64");
  const waveBuffer = Buffer.concat([
    createWaveHeader(pcmBuffer.length),
    pcmBuffer,
  ]);
  await fs.writeFile(outputPath, waveBuffer);
  console.log(`Saved ${outputPath}`);
}

async function main() {
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey });
  await fs.mkdir(outputDir, { recursive: true });

  const pendingVoices = [];
  for (const voice of VOICE_OPTIONS) {
    if (await shouldGenerateSample(voice)) {
      pendingVoices.push(voice);
    }
  }

  for (let index = 0; index < pendingVoices.length; index += batchSize) {
    const batch = pendingVoices.slice(index, index + batchSize);
    for (const voice of batch) {
      await generateSample(ai, voice);
    }

    const hasRemainingBatch = index + batchSize < pendingVoices.length;
    if (hasRemainingBatch && delayMs > 0) {
      console.log(
        `Waiting ${Math.round(delayMs / 1000)}s before the next batch...`,
      );
      await sleep(delayMs);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
