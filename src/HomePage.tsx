import { useState, useEffect } from "react";
import type { RouteMode, AppSettings, AppToastTone, LibraryCaseSummary, CaseDifficulty } from "./types";

type HomePageProps = {
  darkMode: boolean;
  onDarkModeChange: (value: boolean) => void;
  onNavigate: (route: RouteMode) => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  settings: AppSettings;
  onShowToast?: (title: string, body?: string, tone?: AppToastTone) => void;
};

// ── Inline SVG icons ─────────────────────────────────────────────────────────

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10a7 7 0 0 1-14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function BookOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

// Specialty icons
function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ScissorsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

function CirclePlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<CaseDifficulty, { light: string; dark: string }> = {
  facile:    { light: "bg-emerald-50 text-emerald-700 border-emerald-200", dark: "bg-emerald-900/30 text-emerald-300 border-emerald-700/40" },
  moyen:     { light: "bg-amber-50 text-amber-700 border-amber-200",       dark: "bg-amber-900/30 text-amber-300 border-amber-700/40" },
  difficile: { light: "bg-rose-50 text-rose-700 border-rose-200",          dark: "bg-rose-900/30 text-rose-300 border-rose-700/40" },
};

const DIFFICULTY_LABELS: Record<CaseDifficulty, string> = {
  facile: "Facile", moyen: "Moyen", difficile: "Difficile",
};

const MODE_LABELS: Record<string, string> = {
  ps: "PS / PSS", "sans-ps": "Sans PS", both: "PS & Sans PS",
};

const SPECIALTIES = [
  { name: "Médecine interne", Icon: HeartIcon },
  { name: "Pédiatrie",        Icon: UserIcon },
  { name: "Chirurgie",        Icon: ScissorsIcon },
  { name: "Gynécologie-Obstétrique", Icon: CirclePlusIcon },
] as const;

