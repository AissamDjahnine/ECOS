import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { insertCase, listCases, closeDb, type CaseDifficulty, type CaseMode } from "./db";
import { detectStationJSON } from "../src/lib/stationJson";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(__dirname, "data", "cases");

function parseFrontMatter(content: string) {
  const parts = content.split(/^---$/m, 2);
  if (parts.length < 2) {
    throw new Error("Missing --- delimiter between front matter and body");
  }

  const header: Record<string, string> = {};
  for (const line of parts[0].split("\n")) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      header[match[1]] = match[2].trim();
    }
  }

  const body = content.slice(content.indexOf("---") + 3).trim();
  return { header, body };
}

function seed() {
  if (!fs.existsSync(CASES_DIR)) {
    console.log(`No cases directory found at ${CASES_DIR}. Nothing to seed.`);
    return;
  }

  const files = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith(".txt"));
  if (files.length === 0) {
    console.log("No .txt case files found. Nothing to seed.");
    return;
  }

  const existing = listCases({ limit: 1000 });
  const existingTitles = new Set(existing.map((c) => c.title));

  let inserted = 0;
  let skipped = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(CASES_DIR, file), "utf-8");
    const { header, body } = parseFrontMatter(content);

    if (!header.title) {
      console.warn(`  Skipping ${file}: missing title in front matter`);
      skipped++;
      continue;
    }

    if (existingTitles.has(header.title)) {
      console.log(`  Skipping "${header.title}" (already exists)`);
      skipped++;
      continue;
    }

    const tags = header.tags
      ? header.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    insertCase({
      title: header.title,
      rawInput: body,
      specialty: header.specialty ?? "",
      difficulty: (header.difficulty as CaseDifficulty) ?? "moyen",
      mode: (header.mode as CaseMode) ?? "both",
      tags,
    });

    console.log(`  Inserted "${header.title}"`);
    inserted++;
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped.`);
  closeDb();
}

export function seedFromJsonDir(jsonDir: string) {
  if (!fs.existsSync(jsonDir)) {
    console.log(`No JSON dir found at ${jsonDir}. Nothing to seed.`);
    return;
  }

  const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('No .json files found. Nothing to seed.');
    return;
  }

  const existing = listCases({ limit: 10000 });
  const existingTitles = new Set(existing.map(c => c.title));

  let inserted = 0;
  let skipped = 0;

  for (const file of files) {
    const rawInput = fs.readFileSync(path.join(jsonDir, file), 'utf-8');
    // detectStationJSON is from src/lib/stationJson — compiled via tsx
    const station = detectStationJSON(rawInput);
    if (!station) {
      console.warn(`  Skipping ${file}: not a valid StationJSON`);
      continue;
    }

    const title = `SDD ${station.metadata.sddNumber} (${station.metadata.stationNumber}) — ${station.metadata.sddTitle}`;

    if (existingTitles.has(title)) {
      console.log(`  Skipping (exists): ${title}`);
      skipped++;
      continue;
    }

    const modeMap: Record<string, CaseMode> = {
      'avec-ps':  'ps',
      'avec-pss': 'ps',
      'sans-ps':  'sans-ps',
    };

    const diffMap: Record<string, CaseDifficulty> = {
      facile:        'facile',
      intermédiaire: 'moyen',
      difficile:     'difficile',
    };

    insertCase({
      title,
      rawInput,
      specialty: station.metadata.specialty,
      difficulty: diffMap[station.metadata.difficulty] ?? 'moyen',
      mode: modeMap[station.mode] ?? 'both',
      tags: [station.metadata.level, station.metadata.mainDomain].filter(Boolean),
    });

    console.log(`  Inserted: ${title}`);
    inserted++;
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped.`);
  closeDb();
}

const args = process.argv.slice(2);
if (args[0] === '--json') {
  const jsonDir = args[1]
    ? path.resolve(args[1])
    : path.join(__dirname, '../generated-ecos-2026');
  seedFromJsonDir(jsonDir);
} else {
  seed();
}
