import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseStructuredCase } from "./lib/parser";
import { detectStationJSON } from './lib/stationJson';
import type {
  AppSettings,
  AppToastTone,
  CaseDifficulty,
  CaseMode,
  LibraryCase,
  LibraryCaseSummary,
  RouteMode,
  StructuredCase,
  StationJSON,
} from "./types";
import { StationDetailPS } from './StationDetailPS';
import { StationDetailPSS } from './StationDetailPSS';
import { StationDetailSansPS } from './StationDetailSansPS';

// ── Icons ──────────────────────────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" strokeLinecap="round" />
    </svg>
  );
}

function BookOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-3.64-6.36-1.42 1.42M6.34 17.66l-1.42 1.42m0-14.14 1.42 1.42m11.32 11.32 1.42 1.42" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

const DIFFICULTY_LABELS: Record<CaseDifficulty, string> = {
  facile: "Facile",
  moyen: "Moyen",
  difficile: "Difficile",
};

const DIFFICULTY_COLORS: Record<CaseDifficulty, { light: string; dark: string }> = {
  facile: {
    light: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dark: "bg-emerald-900/30 text-emerald-300 border-emerald-700/40",
  },
  moyen: {
    light: "bg-amber-50 text-amber-700 border-amber-200",
    dark: "bg-amber-900/30 text-amber-300 border-amber-700/40",
  },
  difficile: {
    light: "bg-rose-50 text-rose-700 border-rose-200",
    dark: "bg-rose-900/30 text-rose-300 border-rose-700/40",
  },
};

const MODE_LABELS: Record<CaseMode, string> = {
  ps: "PS / PSS",
  "sans-ps": "Sans PS",
  both: "PS & Sans PS",
};

type ListResponse = {
  cases: LibraryCaseSummary[];
  specialties: string[];
};

function groupBySpecialty(cases: LibraryCaseSummary[]): Map<string, LibraryCaseSummary[]> {
  const grouped = new Map<string, LibraryCaseSummary[]>();
  for (const c of cases) {
    const key = c.specialty || "Autres";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }
  // Sort keys alphabetically, "Autres" last
  const sorted = new Map<string, LibraryCaseSummary[]>();
  const keys = [...grouped.keys()].sort((a, b) => {
    if (a === "Autres") return 1;
    if (b === "Autres") return -1;
    return a.localeCompare(b, "fr");
  });
  for (const key of keys) sorted.set(key, grouped.get(key)!);
  return sorted;
}

// ── Sub-components ──────────────────────────────────────────────────────

type KeyValueRow = { label: string; value: string };

