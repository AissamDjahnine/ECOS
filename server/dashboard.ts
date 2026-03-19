import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  DashboardKeySource,
  DashboardSnapshot,
  DashboardStatus,
  DashboardWindow,
} from "../src/types";

export type UsageEvent = {
  endpoint: "live-token" | "live-usage" | "evaluate" | "transcribe-turn";
  model: string;
  keySource: Exclude<DashboardKeySource, "missing">;
  sessionId?: string;
  occurredAt: string;
  statusCode: number;
  outcome: "success" | "error";
  errorType?: "rate-limit" | "auth" | "billing" | "quota" | "unknown";
  message?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

type UsageLedger = {
  version: 1;
  events: UsageEvent[];
};

type ModelPricing = {
  textInputPerMillion: number;
  audioInputPerMillion?: number;
  textOutputPerMillion: number;
  audioOutputPerMillion?: number;
};

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gemini-2.5-flash": {
    textInputPerMillion: 0.3,
    audioInputPerMillion: 1,
    textOutputPerMillion: 2.5,
  },
  "gemini-2.5-flash-native-audio-preview-12-2025": {
    textInputPerMillion: 0.5,
    audioInputPerMillion: 3,
    textOutputPerMillion: 2,
    audioOutputPerMillion: 12,
  },
};

const WINDOW_DURATIONS_MS: Record<DashboardWindow, number> = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const WINDOW_LABELS: Record<DashboardWindow, string> = {
  "1h": "Dernière heure",
  "1d": "Dernier jour",
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
};

export const DEFAULT_USAGE_LEDGER_PATH = path.join(
  process.cwd(),
  "server",
  "data",
  "usage-ledger.json",
);

function zeroStats() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
}

function isUsageEvent(value: unknown): value is UsageEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UsageEvent>;
  return (
    typeof candidate.endpoint === "string" &&
    typeof candidate.model === "string" &&
    (candidate.keySource === "custom" || candidate.keySource === "server") &&
    typeof candidate.occurredAt === "string" &&
    typeof candidate.statusCode === "number" &&
    (candidate.outcome === "success" || candidate.outcome === "error") &&
    typeof candidate.inputTokens === "number" &&
    typeof candidate.outputTokens === "number" &&
    typeof candidate.totalTokens === "number" &&
    typeof candidate.estimatedCostUsd === "number"
  );
}

export function sanitizeUsageEvents(value: unknown) {
  if (!value || typeof value !== "object") {
    return [] as UsageEvent[];
  }

  const events = (value as { events?: unknown[] }).events;
  if (!Array.isArray(events)) {
    return [] as UsageEvent[];
  }

  return events.filter(isUsageEvent).sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  );
}

export async function loadUsageLedger(filePath = DEFAULT_USAGE_LEDGER_PATH) {
  try {
    const raw = await readFile(filePath, "utf8");
    return sanitizeUsageEvents(JSON.parse(raw));
  } catch {
    return [] as UsageEvent[];
  }
}

export async function persistUsageLedger(
  events: UsageEvent[],
  filePath = DEFAULT_USAGE_LEDGER_PATH,
) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });

  const payload: UsageLedger = {
    version: 1,
    events,
  };
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await rename(tempPath, filePath);
}

function sameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function sumEvents(events: UsageEvent[]) {
  return events.reduce(
    (accumulator, event) => ({
      inputTokens: accumulator.inputTokens + event.inputTokens,
      outputTokens: accumulator.outputTokens + event.outputTokens,
      totalTokens: accumulator.totalTokens + event.totalTokens,
      estimatedCostUsd:
        accumulator.estimatedCostUsd + event.estimatedCostUsd,
    }),
    zeroStats(),
  );
}

function getLatestEvent(events: UsageEvent[]) {
  return events.reduce<UsageEvent | null>((latest, event) => {
    if (!latest) {
      return event;
    }

    return new Date(event.occurredAt) > new Date(latest.occurredAt)
      ? event
      : latest;
  }, null);
}

function inferLimitsHint(status: DashboardStatus, keySource: DashboardKeySource) {
  if (keySource === "missing") {
    return "Ajoutez une clé API locale ou configurez GEMINI_API_KEY côté serveur avant de démarrer.";
  }

  if (status === "blocked") {
    return "Les derniers appels suggèrent un blocage du projet. Corrigez la clé, la facturation ou attendez avant de relancer une session.";
  }

  if (status === "risky") {
    return "Le projet reste utilisable, mais des signaux récents suggèrent un risque de throttling ou de quota.";
  }

  return "Le projet paraît prêt. Les coûts affichés restent des estimations et les limites exactes se vérifient dans Google AI Studio.";
}

export function classifyErrorType(
  statusCode: number,
  message?: string,
): UsageEvent["errorType"] {
  const lower = message?.toLowerCase() ?? "";

  if (statusCode === 429) {
    return "rate-limit";
  }

  if (statusCode === 401 || statusCode === 403 || lower.includes("api key")) {
    return "auth";
  }

  if (lower.includes("billing") || lower.includes("payment")) {
    return "billing";
  }

  if (lower.includes("quota") || lower.includes("limit exceeded")) {
    return "quota";
  }

  return "unknown";
}

