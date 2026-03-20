import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  buildDashboardSnapshot,
  estimateCostUsd,
  loadUsageLedger,
  persistUsageLedger,
} from "./dashboard";

describe("dashboard helpers", () => {
  it("blocks when no key source is available", () => {
    const snapshot = buildDashboardSnapshot({
      events: [],
      keySource: "missing",
      liveModel: "gemini-2.5-flash-native-audio-preview-12-2025",
      evalModel: "gemini-2.5-flash",
      window: "1d",
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
      window: "1d",
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
      window: "1d",
      now: new Date("2026-03-19T12:00:00.000Z"),
    });

    expect(snapshot.today.totalTokens).toBe(500);
    expect(snapshot.period.totalTokens).toBe(500);
    expect(snapshot.lastSession.totalTokens).toBe(500);
    expect(snapshot.backendToday.totalTokens).toBe(500);
  });

  it("filters the selected dashboard window", () => {
    const snapshot = buildDashboardSnapshot({
      events: [
        {
          endpoint: "evaluate",
          model: "gemini-2.5-flash",
          keySource: "server",
          occurredAt: "2026-03-19T11:45:00.000Z",
          statusCode: 200,
          outcome: "success",
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          estimatedCostUsd: 0.001,
        },
        {
          endpoint: "evaluate",
          model: "gemini-2.5-flash",
          keySource: "server",
          occurredAt: "2026-03-18T10:00:00.000Z",
          statusCode: 200,
          outcome: "success",
          inputTokens: 500,
          outputTokens: 100,
          totalTokens: 600,
          estimatedCostUsd: 0.004,
        },
      ],
      keySource: "server",
      liveModel: "gemini-2.5-flash-native-audio-preview-12-2025",
      evalModel: "gemini-2.5-flash",
      window: "1h",
      now: new Date("2026-03-19T12:00:00.000Z"),
    });

    expect(snapshot.period.totalTokens).toBe(150);
    expect(snapshot.windowLabel).toMatch(/heure/i);
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

  it("persists and reloads the usage ledger", async () => {
    const filePath = path.join(
      os.tmpdir(),
      `usage-ledger-${randomUUID()}.json`,
    );
    const events = [
      {
        endpoint: "evaluate" as const,
        model: "gemini-2.5-flash",
        keySource: "custom" as const,
        occurredAt: "2026-03-19T11:55:00.000Z",
        statusCode: 200,
        outcome: "success" as const,
        inputTokens: 42,
        outputTokens: 12,
        totalTokens: 54,
        estimatedCostUsd: 0.0001,
      },
    ];

    await persistUsageLedger(events, filePath);
    await expect(loadUsageLedger(filePath)).resolves.toEqual(events);
  });
});
