import { buildDashboardSnapshot, estimateCostUsd } from "./dashboard";

describe("dashboard helpers", () => {
  it("blocks when no key source is available", () => {
    const snapshot = buildDashboardSnapshot({
      events: [],
      keySource: "missing",
      liveModel: "gemini-2.5-flash-native-audio-preview-12-2025",
      evalModel: "gemini-2.5-flash",
      now: new Date("2026-03-19T12:00:00.000Z"),
    });

    expect(snapshot.status).toBe("blocked");
    expect(snapshot.statusMessage).toMatch(/aucune clé/i);
  });

  it("marks the dashboard risky after a recent rate limit", () => {
    const snapshot = buildDashboardSnapshot({
      events: [
        {
          endpoint: "evaluate",
          model: "gemini-2.5-flash",
          keySource: "custom",
          occurredAt: "2026-03-19T11:55:00.000Z",
          statusCode: 429,
          outcome: "error",
          errorType: "rate-limit",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        },
      ],
      keySource: "custom",
      liveModel: "gemini-2.5-flash-native-audio-preview-12-2025",
      evalModel: "gemini-2.5-flash",
      now: new Date("2026-03-19T12:00:00.000Z"),
    });

    expect(snapshot.status).toBe("risky");
    expect(snapshot.recentFailures).toBe(1);
  });

  it("sums today and last-session usage", () => {
    const snapshot = buildDashboardSnapshot({
      events: [
        {
          endpoint: "transcribe-turn",
          model: "gemini-2.5-flash",
          keySource: "server",
          sessionId: "session-a",
          occurredAt: "2026-03-19T10:00:00.000Z",
          statusCode: 200,
          outcome: "success",
          inputTokens: 100,
          outputTokens: 20,
          totalTokens: 120,
          estimatedCostUsd: 0.001,
        },
        {
          endpoint: "evaluate",
          model: "gemini-2.5-flash",
          keySource: "server",
          sessionId: "session-a",
          occurredAt: "2026-03-19T10:02:00.000Z",
          statusCode: 200,
          outcome: "success",
          inputTokens: 300,
          outputTokens: 80,
          totalTokens: 380,
          estimatedCostUsd: 0.003,
        },
      ],
      keySource: "server",
      liveModel: "gemini-2.5-flash-native-audio-preview-12-2025",
      evalModel: "gemini-2.5-flash",
      now: new Date("2026-03-19T12:00:00.000Z"),
    });

    expect(snapshot.today.totalTokens).toBe(500);
    expect(snapshot.lastSession.totalTokens).toBe(500);
    expect(snapshot.backendToday.totalTokens).toBe(500);
  });

  it("estimates model cost from text and audio tokens", () => {
    const cost = estimateCostUsd({
      model: "gemini-2.5-flash-native-audio-preview-12-2025",
      inputTextTokens: 10_000,
      inputAudioTokens: 20_000,
      outputTextTokens: 5_000,
      outputAudioTokens: 8_000,
    });

    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeCloseTo(0.171, 3);
  });
});
