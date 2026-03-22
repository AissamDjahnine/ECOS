import { describe, expect, it } from "vitest";
import {
  detectStationJSON,
  isStationJSON,
  extractGradingGrid,
  extractPatientScript,
} from "./stationJson";
import { parseCaseInput, extractGradingGridOnly } from "./parser";
import type { PSStationJSON, SansPSStationJSON, PSSStationJSON } from "../types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PS_STATION: PSStationJSON = {
  mode: "avec-ps",
  metadata: {
    specialty: "Cardiologie",
    sddNumber: "SDD-001",
    sddTitle: "Douleur thoracique",
    stationNumber: 1,
    title: "Station cardiologie 1",
    level: "L3",
    difficulty: "moyen",
    mainDomain: "Cardiologie",
    knowledgeObjectives: ["ECG", "anamnèse"],
    stationMetadataRows: [],
  },
  studentPage: {
    context: "Vous êtes interne en cardiologie. Vous devez examiner ce patient.",
    tasksDo: ["Interroger le patient"],
    tasksDont: ["Ne pas examiner"],
    explicitModeSentence: "Avec patient standardisé",
  },
  psPage: {
    patientScriptTitle: "Trame du patient",
    patientFrameTitle: "Cadre du patient",
    patientFrameRows: [
      { label: "Nom", value: "Martin" },
      { label: "Prénom", value: "Jean" },
      { label: "Âge", value: "55 ans" },
      { label: "Sexe", value: "Masculin" },
    ],
    actingTitle: "Playing",
    actingRows: [
      { label: "Comportement", value: "Anxieux" },
      { label: "Antécédents", value: ["HTA", "Diabète"] },
    ],
    protectedInfoTitle: "Informations protégées",
    protectedInfoHeaders: ["Rubrique", "Question", "Réponse"],
    protectedInfoRows: [
      { rubric: "Douleur", question: "Depuis quand ?", answer: "3 heures" },
      { rubric: "Traitement", question: "Médicaments ?", answer: "Aspirine" },
    ],
    correctionGridTitle: "Grille de correction",
    extraElements: [
      { id: 1, label: "criterion one" },
      { id: 2, label: "criterion two" },
    ],
    genericCriteriaTitle: "Critères génériques",
    genericCriteria: ["Présentation correcte"],
  },
  correctionPage: {
    generalCommentTitle: "Commentaire général",
    generalComment: "Bon travail",
    criteriaTitle: "Critères",
    criteria: [],
    keyPointsTitle: "Points clés",
    keyPoints: [],
    exampleDialogueTitle: "Dialogue exemple",
    exampleDialogue: "",
  },
};

const SANS_PS_STATION: SansPSStationJSON = {
  mode: "sans-ps",
  metadata: {
    specialty: "Neurologie",
    sddNumber: "SDD-002",
    sddTitle: "Céphalées",
    stationNumber: 2,
    title: "Station neurologie 2",
    level: "L3",
    difficulty: "facile",
    mainDomain: "Neurologie",
    knowledgeObjectives: ["Sémiologie"],
    stationMetadataRows: [],
  },
  studentPage: {
    context: "Vous devez présenter un dossier clinique sur les céphalées.",
    tasksDo: ["Présenter l'histoire"],
    tasksDont: [],
    explicitModeSentence: "Sans patient standardisé",
  },
  script: {
    identity: {
      lastName: "Dupont",
      firstName: "Marie",
      personalHistory: "Pas d'antécédents",
      ageYears: 32,
    },
    acting: "Calme",
    extraElements: [
      { id: 1, label: "criterion one" },
      { id: 2, label: "criterion two" },
    ],
    genericCriteria: [],
  },
  criteria: [],
  teaching: {
    generalComment: "Bien",
    keyPoints: [],
    exampleDialogue: "",
  },
};