function DataTable({ rows, title, darkMode }: { rows: KeyValueRow[]; title: string; darkMode: boolean }) {
  if (rows.length === 0) return null;

  const borderColor = darkMode ? "border-white/10" : "border-slate-200";
  const headerBg = darkMode ? "bg-slate-800/80" : "bg-slate-50";
  const cellBg = darkMode ? "bg-slate-800/40" : "bg-white";

  return (
    <div>
      <h3 className={`mb-2 text-base font-bold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
        {title}
      </h3>
      <div className={`overflow-hidden rounded-lg border ${borderColor}`}>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? headerBg : cellBg}>
                <td className={`border-r px-4 py-2.5 font-semibold ${borderColor} ${darkMode ? "text-slate-300" : "text-slate-700"}`} style={{ width: "40%" }}>
                  {row.label}
                </td>
                <td className={`px-4 py-2.5 ${darkMode ? "text-slate-200" : "text-slate-900"}`}>
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentPill({
  label,
  active,
  onClick,
  darkMode,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  darkMode: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
        active
          ? "border-primary-500 bg-primary-600 text-white shadow-sm"
          : darkMode
            ? "border-white/10 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <FileTextIcon className="h-4 w-4" />
      {label}
    </button>
  );
}

// ── Detail View ─────────────────────────────────────────────────────────

type DocumentTab = "case" | "student" | "grid";

function CaseDetailView({
  caseItem,
  structured,
  rawInput,
  darkMode,
  onBack,
  onUseCase,
  stationJSON,
}: {
  caseItem: LibraryCaseSummary;
  structured: StructuredCase;
  rawInput: string;
  darkMode: boolean;
  onBack: () => void;
  onUseCase: (rawInput: string, mode: RouteMode) => void;
  stationJSON?: StationJSON | null;
}) {
  const [activeTab, setActiveTab] = useState<DocumentTab>("case");
  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";
  const diffColors = DIFFICULTY_COLORS[caseItem.difficulty];
  const sddPrefix = structured.caseId || caseItem.title.split("—")[0]?.trim() || "";

  // Early-return for structured JSON stations — rich layout
  if (stationJSON) {
    return (
      <div>
        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          className={`mb-5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Retour à la bibliothèque
        </button>

        {/* Difficulty badge */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            darkMode ? diffColors.dark : diffColors.light
          }`}>
            {DIFFICULTY_LABELS[caseItem.difficulty]}
          </span>
        </div>

        {/* Rich layout — mode dispatched, with "Démarrer" button in chips row */}
        {(() => {
          const startButtons = (
            <>
              {(caseItem.mode === 'ps' || caseItem.mode === 'both') && (
                <button
                  type="button"
                  onClick={() => onUseCase(rawInput, 'ps')}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
                >
                  {stationJSON.mode === 'avec-pss' ? 'Démarrer la session PSS' : 'Démarrer la session PS'}
                </button>
              )}
              {(caseItem.mode === 'sans-ps' || caseItem.mode === 'both') && (
                <button
                  type="button"
                  onClick={() => onUseCase(rawInput, 'sans-ps')}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
                    darkMode
                      ? 'border-white/10 bg-slate-700 text-slate-100 hover:bg-slate-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Démarrer la session Sans PS
                </button>
              )}
            </>
          );
          if (stationJSON.mode === 'avec-ps') return <StationDetailPS station={stationJSON} darkMode={darkMode} actions={startButtons} />;
          if (stationJSON.mode === 'avec-pss') return <StationDetailPSS station={stationJSON} darkMode={darkMode} actions={startButtons} />;
          return <StationDetailSansPS station={stationJSON} darkMode={darkMode} actions={startButtons} />;
        })()}
      </div>
    );
  }

  // Build "Métadonnées de la station" table rows (matching Hypocampus exactly)
  const stationMetadata: KeyValueRow[] = [
    { label: "Titre", value: caseItem.title },
    { label: "Domaine principal", value: caseItem.specialty || "—" },
    ...(structured.caseId ? [{ label: "SDD", value: structured.caseId.replace(/^SDD\s*/i, "") }] : []),
    { label: "Difficulté", value: DIFFICULTY_LABELS[caseItem.difficulty] },
    { label: "Type de station", value: MODE_LABELS[caseItem.mode] },
    ...(caseItem.tags.length > 0 ? [{ label: "Tags", value: caseItem.tags.join(", ") }] : []),
  ];

  // Build "Trame du patient" table rows (from demographics, matching Hypocampus field names)
  const patientRows: KeyValueRow[] = structured.demographics;

  // Build acting / context rows
  const contextRows: KeyValueRow[] = [];
  if (structured.contextNote) {
    contextRows.push({ label: "Autres éléments de contexte non sensibles", value: structured.contextNote });
  }
  if (structured.actingMindset) {
    contextRows.push({ label: "État d'esprit / comportement", value: structured.actingMindset });
  }
  if (structured.startingPhrase) {
    contextRows.push({ label: "Phrase de démarrage", value: structured.startingPhrase });
  }

  // Tab definitions — only show tabs that have content
  const tabs: { id: DocumentTab; label: string }[] = [
    { id: "case", label: `${sddPrefix ? sddPrefix + " : " : ""}${caseItem.title.split("—")[1]?.trim() || caseItem.title}` },
  ];
  if (structured.isPS) {
    tabs.push({ id: "student", label: `${sddPrefix ? sddPrefix + " : " : ""}Pour l'étudiant` });
  }

  return (
    <div>
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className={`mb-5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Retour à la bibliothèque
      </button>

      {/* Case title header (like Hypocampus red title) */}
      <h2 className={`mb-2 text-2xl font-bold ${darkMode ? "text-primary-400" : "text-primary-600"}`}>
        {structured.caseId ? `${structured.caseId} : ` : ""}{caseItem.title.split("—").pop()?.trim() || caseItem.title}
      </h2>

      {/* Badges row */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${darkMode ? diffColors.dark : diffColors.light}`}>
          {DIFFICULTY_LABELS[caseItem.difficulty]}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          darkMode ? "bg-primary-900/30 text-primary-300" : "bg-primary-50 text-primary-700"
        }`}>
          {MODE_LABELS[caseItem.mode]}
        </span>
        {caseItem.tags.map((tag) => (
          <span
            key={tag}
            className={`rounded-full px-2 py-0.5 text-xs ${
              darkMode ? "bg-slate-700/40 text-slate-400" : "bg-slate-100 text-slate-500"
            }`}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Document pills row + start button on the right */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <DocumentPill
              key={tab.id}
              label={tab.label}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              darkMode={darkMode}
            />
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          {(caseItem.mode === "ps" || caseItem.mode === "both") && (
            <button
              type="button"
              onClick={() => onUseCase(rawInput, "ps")}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
            >
              Démarrer la session PS / PSS
            </button>
          )}
          {(caseItem.mode === "sans-ps" || caseItem.mode === "both") && (
            <button
              type="button"
              onClick={() => onUseCase(rawInput, "sans-ps")}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
                darkMode
                  ? "border-white/10 bg-slate-700 text-slate-100 hover:bg-slate-600"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Démarrer la session Sans PS
            </button>
          )}
        </div>
      </div>

      <hr className={`mb-6 ${darkMode ? "border-white/10" : "border-slate-200"}`} />

      {/* Tab content */}
      {activeTab === "case" && (
        <div className="space-y-6">
          {/* Métadonnées de la station (exact Hypocampus naming) */}
          <DataTable rows={stationMetadata} title="Métadonnées de la station" darkMode={darkMode} />

          {/* Trame du patient / professionnel standardisé */}
          {patientRows.length > 0 && (
            <DataTable rows={patientRows} title="Trame du patient / professionnel standardisé" darkMode={darkMode} />
          )}

          {/* Context & Acting in a table (same format) */}
          {contextRows.length > 0 && (
            <DataTable rows={contextRows} title="Acting" darkMode={darkMode} />
          )}

          {/* Sans PS: message when no patient data */}
          {!structured.isPS && (
            <div className={`rounded-xl border p-6 text-center ${
              darkMode ? "border-white/10 bg-slate-800/40" : "border-slate-200 bg-slate-50"
            }`}>
              <FileTextIcon className={`mx-auto mb-3 h-10 w-10 ${mutedText}`} />
              <p className={`text-sm font-medium ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                Station sans patient standardisé — exercice de synthèse.
              </p>
              <p className={`mt-1 text-xs ${mutedText}`}>
                Lancez la session pour exposer votre raisonnement clinique.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "student" && structured.isPS && (
        <div className="space-y-6">
          {/* Pour l'étudiant: patient demographics + context only */}
          {patientRows.length > 0 && (
            <DataTable rows={patientRows} title="Script patient" darkMode={darkMode} />
          )}

          {contextRows.length > 0 && (
            <DataTable rows={contextRows} title="Éléments de contexte" darkMode={darkMode} />
          )}

          {patientRows.length === 0 && contextRows.length === 0 && (
            <p className={`py-8 text-center text-sm ${mutedText}`}>
              Aucune information supplémentaire pour l'étudiant.
            </p>
          )}
        </div>
      )}

    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

type LibraryPageProps = {
  darkMode: boolean;
  onDarkModeChange: (value: boolean) => void;
  onNavigate: (route: "ps" | "sans-ps" | "library") => void;
  onSelectCase: (rawInput: string, targetMode: RouteMode) => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  settings: AppSettings;
  onShowToast: (title: string, body?: string, tone?: AppToastTone) => void;
};

export function LibraryPage({
  darkMode,
  onDarkModeChange,
  onNavigate,
  onSelectCase,
  onOpenDashboard,
  onOpenSettings,
  onShowToast,
}: LibraryPageProps) {
  const [cases, setCases] = useState<LibraryCaseSummary[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<CaseDifficulty | "">("");
  const [selectedMode, setSelectedMode] = useState<CaseMode | "">("");

  // Detail view state
  const [selectedCase, setSelectedCase] = useState<LibraryCaseSummary | null>(null);
  const [selectedCaseRawInput, setSelectedCaseRawInput] = useState<string | null>(null);
  const [selectedCaseStructured, setSelectedCaseStructured] = useState<StructuredCase | null>(null);
  const [selectedStationJSON, setSelectedStationJSON] = useState<StationJSON | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const debounceRef = useRef<number | null>(null);

  const fetchCases = useCallback(async (query?: string, specialty?: string, difficulty?: string, mode?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (specialty) params.set("specialty", specialty);
      if (difficulty) params.set("difficulty", difficulty);
      if (mode) params.set("mode", mode);

      const response = await fetch(`/api/cases?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch cases");

      const data = (await response.json()) as ListResponse;
      setCases(data.cases);
      setSpecialties(data.specialties);
    } catch {
      onShowToast("Erreur", "Impossible de charger les cas.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    void fetchCases();
  }, [fetchCases]);

  const grouped = useMemo(() => groupBySpecialty(cases), [cases]);

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchCases(value, selectedSpecialty, selectedDifficulty, selectedMode);
    }, 300);
  }

  function handleFilterChange(specialty: string, difficulty: string, mode: string) {
    setSelectedSpecialty(specialty);
    setSelectedDifficulty(difficulty as CaseDifficulty | "");
    setSelectedMode(mode as CaseMode | "");
    void fetchCases(searchQuery, specialty, difficulty, mode);
  }

  async function handleSelectCase(caseItem: LibraryCaseSummary) {
    setSelectedCase(caseItem);
    setSelectedCaseRawInput(null);
    setSelectedCaseStructured(null);
    setSelectedStationJSON(null);
    setIsLoadingDetail(true);

    try {
      const response = await fetch(`/api/cases/${caseItem.id}`);
      if (!response.ok) throw new Error("Failed to fetch case");
      const data = (await response.json()) as LibraryCase;
      setSelectedCaseRawInput(data.rawInput);
      setSelectedCaseStructured(parseStructuredCase(data.rawInput));
      setSelectedStationJSON(detectStationJSON(data.rawInput));
    } catch {
      onShowToast("Erreur", "Impossible de charger le cas.", "error");
      setSelectedCase(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  function handleBack() {
    setSelectedCase(null);
    setSelectedCaseRawInput(null);
    setSelectedCaseStructured(null);
    setSelectedStationJSON(null);
  }

  function handleUseCase(rawInput: string, targetMode: RouteMode) {
    onSelectCase(rawInput, targetMode);
  }

  const cardBg = darkMode
    ? "bg-slate-800/60 border-white/10 ring-1 ring-inset ring-white/5"
    : "bg-white border-slate-200";
  const inputBg = darkMode
    ? "bg-slate-800/80 border-white/10 text-slate-100 placeholder:text-slate-500"
    : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400";
  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100" : "bg-[#f7f9fe] text-[#181c20]"}`}>
      {/* Header */}
      <header className={`sticky top-0 z-30 border-b ${darkMode ? "border-white/10 bg-slate-950/80" : "border-[#bcc9c8] bg-white/85"}`} style={{ backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Left: Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-sm">
              <ActivityIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className={`font-manrope text-base font-bold tracking-tight ${darkMode ? "text-white" : "text-[#181c20]"}`}>ECOS-AI</p>
              <p className={`font-inter text-xs ${darkMode ? "text-slate-400" : "text-[#3d4949]"}`}>Simulateur d'examen clinique</p>
            </div>
          </div>

          {/* Right: mode switcher + controls */}
          <div className="flex items-center gap-3">
            <div className={`flex items-center rounded-xl border p-1 ${darkMode ? "border-transparent bg-slate-800" : "border-slate-200 bg-white"}`}>
              <button
                type="button"
                onClick={() => onNavigate("ps")}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                  darkMode ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                PS / PSS
              </button>
              <button
                type="button"
                onClick={() => onNavigate("sans-ps")}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                  darkMode ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Sans PS
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all"
              >
                Bibliothèque
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenDashboard}
              className={`rounded-xl border p-2.5 transition-all duration-200 ${
                darkMode
                  ? "border-transparent bg-slate-800/70 hover:bg-slate-700/80"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              aria-label="Ouvrir le tableau de bord"
            >
              <ActivityIcon className={`h-5 w-5 ${darkMode ? "text-slate-200" : "text-slate-600"}`} />
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className={`rounded-xl border p-2.5 transition-all duration-200 ${
                darkMode
                  ? "border-transparent bg-slate-800/70 hover:bg-slate-700/80"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              aria-label="Ouvrir les paramètres"
            >
              <SettingsIcon className={`h-5 w-5 ${darkMode ? "text-slate-200" : "text-slate-600"}`} />
            </button>

            <button
              type="button"
              onClick={() => onDarkModeChange(!darkMode)}
              className={`rounded-xl border p-2.5 transition-all duration-200 ${
                darkMode
                  ? "border-transparent bg-slate-800/70 hover:bg-slate-700/80"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              aria-label={darkMode ? "Mode clair" : "Mode sombre"}
            >
              {darkMode
                ? <SunIcon className="h-5 w-5 text-slate-200" />
                : <MoonIcon className="h-5 w-5 text-slate-600" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {selectedCase ? (
          /* Detail view */
          isLoadingDetail || !selectedCaseStructured || !selectedCaseRawInput ? (
            <div className="flex justify-center py-16">
              <div className={`h-8 w-8 animate-spin rounded-full border-2 border-t-transparent ${darkMode ? "border-primary-400" : "border-primary-600"}`} />
            </div>
          ) : (
            <CaseDetailView
              caseItem={selectedCase}
              structured={selectedCaseStructured}
              rawInput={selectedCaseRawInput}
              darkMode={darkMode}
              onBack={handleBack}
              onUseCase={handleUseCase}
              stationJSON={selectedStationJSON}
            />
          )
        ) : (
          /* Grid view */
          <>
            {/* Title */}
            <div className="mb-8 flex items-center gap-3">
              <BookOpenIcon className={`h-8 w-8 ${darkMode ? "text-primary-400" : "text-primary-600"}`} />
              <div>
                <h1 className="text-2xl font-bold">Bibliothèque ECOS</h1>
                <p className={`text-sm ${mutedText}`}>
                  Sélectionnez un cas clinique pour démarrer une session d'entraînement.
                </p>
              </div>
            </div>

            {/* Search and filters */}
            <div className={`mb-6 rounded-xl border p-4 ${cardBg}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <SearchIcon className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${mutedText}`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Rechercher un cas..."
                    className={`w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm ${inputBg}`}
                  />
                </div>

                <select
                  value={selectedSpecialty}
                  onChange={(e) => handleFilterChange(e.target.value, selectedDifficulty, selectedMode)}
                  className={`rounded-lg border px-3 py-2.5 text-sm ${inputBg}`}
                >
                  <option value="">Toutes spécialités</option>
                  {specialties.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <select
                  value={selectedDifficulty}
                  onChange={(e) => handleFilterChange(selectedSpecialty, e.target.value, selectedMode)}
                  className={`rounded-lg border px-3 py-2.5 text-sm ${inputBg}`}
                >
                  <option value="">Toute difficulté</option>
                  <option value="facile">Facile</option>
                  <option value="moyen">Moyen</option>
                  <option value="difficile">Difficile</option>
                </select>

                <select
                  value={selectedMode}
                  onChange={(e) => handleFilterChange(selectedSpecialty, selectedDifficulty, e.target.value)}
                  className={`rounded-lg border px-3 py-2.5 text-sm ${inputBg}`}
                >
                  <option value="">Tout mode</option>
                  <option value="ps">PS / PSS</option>
                  <option value="sans-ps">Sans PS</option>
                </select>
              </div>
            </div>

            {/* Results count */}
            {!isLoading && cases.length > 0 && (
              <p className={`mb-4 text-sm ${mutedText}`}>
                {cases.length} cas{cases.length > 1 ? "" : ""} trouvé{cases.length > 1 ? "s" : ""}
              </p>
            )}

            {/* Cases grouped by specialty */}
            {isLoading ? (
              <div className="flex justify-center py-16">
                <div className={`h-8 w-8 animate-spin rounded-full border-2 border-t-transparent ${darkMode ? "border-primary-400" : "border-primary-600"}`} />
              </div>
            ) : cases.length === 0 ? (
              <div className={`rounded-xl border py-16 text-center ${cardBg}`}>
                <BookOpenIcon className={`mx-auto mb-3 h-12 w-12 ${mutedText}`} />
                <p className={`text-lg font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Aucun cas trouvé
                </p>
                <p className={`mt-1 text-sm ${mutedText}`}>
                  Essayez de modifier vos filtres ou d'ajouter des cas avec <code className="font-mono">npm run seed</code>.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {[...grouped.entries()].map(([specialty, groupCases]) => (
                  <section key={specialty}>
                    <div className="mb-3 flex items-center gap-3">
                      <h2 className={`text-sm font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                        {specialty}
                      </h2>
                      <span className={`text-xs ${mutedText}`}>
                        {groupCases.length} cas
                      </span>
                      <div className={`flex-1 border-t ${darkMode ? "border-white/10" : "border-slate-200"}`} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {groupCases.map((caseItem) => {
                        const diffColors = DIFFICULTY_COLORS[caseItem.difficulty];
                        return (
                          <button
                            key={caseItem.id}
                            type="button"
                            onClick={() => void handleSelectCase(caseItem)}
                            className={`rounded-xl border p-4 text-left transition-all duration-200 hover:shadow-md ${cardBg} ${
                              darkMode ? "hover:border-white/20" : "hover:border-slate-300"
                            }`}
                          >
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <h3 className="text-sm font-semibold leading-tight">{caseItem.title}</h3>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${darkMode ? diffColors.dark : diffColors.light}`}>
                                {DIFFICULTY_LABELS[caseItem.difficulty]}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                darkMode ? "bg-primary-900/30 text-primary-300" : "bg-primary-50 text-primary-700"
                              }`}>
                                {MODE_LABELS[caseItem.mode]}
                              </span>
                              {caseItem.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className={`rounded-full px-2 py-0.5 text-xs ${
                                    darkMode ? "bg-slate-700/40 text-slate-400" : "bg-slate-50 text-slate-500"
                                  }`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
