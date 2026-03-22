import type { ParsedCase, DemographicField, ProtectedQA, GradingCriterion, StructuredCase } from "../types";
import { detectStationJSON, extractPatientScript, extractGradingGrid } from "./stationJson";

const SECTION_PATTERNS = [
  /(?:^|\n)\s*(?:trame du patient|patient|cas patient)\s*[:\-]?\s*/i,
  /(?:^|\n)\s*(?:grille de correction|grille d['’]evaluation|grille d['’]évaluation|correction|evaluation)\s*[:\-]?\s*/i,
];

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function findLabeledField(block: string, labels: string[]) {
  const escaped = [...labels]
    .sort((left, right) => right.length - left.length)
    .map((label) =>
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:${escaped.join("|")})\\s*[:\\-]?\\s*([^\\n]+)`,
    "i",
  );

  const match = block.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function extractStructuredPatientInfo(script: string) {
  const lastName = findLabeledField(script, ["nom"]);
  const firstName = findLabeledField(script, [
    "prénom",
    "prénoms",
    "prenom",
    "prenoms",
  ]);
  const age = findLabeledField(script, ["âge", "age"]);
  const context = findLabeledField(script, [
    "contexte socioprofessionnel",
    "profession",
    "contexte",
  ]);
  const sex = findLabeledField(script, ["sexe", "genre"]);

  const patientName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const patientAge = age ? (/\bans?\b/i.test(age) ? age : `${age} ans`) : "";
  const patientSummary = context || sex;

  return {
    patientFirstName: firstName,
    patientLastName: lastName,
    patientName,
    patientAge,
    patientSex: sex,
    patientSummary,
  };
}

function extractPatientName(script: string) {
  if (!script.trim()) {
    return {
      patientFirstName: "",
      patientLastName: "",
      patientName: "",
      patientAge: "",
      patientSex: "",
      patientSummary: "",
    };
  }

  const structured = extractStructuredPatientInfo(script);
  if (
    structured.patientName ||
    structured.patientAge ||
    structured.patientSummary
  ) {
    return structured;
  }

  const explicit = script.match(
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*,?\s*(\d{1,3})\s*ans/i,
  );

  if (explicit) {
    return {
      patientFirstName: "",
      patientLastName: "",
      patientName: explicit[1].trim(),
      patientAge: `${explicit[2]} ans`,
      patientSex: "",
      patientSummary: "",
    };
  }

  const line = script
    .split("\n")
    .map((entry) => entry.trim())
    .find(
      (entry) =>
        entry.length > 0 &&
        !/^[A-ZÉÈÀÙÂÊÎÔÛÇ][A-ZÉÈÀÙÂÊÎÔÛÇ\s]+$/.test(entry),
    );

  return {
    patientFirstName: "",
    patientLastName: "",
    patientName: line?.slice(0, 40) || "",
    patientAge: "",
    patientSex: "",
    patientSummary: "",
  };
}

function splitSections(rawInput: string) {
  const normalized = normalizeWhitespace(rawInput);
  const markers = SECTION_PATTERNS.map((pattern) => normalized.search(pattern));

  if (markers.every((index) => index >= 0)) {
    const patientIndex = markers[0];
    const gradingIndex = markers[1];

    if (patientIndex < gradingIndex) {
      const patientMatch = normalized.match(SECTION_PATTERNS[0]);
      const gradingMatch = normalized.match(SECTION_PATTERNS[1]);
      const patientStart = patientIndex + (patientMatch?.[0].length ?? 0);
      const gradingStart = gradingIndex + (gradingMatch?.[0].length ?? 0);

      return {
        patientScript: normalized.slice(patientStart, gradingIndex).trim(),
        gradingGrid: normalized.slice(gradingStart).trim(),
      };
    }
  }

  const separators = [
    /\n-{3,}\n/,
    /\n={3,}\n/,
    /\n\s*GRILLE\s+DE\s+CORRECTION\s*\n/i,
  ];

  for (const separator of separators) {
    const parts = normalized.split(separator);
    if (parts.length >= 2) {
      return {
        patientScript: parts[0].trim(),
        gradingGrid: parts.slice(1).join("\n").trim(),
      };
    }
  }

  return {
    patientScript: normalized,
    gradingGrid: "",
  };
}

export function extractGradingGridOnly(rawInput: string) {
  const station = detectStationJSON(rawInput);
  if (station) return extractGradingGrid(station);

  const normalized = normalizeWhitespace(rawInput);
  const pattern =
    /(?:^|\n)\s*(?:grille de correction|grille d['’]evaluation|grille d['’]évaluation|correction|evaluation)\s*[:\-]?\s*/i;
  const index = normalized.search(pattern);

  if (index < 0) {
    return normalized;
  }

  const match = normalized.match(pattern);
  const start = index + (match?.[0].length ?? 0);
  return normalized.slice(start).trim();
}

export function parseCaseInput(rawInput: string): ParsedCase {
  const station = detectStationJSON(rawInput);
  if (station) {
    // helper: find a row value by label regex in a rows array
    const findRow = (rows: Array<{ label: string; value: string | string[] }>, regex: RegExp): string => {
      const row = rows.find(r => regex.test(r.label));
      if (!row) return '';
      return Array.isArray(row.value) ? row.value.join('; ') : row.value;
    };

    const frameRows =
      station.mode === 'avec-ps' ? station.psPage.patientFrameRows :
      station.mode === 'avec-pss' ? station.pssPage.patientFrameRows : [];

    const lastName = station.mode === 'sans-ps'
      ? station.script.identity.lastName
      : findRow(frameRows, /^nom$/i);

    const firstName = station.mode === 'sans-ps'
      ? station.script.identity.firstName
      : findRow(frameRows, /prénom/i);

    const age = station.mode === 'sans-ps'
      ? `${station.script.identity.ageYears} ans`
      : findRow(frameRows, /âge/i);

    const sex = station.mode === 'sans-ps'
      ? undefined
      : (findRow(frameRows, /sexe/i) || undefined);

    return {
      rawInput,
      patientScript: extractPatientScript(station),
      gradingGrid: extractGradingGrid(station),
      patientName: `${firstName} ${lastName}`.trim() || station.metadata.sddTitle,
      patientAge: age,
      patientSummary: station.studentPage.context.slice(0, 200),
      patientSex: sex,
      patientFirstName: firstName || undefined,
      patientLastName: lastName || undefined,
    };
  }

  const { patientScript, gradingGrid } = splitSections(rawInput);
  const {
    patientFirstName,
    patientLastName,
    patientName,
    patientAge,
    patientSex,
    patientSummary: structuredSummary,
  } = extractPatientName(patientScript);

  const summaryLine =
    patientScript
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 24 &&
          !/^(nom|prénom|prénoms|prenom|prenoms|sexe|âge|age|contexte socioprofessionnel)\b/i.test(
            line,
          ),
      ) || patientScript.slice(0, 140);

  return {
    rawInput,
    patientScript,
    gradingGrid,
    patientFirstName,
    patientLastName,
    patientName,
    patientAge,
    patientSex,
    patientSummary: (structuredSummary || summaryLine).trim(),
  };
}

export function transcriptToPlainText(
  entries: Array<{ role: string; text: string }>,
) {
  return entries.map((entry) => `${entry.role.toUpperCase()}: ${entry.text}`).join("\n");
}

// ── Structured Case Parsing (for Library UI) ──────────────────────────

const DEMOGRAPHIC_LABELS = [
  "NOM",
  "Prénoms",
  "Sexe",
  "Âge",
  "Poids",
  "Taille",
  "Statut marital",
  "Enfants",
  "Contexte socioprofessionnel",
  "Consommation de toxiques",
  "Allergies",
  "Antécédents personnels",
  "Antécédents familiaux",
  "Traitements",
];

function extractDemographicValue(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:^|\\n)${escaped}\\s*\\n[\\t\\s]*\\n+(.+?)(?:\\n|$)`,
    "i",
  );
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function extractDemographics(text: string): DemographicField[] {
  const fields: DemographicField[] = [];
  for (const label of DEMOGRAPHIC_LABELS) {
    const value = extractDemographicValue(text, label);
    if (value) {
      fields.push({ label, value: value === "0" ? "Aucun" : value });
    }
  }
  return fields;
}

