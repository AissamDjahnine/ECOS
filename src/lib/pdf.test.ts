import { describe, expect, it } from "vitest";
import { buildPsPdfDocument, buildSansPsPdfDocument } from "./pdf";
import type { EvaluationResult, ParsedCase, TranscriptEntry } from "../types";

const sampleTranscript: TranscriptEntry[] = [
  {
    id: "1",
    role: "student",
    text: "Je vérifie le temps passé au sol.",
    timestamp: "10:00:00",
  },
  {
    id: "2",
    role: "patient",
    text: "Elle a chuté vers 1h.",
    timestamp: "10:00:05",
  },
];

const sampleEvaluation: EvaluationResult = {
  score: "12/15",
  details: [
    {
      criterion: "Recherche le temps passé au sol",
      observed: true,
      feedback: "L'étudiant a posé la question explicitement.",
    },
  ],
};

const sampleCase: ParsedCase = {
  rawInput: "Patient\nNom: Doe\n\nGrille de correction\n1 Critère",
  patientScript: "Bonjour docteur",
  gradingGrid: "1 Critère",
  patientName: "Jane Doe",
  patientAge: "81",
  patientSummary: "Résumé",
};

describe("pdf export builders", () => {
  it("includes evaluation level and formatted evaluation table in the PS export", () => {
    const html = buildPsPdfDocument(
      sampleCase,
      sampleTranscript,
      sampleEvaluation,
      "detailed",
    );

    expect(html).toContain("Niveau d'évaluation");
    expect(html).toContain("Detailed");
    expect(html).toContain("Compte rendu PS / PSS");
    expect(html).toContain("ECOS-AI - PS-PSS - Compte rendu");
    expect(html).toContain("PS / PSS");
    expect(html).toContain("result-pill observed");
    expect(html).toContain("Justification");
    expect(html).toContain("source-section");
  });

  it("formats the Sans PS export with source, transcript, and score summary", () => {
    const html = buildSansPsPdfDocument(
      "Station\n\nGrille de correction",
      sampleTranscript,
      sampleEvaluation,
      "standard",
    );

    expect(html).toContain("Compte rendu Sans PS");
    expect(html).toContain("ECOS-AI - Sans-PS - Compte rendu");
    expect(html).toContain("Sans PS");
    expect(html).toContain("Monologue évalué à partir de la grille collée");
    expect(html).toContain("12/15");
    expect(html).toContain("Student");
    expect(html).toContain("Observé");
  });
});
