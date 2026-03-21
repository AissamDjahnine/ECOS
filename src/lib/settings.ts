import type {
  AppSettings,
  AudioPlaybackRate,
  FeedbackDetailLevel,
} from "../types";

export const SETTINGS_STORAGE_KEY = "ecos-ai.settings.v1";

export const DEFAULT_TIMER_SECONDS = 8 * 60;

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: false,
  defaultTimerSeconds: DEFAULT_TIMER_SECONDS,
  autoEvaluateAfterEnd: false,
  recordedAudioPlaybackRate: 1,
  showLiveTranscript: true,
  showSystemMessages: true,
  autoExportPdfAfterEvaluation: false,
  feedbackDetailLevel: "standard",
  googleApiKey: "",
};

const VALID_TIMER_SECONDS = new Set([120, 180, 300, 480, 600, 720]);
const VALID_FEEDBACK_LEVELS = new Set<FeedbackDetailLevel>([
  "brief",
  "standard",
  "detailed",
]);
const VALID_PLAYBACK_RATES = new Set<AudioPlaybackRate>([
  0.75,
  1,
  1.25,
  1.5,
  2,
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeSettings(value: unknown): AppSettings {
  if (!isObject(value)) {
    return DEFAULT_SETTINGS;
  }

  const nextTimer = VALID_TIMER_SECONDS.has(value.defaultTimerSeconds as number)
    ? (value.defaultTimerSeconds as number)
    : DEFAULT_SETTINGS.defaultTimerSeconds;
  const nextPlaybackRate = VALID_PLAYBACK_RATES.has(
    value.recordedAudioPlaybackRate as AudioPlaybackRate,
  )
    ? (value.recordedAudioPlaybackRate as AudioPlaybackRate)
    : DEFAULT_SETTINGS.recordedAudioPlaybackRate;
  const nextFeedbackLevel = VALID_FEEDBACK_LEVELS.has(
    value.feedbackDetailLevel as FeedbackDetailLevel,
  )
    ? (value.feedbackDetailLevel as FeedbackDetailLevel)
    : DEFAULT_SETTINGS.feedbackDetailLevel;

  return {
    darkMode:
      typeof value.darkMode === "boolean"
        ? value.darkMode
        : DEFAULT_SETTINGS.darkMode,
    defaultTimerSeconds: nextTimer,
    autoEvaluateAfterEnd:
      typeof value.autoEvaluateAfterEnd === "boolean"
        ? value.autoEvaluateAfterEnd
        : DEFAULT_SETTINGS.autoEvaluateAfterEnd,
    recordedAudioPlaybackRate: nextPlaybackRate,
    showLiveTranscript:
      typeof value.showLiveTranscript === "boolean"
        ? value.showLiveTranscript
        : DEFAULT_SETTINGS.showLiveTranscript,
    showSystemMessages:
      typeof value.showSystemMessages === "boolean"
        ? value.showSystemMessages
        : DEFAULT_SETTINGS.showSystemMessages,
    autoExportPdfAfterEvaluation:
      typeof value.autoExportPdfAfterEvaluation === "boolean"
        ? value.autoExportPdfAfterEvaluation
        : DEFAULT_SETTINGS.autoExportPdfAfterEvaluation,
    feedbackDetailLevel: nextFeedbackLevel,
    googleApiKey:
      typeof value.googleApiKey === "string"
        ? value.googleApiKey.trim()
        : DEFAULT_SETTINGS.googleApiKey,
  };
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function persistSettings(settings: AppSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function formatTimerLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}