function extractContextNote(text: string): string {
  const pattern =
    /Autres\s+[eéè]l[eéè]ments\s+de\s+contexte[^\n]*(?:\n\([^)]*\))?[\s\t]*\n[\t\s]*\n+([\s\S]*?)(?=\nActing\b|\n[EÉ]tat\s+d)/i;
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function extractActingInfo(text: string): { mindset: string; phrase: string } {
  const mindsetPattern =
    /[EÉeé]tat\s+d[''\u2019]esprit\s*\/?\s*comportement[\s\t]*\n[\t\s]*\n+(.+?)(?:\n|$)/i;
  const phrasePattern =
    /Phrase\s+de\s+d[eéè]marrage[\s\t]*\n[\t\s]*\n+([\s\S]*?)(?=\nInformations\s+prot[eéè]g[eéè]es|\n\n[A-ZÉÈÀ][a-zéèàùâ]|$)/i;

  const mindsetMatch = text.match(mindsetPattern);
  const phraseMatch = text.match(phrasePattern);

  return {
    mindset: mindsetMatch?.[1]?.trim() ?? "",
    phrase: phraseMatch?.[1]?.trim() ?? "",
  };
}

function extractProtectedInfo(text: string): ProtectedQA[] {
  const protectedStart = text.search(
    /Informations\s+prot[eéè]g[eéè]es/i,
  );
  if (protectedStart < 0) return [];

  const gridStart = text.search(
    /\n\s*(?:Grille\s+de\s+correction|Grille\s+d['']?[eéè]valuation)/i,
  );
  const protectedSection =
    gridStart > protectedStart
      ? text.slice(protectedStart, gridStart)
      : text.slice(protectedStart);

  const results: ProtectedQA[] = [];
  const lines = protectedSection.split("\n");
  let currentRubrique = "";
  let i = 0;

  while (i < lines.length && i < 10) {
    if (/^(Histoire|Ant[eéè]c[eéè]dents|Traitement|[EÉ]l[eéè]ments|Examen)/i.test(lines[i].trim())) {
      break;
    }
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line || line === "\t") {
      i++;
      continue;
    }

    if (lines[i].startsWith("\t") && /\tVous\s+r[eéè]pondez/i.test(lines[i])) {
      const parts = lines[i].split(/\t+/).filter(Boolean);
      if (parts.length >= 2) {
        results.push({
          rubrique: currentRubrique,
          question: parts[0].trim(),
          answer: parts.slice(1).join(" ").trim(),
        });
      }
      i++;
      continue;
    }

    if (
      line.length < 80 &&
      !/^(Si\s|Vous\s|\d)/i.test(line) &&
      !/^Observ[eéè]/i.test(line) &&
      !/^Crit[eèè]res/i.test(line)
    ) {
      currentRubrique = line;
      i++;
      continue;
    }

    if (/^Si\s/i.test(line)) {
      const question = line;
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && /Vous\s+r[eéè]pondez/i.test(lines[j].trim())) {
        results.push({
          rubrique: currentRubrique,
          question,
          answer: lines[j].trim(),
        });
        i = j + 1;
        continue;
      }
    }

    i++;
  }

  return results;
}

