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
};
