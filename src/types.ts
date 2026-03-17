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