function extractGradingCriteria(text: string): {
  criteria: GradingCriterion[];
  generic: string[];
} {
  const gridStart = text.search(
    /(?:Grille\s+de\s+correction|Grille\s+d['']?[eéè]valuation)/i,
  );
  if (gridStart < 0) return { criteria: [], generic: [] };

  const gridSection = text.slice(gridStart);
  const criteria: GradingCriterion[] = [];
  const generic: string[] = [];

  const genericStart = gridSection.search(
    /Crit[eèé]res\s+d['']?[eéè]valuation\s+g[eéè]n[eéè]riques/i,
  );
  const criteriaText = genericStart >= 0 ? gridSection.slice(0, genericStart) : gridSection;
  const genericText = genericStart >= 0 ? gridSection.slice(genericStart) : "";

  const criterionPattern = /(\d{1,2})\s*[.\t ]+\n*([\s\S]*?)(?=\n\s*\d{1,2}\s*[.\t ]|\n\s*Crit[eèé]res|$)/g;
  let match;
  while ((match = criterionPattern.exec(criteriaText)) !== null) {
    const num = parseInt(match[1], 10);
    const criterionText = match[2]
      .replace(/\s*Observ[eéè]\s*=\s*1\s*/gi, "")
      .replace(/\s*Non[- ]observ[eéè]\s*=\s*0\s*/gi, "")
      .replace(/\s*Crit[eèé]res\s+cibl[eéè]s\s*/gi, "")
      .replace(/\t/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (criterionText && num > 0) {
      criteria.push({ number: num, text: criterionText });
    }
  }

  if (genericText) {
    const genericLines = genericText.split("\n").slice(1);
    for (const line of genericLines) {
      const trimmed = line.replace(/^\s*[-•]\s*/, "").trim();
      if (trimmed && !/^\s*$/.test(trimmed)) {
        generic.push(trimmed);
      }
    }
  }

  return { criteria, generic };
}

export function parseStructuredCase(rawInput: string): StructuredCase {
  const normalized = normalizeWhitespace(rawInput);

  const headerMatch = normalized.match(
    /SDD\s+\d+[^:\n]*(?::\s*(.+?))?$/m,
  );
  const caseId = headerMatch?.[0]?.replace(/:.*$/, "").trim() ?? "";
  const audienceMatch = normalized.match(
    /Pour\s+(le\s+PS|l['']examinateur|l['']étudiant)/i,
  );
  const targetAudience = audienceMatch?.[0]?.trim() ?? "";

  const hasPatientScript =
    /(?:Script\s+patient|Trame\s+du\s+patient|NOM\s*\n)/i.test(normalized);
  const isPS = hasPatientScript;

  if (!isPS) {
    const { criteria, generic } = extractGradingCriteria(normalized);
    return {
      caseId,
      targetAudience,
      demographics: [],
      contextNote: "",
      actingMindset: "",
      startingPhrase: "",
      protectedInfo: [],
      gradingCriteria: criteria,
      genericCriteria: generic,
      isPS: false,
    };
  }

  const demographics = extractDemographics(normalized);
  const contextNote = extractContextNote(normalized);
  const { mindset, phrase } = extractActingInfo(normalized);
  const protectedInfo = extractProtectedInfo(normalized);
  const { criteria, generic } = extractGradingCriteria(normalized);

  return {
    caseId,
    targetAudience,
    demographics,
    contextNote,
    actingMindset: mindset,
    startingPhrase: phrase,
    protectedInfo,
    gradingCriteria: criteria,
    genericCriteria: generic,
    isPS: true,
  };
}