export function estimateCostUsd(params: {
  model: string;
  inputTextTokens?: number;
  inputAudioTokens?: number;
  outputTextTokens?: number;
  outputAudioTokens?: number;
}) {
  const pricing = MODEL_PRICING[params.model];
  if (!pricing) {
    return 0;
  }

  const cost =
    ((params.inputTextTokens ?? 0) / 1_000_000) * pricing.textInputPerMillion +
    ((params.inputAudioTokens ?? 0) / 1_000_000) *
      (pricing.audioInputPerMillion ?? pricing.textInputPerMillion) +
    ((params.outputTextTokens ?? 0) / 1_000_000) *
      pricing.textOutputPerMillion +
    ((params.outputAudioTokens ?? 0) / 1_000_000) *
      (pricing.audioOutputPerMillion ?? pricing.textOutputPerMillion);

  return Number(cost.toFixed(6));
}

function filterEventsForWindow(
  events: UsageEvent[],
  window: DashboardWindow,
  now: Date,
) {
  const thresholdMs = WINDOW_DURATIONS_MS[window];
  return events.filter((event) => {
    const ageMs = now.getTime() - new Date(event.occurredAt).getTime();
    return ageMs >= 0 && ageMs <= thresholdMs;
  });
}

export function buildDashboardSnapshot(params: {
  events: UsageEvent[];
  keySource: DashboardKeySource;
  liveModel: string;
  evalModel: string;
  window: DashboardWindow;
  now?: Date;
}): DashboardSnapshot {
  const now = params.now ?? new Date();
  const todayEvents = params.events.filter((event) =>
    sameLocalDay(new Date(event.occurredAt), now),
  );
  const periodEvents = filterEventsForWindow(params.events, params.window, now);
  const liveTodayEvents = todayEvents.filter(
    (event) => event.endpoint === "live-token" || event.endpoint === "live-usage",
  );
  const backendTodayEvents = todayEvents.filter(
    (event) => event.endpoint === "evaluate" || event.endpoint === "transcribe-turn",
  );
  const livePeriodEvents = periodEvents.filter(
    (event) => event.endpoint === "live-token" || event.endpoint === "live-usage",
  );
  const backendPeriodEvents = periodEvents.filter(
    (event) => event.endpoint === "evaluate" || event.endpoint === "transcribe-turn",
  );
  const latestEvent = getLatestEvent(params.events);
  const latestSessionId = latestEvent?.sessionId;
  const lastSessionEvents = latestSessionId
    ? params.events.filter((event) => event.sessionId === latestSessionId)
    : [];
  const recentFailureEvents = filterEventsForWindow(params.events, "1h", now).filter(
    (event) => event.outcome === "error",
  );

  let status: DashboardStatus = "ready";
  let statusMessage =
    "Aucun signal critique récent. Le projet semble prêt pour une nouvelle session.";

  if (params.keySource === "missing") {
    status = "blocked";
    statusMessage =
      "Aucune clé disponible. Ajoutez une clé API ou configurez la clé serveur avant de lancer une session.";
  } else if (
    recentFailureEvents.some(
      (event) => event.errorType === "auth" || event.errorType === "billing",
    )
  ) {
    status = "blocked";
    statusMessage =
      "Les derniers appels ont échoué pour une raison d'authentification ou de facturation.";
  } else if (
    recentFailureEvents.some(
      (event) => event.errorType === "rate-limit" || event.errorType === "quota",
    )
  ) {
    status = "risky";
    statusMessage =
      "Le projet a récemment rencontré une limitation de débit ou de quota. Une nouvelle session peut être instable.";
  }

  return {
    status,
    statusMessage,
    keySource: params.keySource,
    liveModel: params.liveModel,
    evalModel: params.evalModel,
    window: params.window,
    windowLabel: WINDOW_LABELS[params.window],
    period: sumEvents(periodEvents),
    today: sumEvents(todayEvents),
    lastSession: sumEvents(lastSessionEvents),
    livePeriod: sumEvents(livePeriodEvents),
    backendPeriod: sumEvents(backendPeriodEvents),
    liveToday: sumEvents(liveTodayEvents),
    backendToday: sumEvents(backendTodayEvents),
    recentFailures: recentFailureEvents.length,
    lastRequest: latestEvent
      ? {
          endpoint: latestEvent.endpoint,
          model: latestEvent.model,
          statusCode: latestEvent.statusCode,
          outcome: latestEvent.outcome,
          errorType: latestEvent.errorType,
          message: latestEvent.message,
          occurredAt: latestEvent.occurredAt,
        }
      : null,
    limitsHint: inferLimitsHint(status, params.keySource),
    updatedAt: now.toISOString(),
  };
}
