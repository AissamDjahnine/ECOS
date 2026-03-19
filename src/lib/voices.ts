export type VoiceGender = "male" | "female";

export type VoiceOption = {
  value: string;
  label: string;
  gender: VoiceGender;
};

export const FEMALE_VOICE_OPTIONS: VoiceOption[] = [
  { value: "Zephyr", label: "Zephyr", gender: "female" },
  { value: "Kore", label: "Kore", gender: "female" },
  { value: "Leda", label: "Leda", gender: "female" },
  { value: "Aoede", label: "Aoede", gender: "female" },
  { value: "Callirrhoe", label: "Callirrhoe", gender: "female" },
  { value: "Autonoe", label: "Autonoe", gender: "female" },
  { value: "Despina", label: "Despina", gender: "female" },
  { value: "Erinome", label: "Erinome", gender: "female" },
  { value: "Laomedeia", label: "Laomedeia", gender: "female" },
  { value: "Achernar", label: "Achernar", gender: "female" },
  { value: "Gacrux", label: "Gacrux", gender: "female" },
  { value: "Vindemiatrix", label: "Vindemiatrix", gender: "female" },
  { value: "Sulafat", label: "Sulafat", gender: "female" },
];

export const MALE_VOICE_OPTIONS: VoiceOption[] = [
  { value: "Puck", label: "Puck", gender: "male" },
  { value: "Charon", label: "Charon", gender: "male" },
  { value: "Fenrir", label: "Fenrir", gender: "male" },
  { value: "Orus", label: "Orus", gender: "male" },
  { value: "Enceladus", label: "Enceladus", gender: "male" },
  { value: "Iapetus", label: "Iapetus", gender: "male" },
  { value: "Umbriel", label: "Umbriel", gender: "male" },
  { value: "Algieba", label: "Algieba", gender: "male" },
  { value: "Algenib", label: "Algenib", gender: "male" },
  { value: "Rasalgethi", label: "Rasalgethi", gender: "male" },
  { value: "Alnilam", label: "Alnilam", gender: "male" },
  { value: "Schedar", label: "Schedar", gender: "male" },
  { value: "Pulcherrima", label: "Pulcherrima", gender: "male" },
];

export const VOICE_OPTIONS: VoiceOption[] = [
  ...FEMALE_VOICE_OPTIONS,
  ...MALE_VOICE_OPTIONS,
];

export const DEFAULT_FEMALE_VOICE = FEMALE_VOICE_OPTIONS[0].value;
export const DEFAULT_MALE_VOICE = MALE_VOICE_OPTIONS[0].value;
export const DEFAULT_UNKNOWN_VOICE = DEFAULT_FEMALE_VOICE;
export const PREVIEW_SAMPLE_VOICE_NAMES = new Set([
  "Aoede",
  "Charon",
  "Fenrir",
  "Kore",
  "Leda",
  "Vindemiatrix",
]);

export function isSupportedVoiceName(value: string): boolean {
  return VOICE_OPTIONS.some((voice) => voice.value === value);
}

export function hasVoicePreviewSample(value: string) {
  return PREVIEW_SAMPLE_VOICE_NAMES.has(value);
}

function pickRandomVoice(
  voices: VoiceOption[],
  fallbackVoice: string,
  excludeVoice?: string,
) {
  const eligibleVoices =
    excludeVoice && voices.length > 1
      ? voices.filter((voice) => voice.value !== excludeVoice)
      : voices;

  if (eligibleVoices.length === 0) {
    return fallbackVoice;
  }

  const randomIndex = Math.floor(Math.random() * eligibleVoices.length);
  return eligibleVoices[randomIndex]?.value ?? fallbackVoice;
}

export function inferVoiceFromPatientSex(
  patientSex?: string,
  excludeVoice?: string,
) {
  const normalized = patientSex?.trim().toLowerCase() ?? "";

  if (
    normalized === "m" ||
    normalized === "masculin" ||
    normalized === "male" ||
    normalized === "homme"
  ) {
    return pickRandomVoice(
      MALE_VOICE_OPTIONS,
      DEFAULT_MALE_VOICE,
      excludeVoice,
    );
  }

  if (
    normalized === "f" ||
    normalized === "féminin" ||
    normalized === "feminin" ||
    normalized === "female" ||
    normalized === "femme"
  ) {
    return pickRandomVoice(
      FEMALE_VOICE_OPTIONS,
      DEFAULT_FEMALE_VOICE,
      excludeVoice,
    );
  }

  return DEFAULT_UNKNOWN_VOICE;
}
