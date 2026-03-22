import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data", "ecos-cases.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS cases (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        specialty   TEXT NOT NULL DEFAULT '',
        difficulty  TEXT NOT NULL DEFAULT 'moyen',
        mode        TEXT NOT NULL DEFAULT 'both',
        tags        TEXT NOT NULL DEFAULT '[]',
        raw_input   TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cases_specialty ON cases(specialty);
      CREATE INDEX IF NOT EXISTS idx_cases_difficulty ON cases(difficulty);
      CREATE INDEX IF NOT EXISTS idx_cases_mode ON cases(mode);
    `);
  }
  return db;
}

// ── Types ──────────────────────────────────────────────────────────────

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

export type CaseFilters = {
  q?: string;
  specialty?: string;
  difficulty?: CaseDifficulty;
  mode?: CaseMode;
  limit?: number;
  offset?: number;
};

export type InsertCaseInput = {
  title: string;
  rawInput: string;
  specialty?: string;
  difficulty?: CaseDifficulty;
  mode?: CaseMode;
  tags?: string[];
};

export type UpdateCaseInput = Partial<InsertCaseInput>;

// ── Row mapping ────────────────────────────────────────────────────────

type CaseRow = {
  id: string;
  title: string;
  specialty: string;
  difficulty: string;
  mode: string;
  tags: string;
  raw_input: string;
  created_at: string;
  updated_at: string;
};

function rowToCase(row: CaseRow): LibraryCase {
  return {
    id: row.id,
    title: row.title,
    specialty: row.specialty,
    difficulty: row.difficulty as CaseDifficulty,
    mode: row.mode as CaseMode,
    tags: JSON.parse(row.tags) as string[],
    rawInput: row.raw_input,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSummary(row: CaseRow): LibraryCaseSummary {
  return {
    id: row.id,
    title: row.title,
    specialty: row.specialty,
    difficulty: row.difficulty as CaseDifficulty,
    mode: row.mode as CaseMode,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── CRUD ───────────────────────────────────────────────────────────────

export function listCases(filters: CaseFilters = {}): LibraryCaseSummary[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.q) {
    conditions.push("(title LIKE ? OR raw_input LIKE ?)");
    const q = `%${filters.q}%`;
    params.push(q, q);
  }
  if (filters.specialty) {
    conditions.push("specialty = ?");
    params.push(filters.specialty);
  }
  if (filters.difficulty) {
    conditions.push("difficulty = ?");
    params.push(filters.difficulty);
  }
  if (filters.mode) {
    conditions.push("(mode = ? OR mode = 'both')");
    params.push(filters.mode);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const rows = getDb()
    .prepare(
      `SELECT id, title, specialty, difficulty, mode, tags, raw_input, created_at, updated_at
       FROM cases ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as CaseRow[];

  return rows.map(rowToSummary);
}

export function getCaseById(id: string): LibraryCase | null {
  const row = getDb()
    .prepare("SELECT * FROM cases WHERE id = ?")
    .get(id) as CaseRow | undefined;

  return row ? rowToCase(row) : null;
}

export function insertCase(input: InsertCaseInput): LibraryCase {
  const id = randomUUID();
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO cases (id, title, specialty, difficulty, mode, tags, raw_input, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.title,
      input.specialty ?? "",
      input.difficulty ?? "moyen",
      input.mode ?? "both",
      JSON.stringify(input.tags ?? []),
      input.rawInput,
      now,
      now,
    );

  return getCaseById(id)!;
}

export function updateCase(id: string, input: UpdateCaseInput): LibraryCase | null {
  const existing = getCaseById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const params: unknown[] = [];

  if (input.title !== undefined) { fields.push("title = ?"); params.push(input.title); }
  if (input.specialty !== undefined) { fields.push("specialty = ?"); params.push(input.specialty); }
  if (input.difficulty !== undefined) { fields.push("difficulty = ?"); params.push(input.difficulty); }
  if (input.mode !== undefined) { fields.push("mode = ?"); params.push(input.mode); }
  if (input.tags !== undefined) { fields.push("tags = ?"); params.push(JSON.stringify(input.tags)); }
  if (input.rawInput !== undefined) { fields.push("raw_input = ?"); params.push(input.rawInput); }

  if (fields.length === 0) return existing;

  fields.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  getDb()
    .prepare(`UPDATE cases SET ${fields.join(", ")} WHERE id = ?`)
    .run(...params);

  return getCaseById(id);
}

export function deleteCase(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM cases WHERE id = ?")
    .run(id);

  return result.changes > 0;
}

export function getSpecialties(): string[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT specialty FROM cases WHERE specialty != '' ORDER BY specialty")
    .all() as { specialty: string }[];

  return rows.map((r) => r.specialty);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
