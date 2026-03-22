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