const PSS_STATION: PSSStationJSON = {
  mode: "avec-pss",
  metadata: {
    specialty: "Rhumatologie",
    sddNumber: "SDD-003",
    sddTitle: "Arthrite",
    stationNumber: 3,
    title: "Station rhumatologie 3",
    level: "L3",
    difficulty: "difficile",
    mainDomain: "Rhumatologie",
    knowledgeObjectives: [],
    stationMetadataRows: [],
  },
  studentPage: {
    context: "Vous examinez un patient avec arthrite.",
    tasksDo: [],
    tasksDont: [],
    explicitModeSentence: "Avec patient semi-standardisé",
  },
  pssPage: {
    scriptTitle: "Script",
    patientFrameTitle: "Cadre",
    patientFrameRows: [
      { label: "Nom", value: "Leroy" },
      { label: "Prénom", value: "Paul" },
      { label: "Âge", value: "44 ans" },
    ],
    stationFlowTitle: "Déroulement",
    stationFlowRows: [
      { label: "Phase 1", value: "Accueil" },
    ],
    correctionGridTitle: "Grille",
    extraElements: [
      { id: 1, label: "PSS criterion A" },
      { id: 2, label: "PSS criterion B" },
    ],
    genericCriteriaTitle: "Génériques",
    genericCriteria: [],
  },
  correctionPage: {
    generalCommentTitle: "Commentaire",
    generalComment: "OK",
    criteriaTitle: "Critères",
    criteria: [],
    keyPointsTitle: "Points clés",
    keyPoints: [],
    exampleDialogueTitle: "Dialogue",
    exampleDialogue: "",
  },
};

// ── detectStationJSON ─────────────────────────────────────────────────────────

describe("detectStationJSON", () => {
  it("returns parsed object for valid PS JSON", () => {
    const result = detectStationJSON(JSON.stringify(PS_STATION));
    expect(result).not.toBeNull();
    expect(result?.mode).toBe("avec-ps");
  });

  it("returns parsed object for valid SANS-PS JSON", () => {
    const result = detectStationJSON(JSON.stringify(SANS_PS_STATION));
    expect(result).not.toBeNull();
    expect(result?.mode).toBe("sans-ps");
  });

  it("returns null for free-text (Hypocampus format)", () => {
    const freeText = `Trame du patient:\nNom: Dupont\nÂge: 45 ans\n\nGrille de correction:\n1. Critère A`;
    expect(detectStationJSON(freeText)).toBeNull();
  });

  it("returns null for invalid JSON string", () => {
    expect(detectStationJSON("{ not valid json }")).toBeNull();
  });

  it("returns null for JSON without mode field", () => {
    const noMode = JSON.stringify({ metadata: { sddTitle: "test" }, data: {} });
    expect(detectStationJSON(noMode)).toBeNull();
  });

  it("returns null for JSON with unrecognized mode", () => {
    const badMode = JSON.stringify({ mode: "unknown", metadata: {} });
    expect(detectStationJSON(badMode)).toBeNull();
  });
});

// ── isStationJSON ─────────────────────────────────────────────────────────────

