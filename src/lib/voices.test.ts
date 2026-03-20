import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UNKNOWN_VOICE,
  inferVoiceFromPatientSex,
  MALE_VOICE_OPTIONS,
} from "./voices";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inferVoiceFromPatientSex", () => {
  it("picks a deterministic male voice when randomness is stubbed", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(inferVoiceFromPatientSex("M")).toBe(MALE_VOICE_OPTIONS[0].value);
  });

  it("avoids reusing the previous male voice when alternatives exist", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(inferVoiceFromPatientSex("M", MALE_VOICE_OPTIONS[0].value)).toBe(
      MALE_VOICE_OPTIONS[1].value,
    );
  });

  it("falls back when sex is missing", () => {
    expect(inferVoiceFromPatientSex("")).toBe(DEFAULT_UNKNOWN_VOICE);
  });
});
