import type { StationJSON, PSStationJSON, PSSStationJSON, SansPSStationJSON } from '../types';

const VALID_MODES = ['avec-ps', 'avec-pss', 'sans-ps'] as const;

/**
 * Returns parsed StationJSON if rawInput is valid JSON with mode+metadata, else null.
 */
export function detectStationJSON(rawInput: string): StationJSON | null {
  try {
    const parsed: unknown = JSON.parse(rawInput);
    if (!isStationJSON(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Type guard — true if value looks like a StationJSON (has valid mode + metadata).
 */
export function isStationJSON(value: unknown): value is StationJSON {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.mode === 'string' &&
    (VALID_MODES as readonly string[]).includes(obj.mode) &&
    obj.metadata !== null &&
    typeof obj.metadata === 'object'
  );
}

/** Join a row value (string or string[]) into a string. */
function rowValueToString(value: string | string[]): string {
  return Array.isArray(value) ? value.join('; ') : value;
}

/**
 * Assembles patientScript string for AI session from a StationJSON.
 */
export function extractPatientScript(station: StationJSON): string {
  if (station.mode === 'avec-ps') {
    return buildPsScript(station);
  }
  if (station.mode === 'avec-pss') {
    return buildPssScript(station);
  }
  return buildSansPsScript(station);
}

function buildPsScript(station: PSStationJSON): string {
  const lines: string[] = [];

  for (const row of station.psPage.patientFrameRows) {
    lines.push(`${row.label}: ${rowValueToString(row.value)}`);
  }
  for (const row of station.psPage.actingRows) {
    lines.push(`${row.label}: ${rowValueToString(row.value)}`);
  }

  lines.push('');
  lines.push('Informations protégées:');
  for (const row of station.psPage.protectedInfoRows) {
    lines.push(`[${row.rubric}] Q: ${row.question} → R: ${row.answer}`);
  }

  return lines.join('\n');
}

function buildPssScript(station: PSSStationJSON): string {
  const lines: string[] = [];

  for (const row of station.pssPage.patientFrameRows) {
    lines.push(`${row.label}: ${rowValueToString(row.value)}`);
  }
  for (const row of station.pssPage.stationFlowRows) {
    lines.push(`${row.label}: ${rowValueToString(row.value)}`);
  }

  return lines.join('\n');
}

function buildSansPsScript(station: SansPSStationJSON): string {
  const { identity, acting } = station.script;
  const lines = [
    `Nom: ${identity.lastName}`,
    `Prénom: ${identity.firstName}`,
    `Âge: ${identity.ageYears} ans`,
    `Histoire: ${identity.personalHistory}`,
    `Acting: ${acting}`,
  ];
  return lines.join('\n');
}

/**
 * Assembles gradingGrid as "1. label\n2. label..." for evaluator.
 */
export function extractGradingGrid(station: StationJSON): string {
  let elements: Array<{ id: number; label: string }>;

  if (station.mode === 'avec-ps') {
    elements = station.psPage.extraElements;
  } else if (station.mode === 'avec-pss') {
    elements = station.pssPage.extraElements;
  } else {
    elements = station.script.extraElements;
  }

  return elements.map(c => `${c.id}. ${c.label}`).join('\n');
}

/**
 * Reconstructs the "Pour l'examinateur" page text for a SANS PS station,
 * matching what StationDetailSansPS renders in the "examiner" tab.
 */
export function reconstructSansPsExaminerText(station: SansPSStationJSON): string {
  const { metadata, script } = station;
  const stationId = `SDD ${metadata.sddNumber} (${metadata.stationNumber})`;
  const lines: string[] = [];

  lines.push(`${stationId} : Pour l'examinateur`);
  lines.push('');
  lines.push('Grille de correction');
  for (const el of script.extraElements) {
    lines.push(`${el.id}\t${el.label}`);
  }

  if (script.genericCriteria.length > 0) {
    lines.push('');
    lines.push("Critères d'évaluation génériques");
    for (const c of script.genericCriteria) {
      lines.push(`    ${c}`);
    }
  }

  return lines.join('\n');
}

/**
 * Reconstructs the PS / PSS page text from a StationJSON using the actual field titles
 * stored in the JSON (patientFrameTitle, actingTitle, etc.), matching the Hypocampus
 * document format that parseCaseInput() knows how to parse.
 *
 * SANS PS is handled separately via reconstructSansPsExaminerText().
 */
export function reconstructPageText(station: PSStationJSON | PSSStationJSON): string {
  if (station.mode === 'avec-ps') {
    return reconstructPsPageText(station);
  }
  return reconstructPssPageText(station);
}

function reconstructPsPageText(station: PSStationJSON): string {
  const { metadata, psPage } = station;
  const stationId = `SDD ${metadata.sddNumber} (${metadata.stationNumber})`;
  const lines: string[] = [];

  // Header
  lines.push(`${stationId} : ${psPage.patientScriptTitle}`);
  lines.push('');

  // Patient frame (trame du patient)
  lines.push(psPage.patientFrameTitle);
  for (const row of psPage.patientFrameRows) {
    lines.push(`${row.label} : ${rowValueToString(row.value)}`);
  }
  lines.push('');

  // Acting
  lines.push(psPage.actingTitle);
  for (const row of psPage.actingRows) {
    lines.push(`${row.label} : ${rowValueToString(row.value)}`);
  }
  lines.push('');

  // Protected info
  if (psPage.protectedInfoRows.length > 0) {
    lines.push(psPage.protectedInfoTitle);
    let lastRubric = '';
    for (const row of psPage.protectedInfoRows) {
      const rubricPrefix = row.rubric && row.rubric !== lastRubric ? `${row.rubric} - ` : '';
      if (row.rubric) lastRubric = row.rubric;
      lines.push(`${rubricPrefix}${row.question} → ${row.answer}`);
    }
    lines.push('');
  }

  // Grading grid
  lines.push(psPage.correctionGridTitle);
  for (const el of psPage.extraElements) {
    lines.push(`${el.id}. ${el.label}`);
  }

  // Generic criteria
  if (psPage.genericCriteria.length > 0) {
    lines.push('');
    lines.push(psPage.genericCriteriaTitle);
    for (const c of psPage.genericCriteria) {
      lines.push(`    ${c}`);
    }
  }

  return lines.join('\n');
}

function reconstructPssPageText(station: PSSStationJSON): string {
  const { metadata, pssPage } = station;
  const stationId = `SDD ${metadata.sddNumber} (${metadata.stationNumber})`;
  const lines: string[] = [];

  // Header
  lines.push(`${stationId} : ${pssPage.scriptTitle}`);
  lines.push('');

  // Patient frame
  lines.push(pssPage.patientFrameTitle);
  for (const row of pssPage.patientFrameRows) {
    lines.push(`${row.label} : ${rowValueToString(row.value)}`);
  }
  lines.push('');

  // Station flow
  lines.push(pssPage.stationFlowTitle);
  for (const row of pssPage.stationFlowRows) {
    lines.push(`${row.label} : ${rowValueToString(row.value)}`);
  }
  lines.push('');

  // Grading grid
  lines.push(pssPage.correctionGridTitle);
  for (const el of pssPage.extraElements) {
    lines.push(`${el.id}. ${el.label}`);
  }

  // Generic criteria
  if (pssPage.genericCriteria.length > 0) {
    lines.push('');
    lines.push(pssPage.genericCriteriaTitle);
    for (const c of pssPage.genericCriteria) {
      lines.push(`    ${c}`);
    }
  }

  return lines.join('\n');
}
