export type TranscriptRole = "student" | "patient" | "system";

export type TranscriptEntry = {
  id: string;
  role: TranscriptRole;
  text: string;
  timestamp: string;
};

export type ParsedCase = {
  rawInput: string;
  patientScript: string;
  gradingGrid: string;
  patientName: string;
  patientAge: string;
  patientSummary: string;
  patientSex?: string;
  patientFirstName?: string;
  patientLastName?: string;
};

export type EvaluationCriterion = {
  criterion: string;
  observed: boolean;
  feedback: string;
};

export type EvaluationResult = {
  score: string;
  details: EvaluationCriterion[];
};

export type RouteMode = "ps" | "sans-ps";

export type FeedbackDetailLevel = "brief" | "standard" | "detailed";

export type AudioPlaybackRate = 0.75 | 1 | 1.25 | 1.5 | 2;

export type AppSettings = {
  defaultTimerSeconds: number;
  autoEvaluateAfterEnd: boolean;
  recordedAudioPlaybackRate: AudioPlaybackRate;
  showLiveTranscript: boolean;
  showSystemMessages: boolean;
  autoExportPdfAfterEvaluation: boolean;
  feedbackDetailLevel: FeedbackDetailLevel;
  googleApiKey: string;
};

export type DashboardStatus = "ready" | "risky" | "blocked";

export type DashboardKeySource = "custom" | "server" | "missing";

export type DashboardUsageStats = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type DashboardWindow = "1h" | "1d" | "7d" | "30d";

export type DashboardRequestSummary = {
  endpoint: string;
  model: string;
  statusCode: number;
  outcome: "success" | "error";
  errorType?: "rate-limit" | "auth" | "billing" | "quota" | "unknown";
  message?: string;
  occurredAt: string;
};

export type DashboardSnapshot = {
  status: DashboardStatus;
  statusMessage: string;
  keySource: DashboardKeySource;
  liveModel: string;
  evalModel: string;
  window: DashboardWindow;
  windowLabel: string;
  period: DashboardUsageStats;
  today: DashboardUsageStats;
  lastSession: DashboardUsageStats;
  livePeriod: DashboardUsageStats;
  backendPeriod: DashboardUsageStats;
  liveToday: DashboardUsageStats;
  backendToday: DashboardUsageStats;
  recentFailures: number;
  lastRequest: DashboardRequestSummary | null;
  limitsHint: string;
  updatedAt: string;
};
