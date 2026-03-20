import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  persistSettings,
  sanitizeSettings,
} from "./settings";

describe("settings helpers", () => {
  it("returns defaults when storage is empty", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("sanitizes invalid persisted values", () => {
    const result = sanitizeSettings({
      defaultTimerSeconds: 999,
      autoEvaluateAfterEnd: true,
      recordedAudioPlaybackRate: 1.5,
      showLiveTranscript: false,
      showSystemMessages: "yes",
      autoExportPdfAfterEvaluation: true,
      feedbackDetailLevel: "verbose",
      googleApiKey: "  abc123  ",
    });

    expect(result).toEqual({
      ...DEFAULT_SETTINGS,
      autoEvaluateAfterEnd: true,
      recordedAudioPlaybackRate: 1.5,
      showLiveTranscript: false,
      autoExportPdfAfterEvaluation: true,
      googleApiKey: "abc123",
    });
  });

  it("persists and reloads valid settings", () => {
    const custom = {
      ...DEFAULT_SETTINGS,
      defaultTimerSeconds: 600,
      autoEvaluateAfterEnd: true,
      recordedAudioPlaybackRate: 1.25 as const,
      showLiveTranscript: false,
      showSystemMessages: false,
      autoExportPdfAfterEvaluation: true,
      feedbackDetailLevel: "detailed" as const,
      googleApiKey: "test-google-key",
    };

    persistSettings(custom);

    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain("600");
    expect(loadSettings()).toEqual(custom);
  });
});
