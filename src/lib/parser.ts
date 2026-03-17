import type { ParsedCase } from "../types";

const SECTION_PATTERNS = [
  /(?:^|\n)\s*(?:trame du patient|patient|cas patient)\s*[:\-]?\s*/i,
  /(?:^|\n)\s*(?:grille de correction|grille d['’]evaluation|grille d['’]évaluation|correction|evaluation)\s*[:\-]?\s*/i,
];

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function findLabeledField(block: string, labels: string[]) {
  const escaped = labels.map((label) =>
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

export function parseCaseInput(rawInput: string): ParsedCase {
  const { patientScript, gradingGrid } = splitSections(rawInput);
  const {
    patientFirstName,
    patientLastName,
    patientName,
    patientAge,
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
    patientSummary: (structuredSummary || summaryLine).trim(),
  };
}

export function transcriptToPlainText(
  entries: Array<{ role: string; text: string }>,
) {
  return entries.map((entry) => `${entry.role.toUpperCase()}: ${entry.text}`).join("\n");
}