describe("isStationJSON", () => {
  it("returns true for a valid PSStationJSON object", () => {
    expect(isStationJSON(PS_STATION)).toBe(true);
  });

  it("returns true for a valid SansPSStationJSON object", () => {
    expect(isStationJSON(SANS_PS_STATION)).toBe(true);
  });

  it("returns false for an arbitrary object", () => {
    expect(isStationJSON({ foo: "bar" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isStationJSON(null)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isStationJSON("avec-ps")).toBe(false);
  });
});

// ── extractGradingGrid ────────────────────────────────────────────────────────

describe("extractGradingGrid", () => {
  it("produces exact numbered format for PS station", () => {
    const grid = extractGradingGrid(PS_STATION);
    expect(grid).toBe("1. criterion one\n2. criterion two");
  });

  it("produces exact numbered format for SANS PS station", () => {
    const grid = extractGradingGrid(SANS_PS_STATION);
    expect(grid).toBe("1. criterion one\n2. criterion two");
  });

  it("produces exact numbered format for PSS station", () => {
    const grid = extractGradingGrid(PSS_STATION);
    expect(grid).toBe("1. PSS criterion A\n2. PSS criterion B");
  });
});

// ── extractPatientScript ──────────────────────────────────────────────────────

describe("extractPatientScript", () => {
  it("includes patient frame rows for PS mode", () => {
    const script = extractPatientScript(PS_STATION);
    expect(script).toContain("Nom: Martin");
    expect(script).toContain("Prénom: Jean");
  });

  it("includes acting rows for PS mode", () => {
    const script = extractPatientScript(PS_STATION);
    expect(script).toContain("Comportement: Anxieux");
  });

  it("joins array values with semicolons for PS mode", () => {
    const script = extractPatientScript(PS_STATION);
    expect(script).toContain("Antécédents: HTA; Diabète");
  });

  it("includes protected info section for PS mode", () => {
    const script = extractPatientScript(PS_STATION);
    expect(script).toContain("Informations protégées:");
    expect(script).toContain("[Douleur] Q: Depuis quand ? → R: 3 heures");
  });

  it("includes identity for SANS PS mode", () => {
    const script = extractPatientScript(SANS_PS_STATION);
    expect(script).toContain("Nom: Dupont");
    expect(script).toContain("Prénom: Marie");
    expect(script).toContain("Âge: 32 ans");
  });

  it("includes patient frame rows for PSS mode", () => {
    const script = extractPatientScript(PSS_STATION);
    expect(script).toContain("Nom: Leroy");
  });
});

// ── parseCaseInput with JSON input ────────────────────────────────────────────

describe("parseCaseInput with JSON input", () => {
  it("extracts patientName containing patient name for PS station", () => {
    const result = parseCaseInput(JSON.stringify(PS_STATION));
    expect(result.patientName).toContain("Jean");
    expect(result.patientName).toContain("Martin");
  });

  it("produces correct gradingGrid for PS station", () => {
    const result = parseCaseInput(JSON.stringify(PS_STATION));
    expect(result.gradingGrid).toBe("1. criterion one\n2. criterion two");
  });

  it("extracts correct patientAge for PS station", () => {
    const result = parseCaseInput(JSON.stringify(PS_STATION));
    expect(result.patientAge).toBe("55 ans");
  });

  it("extracts correct patientSex for PS station", () => {
    const result = parseCaseInput(JSON.stringify(PS_STATION));
    expect(result.patientSex).toBe("Masculin");
  });

  it("extracts patientName for SANS PS station", () => {
    const result = parseCaseInput(JSON.stringify(SANS_PS_STATION));
    expect(result.patientName).toContain("Marie");
    expect(result.patientName).toContain("Dupont");
  });

  it("extracts patientAge for SANS PS station", () => {
    const result = parseCaseInput(JSON.stringify(SANS_PS_STATION));
    expect(result.patientAge).toBe("32 ans");
  });

  it("gradingGrid equals numbered format for SANS PS station", () => {
    const result = parseCaseInput(JSON.stringify(SANS_PS_STATION));
    expect(result.gradingGrid).toBe("1. criterion one\n2. criterion two");
  });

  it("patientScript contains patient name for PS station", () => {
    const result = parseCaseInput(JSON.stringify(PS_STATION));
    expect(result.patientScript).toContain("Martin");
  });
});

// ── extractGradingGridOnly with JSON input ────────────────────────────────────

describe("extractGradingGridOnly with JSON input", () => {
  it("returns numbered grid for PS JSON", () => {
    const grid = extractGradingGridOnly(JSON.stringify(PS_STATION));
    expect(grid).toBe("1. criterion one\n2. criterion two");
  });

  it("returns numbered grid for SANS PS JSON", () => {
    const grid = extractGradingGridOnly(JSON.stringify(SANS_PS_STATION));
    expect(grid).toBe("1. criterion one\n2. criterion two");
  });

  it("does not throw for free-text input", () => {
    const freeText = "Trame du patient:\nNom: Test\n\nGrille de correction:\n1. A";
    expect(() => extractGradingGridOnly(freeText)).not.toThrow();
  });
});
