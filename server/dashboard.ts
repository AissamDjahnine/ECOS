import type {
  DashboardKeySource,
  DashboardSnapshot,
  DashboardStatus,
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

function sameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function zeroStats() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
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

export function buildDashboardSnapshot(params: {
  events: UsageEvent[];
  keySource: DashboardKeySource;
  liveModel: string;
  evalModel: string;
  now?: Date;
}): DashboardSnapshot {
  const now = params.now ?? new Date();
  const todayEvents = params.events.filter((event) =>
    sameLocalDay(new Date(event.occurredAt), now),
  );
  const liveTodayEvents = todayEvents.filter(
    (event) => event.endpoint === "live-token" || event.endpoint === "live-usage",
  );
  const backendTodayEvents = todayEvents.filter(
    (event) => event.endpoint === "evaluate" || event.endpoint === "transcribe-turn",
  );
  const latestEvent = getLatestEvent(params.events);
  const latestSessionId = latestEvent?.sessionId;
  const lastSessionEvents = latestSessionId
    ? params.events.filter((event) => event.sessionId === latestSessionId)
    : [];
  const recentFailureEvents = params.events.filter((event) => {
    const ageMs = now.getTime() - new Date(event.occurredAt).getTime();
    return event.outcome === "error" && ageMs <= 10 * 60 * 1000;
  });

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
    today: sumEvents(todayEvents),
    lastSession: sumEvents(lastSessionEvents),
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