const FEATURE_MODULES = [
  {
    title: "Patient IA",
    description: "Simulez un dialogue avec un patient standardisé grâce à l'IA vocale Gemini.",
    Icon: MicIcon,
    action: "ps" as RouteMode,
    cta: "Démarrer",
  },
  {
    title: "Grilles d'évaluation",
    description: "Accédez aux critères d'évaluation détaillés pour chaque station ECOS.",
    Icon: GridIcon,
    action: "library" as RouteMode,
    cta: "Explorer",
  },
  {
    title: "Mode Sans PS",
    description: "Entraînez-vous à la présentation orale sans patient standardisé.",
    Icon: MicOffIcon,
    action: "sans-ps" as RouteMode,
    cta: "Démarrer",
  },
] as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function RecentCaseCard({
  caseItem,
  featured,
  darkMode,
  onNavigate,
}: {
  caseItem: LibraryCaseSummary;
  featured: boolean;
  darkMode: boolean;
  onNavigate: (route: RouteMode) => void;
}) {
  const cardBg = darkMode
    ? "bg-slate-800/60 border-white/10 ring-1 ring-inset ring-white/5"
    : "bg-white border-slate-200";
  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";
  const diffColors = DIFFICULTY_COLORS[caseItem.difficulty];

  return (
    <div
      className={`rounded-2xl border p-5 transition-all hover:shadow-md ${cardBg} ${
        featured ? "lg:col-span-2" : ""
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            darkMode ? "bg-primary-900/30 text-primary-300" : "bg-primary-50 text-primary-700"
          }`}
        >
          {caseItem.specialty || "Général"}
        </span>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            darkMode ? diffColors.dark : diffColors.light
          }`}
        >
          {DIFFICULTY_LABELS[caseItem.difficulty]}
        </span>
      </div>
      <h3
        className={`font-semibold ${featured ? "text-base" : "text-sm"} ${
          darkMode ? "text-slate-100" : "text-slate-800"
        }`}
      >
        {caseItem.title}
      </h3>
      <div className="mt-3 flex items-center justify-between">
        <span className={`text-xs ${mutedText}`}>
          {MODE_LABELS[caseItem.mode] ?? caseItem.mode}
        </span>
        {featured && (
          <button
            type="button"
            onClick={() => onNavigate("library")}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-700"
          >
            Ouvrir
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function HomePage({
  darkMode,
  onDarkModeChange,
  onNavigate,
  onOpenDashboard,
  onOpenSettings,
  onShowToast,
}: HomePageProps) {
  const [recentCases, setRecentCases] = useState<LibraryCaseSummary[]>([]);
  const [specialtyCounts, setSpecialtyCounts] = useState<Record<string, number>>({});
  const [isLoadingCases, setIsLoadingCases] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/cases");
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { cases: LibraryCaseSummary[] };
        const sorted = [...data.cases].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        setRecentCases(sorted.slice(0, 3));
        const counts: Record<string, number> = {};
        for (const c of data.cases) {
          counts[c.specialty] = (counts[c.specialty] ?? 0) + 1;
        }
        setSpecialtyCounts(counts);
      } catch {
        onShowToast?.("Erreur", "Impossible de charger les stations récentes.", "error");
      } finally {
        setIsLoadingCases(false);
      }
    }
    void load();
  }, [onShowToast]);

  const cardBg = darkMode
    ? "bg-slate-800/60 border-white/10 ring-1 ring-inset ring-white/5"
    : "bg-white border-slate-200";
  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";
  const pageBg = darkMode
    ? "min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100"
    : "min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900";

  const iconBtnCls = `rounded-xl border p-2.5 transition-all ${
    darkMode
      ? "border-transparent bg-slate-800/70 hover:bg-slate-700/80"
      : "border-slate-200 bg-white hover:bg-slate-50"
  }`;

  return (
    <div className={pageBg}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          darkMode ? "border-white/10 bg-slate-950/80" : "border-slate-200 bg-white/80"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Logo */}
          <span className={`text-lg font-bold tracking-tight ${darkMode ? "text-white" : "text-slate-900"}`}>
            ECOS<span className="text-primary-600">-AI</span>
          </span>

          {/* Nav */}
          <nav className="hidden gap-1 sm:flex">
            <button
              onClick={() => onNavigate("ps")}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white"
            >
              Simulateur
            </button>
            <button
              onClick={() => onNavigate("library")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Bibliothèque
            </button>
            <span className={`cursor-default rounded-lg px-4 py-2 text-sm font-medium opacity-40 ${mutedText}`}>
              Mon Parcours
            </span>
          </nav>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button onClick={onOpenDashboard} className={iconBtnCls} title="Tableau de bord">
              <ActivityIcon className={`h-4 w-4 ${darkMode ? "text-slate-300" : "text-slate-600"}`} />
            </button>
            <button onClick={onOpenSettings} className={iconBtnCls} title="Paramètres">
              <SettingsIcon className={`h-4 w-4 ${darkMode ? "text-slate-300" : "text-slate-600"}`} />
            </button>
            <button onClick={() => onDarkModeChange(!darkMode)} className={iconBtnCls} title="Changer de thème">
              {darkMode
                ? <SunIcon className="h-4 w-4 text-slate-300" />
                : <MoonIcon className="h-4 w-4 text-slate-600" />}
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl animate-fade-in px-4 py-16">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
            {/* Left */}
            <div>
              <div
                className={`mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                  darkMode
                    ? "border-primary-700/40 bg-primary-900/30 text-primary-300"
                    : "border-primary-200 bg-primary-50 text-primary-700"
                }`}
              >
                <span className="status-dot status-dot--active" />
                Simulateur IA actif
              </div>
              <h1
                className={`mb-4 text-4xl font-bold leading-tight lg:text-5xl ${
                  darkMode ? "text-white" : "text-slate-900"
                }`}
              >
                Préparez vos{" "}
                <span className="text-gradient">ECOS</span>{" "}
                avec confiance
              </h1>
              <p className={`mb-8 text-lg leading-relaxed ${mutedText}`}>
                Entraînez-vous avec un patient IA vocal, obtenez une évaluation
                immédiate et progressez sur vos critères faibles.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => onNavigate("ps")}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <MicIcon className="h-4 w-4" />
                  Démarrer une simulation
                </button>
                <button
                  onClick={() => onNavigate("library")}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <BookOpenIcon className="h-4 w-4" />
                  Voir la bibliothèque
                </button>
              </div>
            </div>

            {/* Right — mock session card */}
            <div className="relative hidden lg:flex lg:justify-center">
              <div
                className={`absolute inset-0 rounded-3xl blur-3xl ${
                  darkMode
                    ? "bg-gradient-to-br from-primary-900/30 to-primary-800/10"
                    : "bg-gradient-to-br from-primary-100/60 to-primary-50/30"
                }`}
              />
              <div className={`relative z-10 w-72 rounded-3xl border p-8 shadow-elevated ${cardBg}`}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600">
                    <MicIcon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-slate-800"}`}>
                      Session en cours
                    </p>
                    <p className={`text-xs ${mutedText}`}>Patient IA • Cardio</p>
                  </div>
                </div>
                <div className="flex items-end justify-center gap-1 py-4">
                  {[3, 5, 7, 4, 8, 6, 3, 7, 5, 4, 6, 8, 3, 5, 7].map((h, i) => (
                    <div key={i} className="audio-bar" style={{ height: `${h * 4}px` }} />
                  ))}
                </div>
                <p className={`text-center text-xs ${mutedText}`}>Écoute en cours…</p>
              </div>
              {/* Floating readiness card */}
              <div
                className={`absolute -right-4 -top-4 z-20 rounded-2xl border px-4 py-3 shadow-panel ${
                  darkMode ? "border-white/10 bg-slate-800/90" : "border-slate-200 bg-white"
                }`}
              >
                <p className={`text-xs font-medium ${mutedText}`}>Niveau de préparation</p>
                <p className="text-2xl font-bold text-primary-600">84%</p>
                <div className={`mt-1 h-1.5 w-24 overflow-hidden rounded-full ${darkMode ? "bg-slate-700" : "bg-slate-200"}`}>
                  <div className="h-full w-[84%] rounded-full bg-primary-500" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Progress banner ────────────────────────────────────────────────── */}
        <section
          className={`border-y py-4 ${
            darkMode ? "border-white/10 bg-slate-900/50" : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4">
            <div className="flex items-center gap-3">
              <ClockIcon className={`h-5 w-5 ${darkMode ? "text-primary-400" : "text-primary-600"}`} />
              <div>
                <p className={`text-sm font-semibold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
                  Objectif hebdomadaire
                </p>
                <p className={`text-xs ${mutedText}`}>3 stations sur 5 cette semaine</p>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-3" style={{ maxWidth: "320px" }}>
              <div className="flex-1">
                <div
                  className={`h-2 w-full overflow-hidden rounded-full ${
                    darkMode ? "bg-slate-700" : "bg-slate-200"
                  }`}
                >
                  <div className="h-full w-3/5 rounded-full bg-primary-500 transition-all" />
                </div>
              </div>
              <span className={`shrink-0 text-xs font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                60%
              </span>
            </div>
            <button
              onClick={() => onNavigate("library")}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 transition-colors hover:text-primary-700"
            >
              Voir les scores
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* ── Specialties ────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-10">
          <h2 className={`mb-6 text-xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
            Spécialités
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SPECIALTIES.map((spec) => {
              const count = specialtyCounts[spec.name] ?? 0;
              return (
                <button
                  key={spec.name}
                  type="button"
                  onClick={() => onNavigate("library")}
                  className={`flex flex-col items-start rounded-2xl border p-5 text-left transition-all hover:shadow-md ${cardBg} ${
                    darkMode ? "hover:border-white/20" : "hover:border-slate-300"
                  }`}
                >
                  <div
                    className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${
                      darkMode ? "bg-primary-900/40" : "bg-primary-100"
                    }`}
                  >
                    <spec.Icon className={`h-5 w-5 ${darkMode ? "text-primary-400" : "text-primary-600"}`} />
                  </div>
                  <p className={`text-sm font-semibold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
                    {spec.name}
                  </p>
                  <p className={`mt-1 text-xs ${mutedText}`}>
                    {isLoadingCases ? "…" : `${count} station${count !== 1 ? "s" : ""}`}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Feature modules ────────────────────────────────────────────────── */}
        <section className={`border-t py-10 ${darkMode ? "border-white/10" : "border-slate-100"}`}>
          <div className="mx-auto max-w-6xl px-4">
            <h2 className={`mb-6 text-xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
              Modules
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {FEATURE_MODULES.map((mod) => (
                <div key={mod.title} className={`rounded-2xl border p-6 ${cardBg}`}>
                  <div
                    className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${
                      darkMode ? "bg-primary-900/40" : "bg-primary-50"
                    }`}
                  >
                    <mod.Icon className={`h-5 w-5 ${darkMode ? "text-primary-400" : "text-primary-600"}`} />
                  </div>
                  <h3 className={`mb-2 font-semibold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
                    {mod.title}
                  </h3>
                  <p className={`mb-4 text-sm leading-relaxed ${mutedText}`}>
                    {mod.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate(mod.action)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 transition-colors hover:text-primary-700"
                  >
                    {mod.cta}
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Recent stations ────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className={`text-xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
              Stations récentes
            </h2>
            <button
              onClick={() => onNavigate("library")}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 transition-colors hover:text-primary-700"
            >
              Voir tout
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          {isLoadingCases ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-36 animate-pulse rounded-2xl border ${cardBg} ${i === 0 ? "lg:col-span-2" : ""}`}
                />
              ))}
            </div>
          ) : recentCases.length === 0 ? (
            <div className={`rounded-2xl border p-10 text-center ${cardBg}`}>
              <BookOpenIcon className={`mx-auto mb-3 h-10 w-10 ${mutedText}`} />
              <p className={`font-medium ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                Aucune station dans la bibliothèque
              </p>
              <p className={`mt-1 text-sm ${mutedText}`}>
                Importez des cas depuis la bibliothèque pour les voir apparaître ici.
              </p>
              <button onClick={() => onNavigate("library")} className="btn-primary mt-4">
                Ouvrir la bibliothèque
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {recentCases.map((c, idx) => (
                <RecentCaseCard
                  key={c.id}
                  caseItem={c}
                  featured={idx === 0}
                  darkMode={darkMode}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className={`mt-10 border-t ${darkMode ? "border-white/10" : "border-slate-200"}`}>
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div>
              <p className={`mb-2 text-lg font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
                ECOS<span className="text-primary-600">-AI</span>
              </p>
              <p className={`text-sm leading-relaxed ${mutedText}`}>
                Simulateur d'examens cliniques objectifs structurés, propulsé par l'IA vocale Gemini.
              </p>
            </div>
            <div>
              <p className={`mb-3 text-xs font-semibold uppercase tracking-wider ${mutedText}`}>
                Ressources
              </p>
              <ul className="space-y-2">
                <li>
                  <button
                    onClick={() => onNavigate("library")}
                    className={`text-sm transition-colors hover:text-primary-600 ${mutedText}`}
                  >
                    Bibliothèque ECOS
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate("ps")}
                    className={`text-sm transition-colors hover:text-primary-600 ${mutedText}`}
                  >
                    Mode PS / PSS
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => onNavigate("sans-ps")}
                    className={`text-sm transition-colors hover:text-primary-600 ${mutedText}`}
                  >
                    Mode Sans PS
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <p className={`mb-3 text-xs font-semibold uppercase tracking-wider ${mutedText}`}>
                Support
              </p>
              <ul className="space-y-2">
                <li>
                  <button
                    onClick={onOpenSettings}
                    className={`text-sm transition-colors hover:text-primary-600 ${mutedText}`}
                  >
                    Paramètres
                  </button>
                </li>
                <li>
                  <button
                    onClick={onOpenDashboard}
                    className={`text-sm transition-colors hover:text-primary-600 ${mutedText}`}
                  >
                    Tableau de bord
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <p
            className={`mt-8 border-t pt-6 text-center text-xs ${
              darkMode ? "border-white/10" : "border-slate-200"
            } ${mutedText}`}
          >
            © {new Date().getFullYear()} ECOS-AI — Outil d'entraînement médical
          </p>
        </div>
      </footer>
    </div>
  );
}
