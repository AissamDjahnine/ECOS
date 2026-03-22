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
  commentary: string;
  details: EvaluationCriterion[];
};

export type RouteMode = "ps" | "sans-ps" | "library";

export type FeedbackDetailLevel = "brief" | "standard" | "detailed";

export type AudioPlaybackRate = 0.75 | 1 | 1.25 | 1.5 | 2;

export type AppSettings = {
  darkMode: boolean;
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

export type AppToastTone = "success" | "error" | "info";

export type AppToast = {
  id: string;
  title: string;
  body?: string;
  tone: AppToastTone;
};

// ── Structured station JSON (generated-ecos-2026 format) ─────────────

export type StationMetadataRow = { label: string; value: string | string[] };

export type StationCriterion = { id: number; label: string; rationale: string };

export type StationKeyPoint = {
  label: string;
  text?: string;
  subPoints?: Array<{ label: string; text: string }>;
};

type StationCorrectionPage = {
  generalCommentTitle: string;
  generalComment: string;
  criteriaTitle: string;
  criteria: StationCriterion[];
  keyPointsTitle: string;
  keyPoints: StationKeyPoint[];
  exampleDialogueTitle: string;
  exampleDialogue: string;
};

type StationMetadata = {
  specialty: string;
  sddNumber: string;
  sddTitle: string;
  stationNumber: number;
  title: string;
  level: string;
  difficulty: string;
  mainDomain: string;
  knowledgeObjectives: string[];
  stationMetadataRows: StationMetadataRow[];
};

type StationStudentPage = {
  context: string;
  tasksDo: string[];
  tasksDont: string[];
  explicitModeSentence: string;
  extraClinicalElements?: Array<
    | { type: 'image-placeholder'; title: string; content: string }
    | { type: 'bullet-section'; title: string; items: string[] }
    | { type: 'report'; title: string; content: string }
    | { type: 'table'; title: string; headers: string[]; rows: string[][] }
  >;
};

export type PSStationJSON = {
  mode: 'avec-ps';
  metadata: StationMetadata;
  studentPage: StationStudentPage;
  psPage: {
    patientScriptTitle: string;
    patientFrameTitle: string;
    patientFrameRows: StationMetadataRow[];
    actingTitle: string;
    actingRows: StationMetadataRow[];
    protectedInfoTitle: string;
    protectedInfoHeaders: string[];
    protectedInfoRows: Array<{ rubric: string; question: string; answer: string }>;
    correctionGridTitle: string;
    extraElements: Array<{ id: number; label: string }>;
    genericCriteriaTitle: string;
    genericCriteria: string[];
  };
  correctionPage: StationCorrectionPage;
};

export type PSSStationJSON = {
  mode: 'avec-pss';
  metadata: StationMetadata;
  studentPage: StationStudentPage;
  pssPage: {
    scriptTitle: string;
    patientFrameTitle: string;
    patientFrameRows: StationMetadataRow[];
    stationFlowTitle: string;
    stationFlowRows: StationMetadataRow[];
    correctionGridTitle: string;
    extraElements: Array<{ id: number; label: string }>;
    genericCriteriaTitle: string;
    genericCriteria: string[];
  };
  correctionPage: StationCorrectionPage;
};

export type SansPSStationJSON = {
  mode: 'sans-ps';
  metadata: StationMetadata;
  studentPage: StationStudentPage;
  script: {
    identity: { lastName: string; firstName: string; personalHistory: string; ageYears: number };
    acting: string;
    extraElements: Array<{ id: number; label: string }>;
    genericCriteria: string[];
  };
  criteria: StationCriterion[];
  teaching: {
    generalComment: string;
    keyPoints: StationKeyPoint[];
    exampleDialogue: string;
  };
};

export type StationJSON = PSStationJSON | PSSStationJSON | SansPSStationJSON;

// ── Case Library types ────────────────────────────────────────────────

export type CaseDifficulty = "facile" | "moyen" | "difficile";
export type CaseMode = "ps" | "sans-ps" | "both";

export type LibraryCase = {
  id: string;
  title: string;
  specialty: string;
  difficulty: CaseDifficulty;
  mode: CaseMode;
  tags: string[];
  rawInput: string;
  createdAt: string;
  updatedAt: string;
};

export type LibraryCaseSummary = Omit<LibraryCase, "rawInput">;

export type DemographicField = {
  label: string;
  value: string;
};

export type ProtectedQA = {
  rubrique: string;
  question: string;
  answer: string;
};

export type GradingCriterion = {
  number: number;
  text: string;
};

export type StructuredCase = {
  caseId: string;
  targetAudience: string;
  demographics: DemographicField[];
  contextNote: string;
  actingMindset: string;
  startingPhrase: string;
  protectedInfo: ProtectedQA[];
  gradingCriteria: GradingCriterion[];
  genericCriteria: string[];
  isPS: boolean;
};
