import React, { useState, useEffect } from "react";
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

// ── Material Symbol icon helper ───────────────────────────────────────────────
function MSIcon({ name, size = 20, className, style }: { name: string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`, ...style }}
      aria-hidden="true"
    >
      {name}
    </span>
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
  { name: "Médecine interne", icon: "favorite" },
  { name: "Pédiatrie",        icon: "child_care" },
  { name: "Chirurgie",        icon: "content_cut" },
  { name: "Gynécologie-Obstétrique", icon: "join" },
] as const;

const FEATURE_MODULES = [
  {
    title: "Patient IA",
    description: "Simulez un dialogue avec un patient standardisé grâce à l'IA vocale Gemini.",
    icon: "mic",
    action: "ps" as RouteMode,
    cta: "Démarrer",
  },
  {
    title: "Grilles d'évaluation",
    description: "Accédez aux critères d'évaluation détaillés pour chaque station ECOS.",
    icon: "checklist",
    action: "library" as RouteMode,
    cta: "Explorer",
  },
  {
    title: "Mode Sans PS",
    description: "Entraînez-vous à la présentation orale sans patient standardisé.",
    icon: "mic_off",
    action: "sans-ps" as RouteMode,
    cta: "Démarrer",
  },
] as const;

// Design tokens
const T = {
  primary: "#006767",
  primaryCont: "#008282",
  primaryFixed: "#8cf3f3",
  onSurface: "#181c20",
  onSurfaceVar: "#3d4949",
  outlineVar: "#bcc9c8",
  surface: "#f7f9fe",
  gradientBtn: "linear-gradient(135deg, #006767 0%, #008282 100%)",
};

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
  const diffColors = DIFFICULTY_COLORS[caseItem.difficulty];

  return (
    <div
      className={`rounded-xl border p-5 transition-all duration-200 hover:shadow-md ${
        featured ? "lg:col-span-2" : ""
      }`}
      style={darkMode
        ? { background: "rgba(30,41,59,0.6)", borderColor: "rgba(255,255,255,0.1)" }
        : { background: "#ffffff", borderColor: T.outlineVar }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-inter font-medium"
          style={{ background: `${T.primaryFixed}40`, color: darkMode ? "#8cf3f3" : T.primary }}
        >
          {caseItem.specialty || "Général"}
        </span>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-inter font-medium ${
          darkMode ? diffColors.dark : diffColors.light
        }`}>
          {DIFFICULTY_LABELS[caseItem.difficulty]}
        </span>
      </div>
      <h3
        className={`font-manrope font-semibold ${featured ? "text-base" : "text-sm"}`}
        style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}
      >
        {caseItem.title}
      </h3>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-inter" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
          {MODE_LABELS[caseItem.mode] ?? caseItem.mode}
        </span>
        {featured && (
          <button
            type="button"
            onClick={() => onNavigate("library")}
            className="rounded-full px-4 py-1.5 text-xs font-inter font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: T.gradientBtn }}
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

  // Dark mode tokens
  const dk = {
    bg: "from-slate-950 via-slate-900 to-slate-950",
    card: { background: "rgba(30,41,59,0.6)", borderColor: "rgba(255,255,255,0.08)" },
    textHead: "#f1f5f9",
    textSub: "#94a3b8",
    headerBg: "rgba(2,8,23,0.8)",
    headerBorder: "rgba(255,255,255,0.08)",
    sectionBorder: "rgba(255,255,255,0.08)",
    bannerBg: "rgba(15,23,42,0.5)",
    trackBg: "#1e293b",
    iconBg: `${T.primaryFixed}22`,
    iconColor: "#8cf3f3",
    navBtn: { background: "rgba(30,41,59,0.8)", borderColor: "rgba(255,255,255,0.08)" },
  };

  const iconControlBtn = `rounded-xl p-2.5 transition-all duration-150 ${
    darkMode ? "hover:bg-white/5" : "hover:bg-black/5"
  }`;

  return (
    <div
      className={`min-h-screen font-inter ${darkMode ? `bg-gradient-to-br ${dk.bg} text-slate-100` : ""}`}
      style={darkMode ? {} : { background: T.surface, color: T.onSurface }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 border-b"
        style={darkMode
          ? { background: dk.headerBg, borderColor: dk.headerBorder, backdropFilter: "blur(24px)" }
          : { background: "rgba(255,255,255,0.8)", borderColor: T.outlineVar, backdropFilter: "blur(24px)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Logo */}
          <span className="font-manrope text-lg font-bold tracking-tight" style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}>
            ECOS<span style={{ color: T.primary }}>-AI</span>
          </span>

          {/* Nav */}
          <nav className="hidden gap-1 sm:flex items-center">
            <button
              onClick={() => onNavigate("ps")}
              className="rounded-full px-5 py-2 text-sm font-manrope font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: T.gradientBtn }}
            >
              Simulateur
            </button>
            <button
              onClick={() => onNavigate("library")}
              className={`rounded-full px-5 py-2 text-sm font-manrope font-medium transition-colors ${
                darkMode ? "text-slate-300 hover:text-white hover:bg-white/5" : "hover:bg-black/5"
              }`}
              style={{ color: darkMode ? undefined : T.onSurfaceVar }}
            >
              Bibliothèque
            </button>
            <span
              className="rounded-full px-5 py-2 text-sm font-manrope font-medium cursor-default opacity-40"
              style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}
            >
              Mon Parcours
            </span>
          </nav>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <button onClick={onOpenDashboard} className={iconControlBtn} title="Tableau de bord">
              <MSIcon name="monitoring" size={20} style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }} />
            </button>
            <button onClick={onOpenSettings} className={iconControlBtn} title="Paramètres">
              <MSIcon name="settings" size={20} style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }} />
            </button>
            <button onClick={() => onDarkModeChange(!darkMode)} className={iconControlBtn} title="Thème">
              <MSIcon
                name={darkMode ? "light_mode" : "dark_mode"}
                size={20}
                style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}
              />
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl animate-fade-in px-4 py-16 sm:py-20">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
            {/* Left */}
            <div>
              {/* Status badge */}
              <div
                className="mb-5 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-inter font-semibold"
                style={{
                  borderColor: `${T.primary}40`,
                  background: `${T.primaryFixed}30`,
                  color: darkMode ? "#8cf3f3" : T.primary,
                }}
              >
                <MSIcon name="verified" size={14} />
                Simulateur IA actif
              </div>

              <h1
                className="mb-5 font-manrope text-4xl font-extrabold leading-[1.1] tracking-tight lg:text-5xl"
                style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}
              >
                Préparez vos{" "}
                <span style={{ color: T.primary }}>ECOS</span>{" "}
                avec confiance
              </h1>

              <p
                className="mb-8 font-inter text-lg leading-relaxed"
                style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}
              >
                Entraînez-vous avec un patient IA vocal, obtenez une évaluation
                immédiate et progressez sur vos critères faibles.
              </p>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => onNavigate("ps")}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-inter font-semibold text-sm text-white shadow-md transition-opacity hover:opacity-90"
                  style={{ background: T.gradientBtn }}
                >
                  <MSIcon name="play_circle" size={18} />
                  Démarrer une simulation
                </button>
                <button
                  onClick={() => onNavigate("library")}
                  className="inline-flex items-center gap-2 rounded-full border px-6 py-3 font-inter font-semibold text-sm transition-colors hover:bg-black/5"
                  style={darkMode
                    ? { borderColor: "rgba(255,255,255,0.15)", color: "#cbd5e1", background: "rgba(255,255,255,0.04)" }
                    : { borderColor: T.outlineVar, color: T.onSurface }}
                >
                  <MSIcon name="menu_book" size={18} />
                  Voir la bibliothèque
                </button>
              </div>
            </div>

            {/* Right — mock session card */}
            <div className="relative hidden lg:flex lg:justify-center">
              <div
                className="absolute inset-0 rounded-3xl blur-3xl"
                style={{ background: `${T.primaryFixed}30` }}
              />
              <div
                className="relative z-10 w-72 rounded-2xl border p-8 shadow-elevated"
                style={darkMode ? dk.card : { background: "#ffffff", borderColor: T.outlineVar }}
              >
                <div className="mb-4 flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: T.gradientBtn }}
                  >
                    <MSIcon name="mic" size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="font-manrope text-sm font-semibold" style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}>
                      Session en cours
                    </p>
                    <p className="font-inter text-xs" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
                      Patient IA • Cardio
                    </p>
                  </div>
                </div>
                <div className="flex items-end justify-center gap-1 py-4">
                  {[3, 5, 7, 4, 8, 6, 3, 7, 5, 4, 6, 8, 3, 5, 7].map((h, i) => (
                    <div key={i} className="audio-bar" style={{ height: `${h * 4}px` }} />
                  ))}
                </div>
                <p className="text-center font-inter text-xs" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
                  Écoute en cours…
                </p>
              </div>

              {/* Floating readiness card */}
              <div
                className="absolute -right-4 -top-4 z-20 rounded-2xl border px-4 py-3 shadow-panel"
                style={darkMode
                  ? { background: "rgba(30,41,59,0.9)", borderColor: "rgba(255,255,255,0.1)" }
                  : { background: "#ffffff", borderColor: T.outlineVar }}
              >
                <p className="font-inter text-xs font-medium" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
                  Niveau de préparation
                </p>
                <p className="font-manrope text-2xl font-bold" style={{ color: T.primary }}>84%</p>
                <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full" style={{ background: darkMode ? "#1e293b" : T.outlineVar }}>
                  <div className="h-full w-[84%] rounded-full" style={{ background: T.gradientBtn }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Progress banner ────────────────────────────────────────────── */}
        <section
          className="border-y py-4"
          style={darkMode
            ? { borderColor: dk.sectionBorder, background: dk.bannerBg }
            : { borderColor: T.outlineVar, background: "rgba(140,243,243,0.08)" }}
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4">
            <div className="flex items-center gap-3">
              <MSIcon name="schedule" size={20} style={{ color: T.primary }} />
              <div>
                <p className="font-manrope text-sm font-semibold" style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}>
                  Objectif hebdomadaire
                </p>
                <p className="font-inter text-xs" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
                  3 stations sur 5 cette semaine
                </p>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-3" style={{ maxWidth: "320px" }}>
              <div className="flex-1">
                <div
                  className="h-2 w-full overflow-hidden rounded-full"
                  style={{ background: darkMode ? "#1e293b" : T.outlineVar }}
                >
                  <div
                    className="h-full w-3/5 rounded-full transition-all"
                    style={{ background: T.gradientBtn }}
                  />
                </div>
              </div>
              <span className="shrink-0 font-inter text-xs font-semibold" style={{ color: darkMode ? "#cbd5e1" : T.onSurface }}>
                60%
              </span>
            </div>
            <button
              onClick={() => onNavigate("library")}
              className="inline-flex items-center gap-1 font-inter text-sm font-semibold transition-opacity hover:opacity-70"
              style={{ color: T.primary }}
            >
              Voir les scores
              <MSIcon name="chevron_right" size={18} />
            </button>
          </div>
        </section>

        {/* ── Specialties ───────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2
            className="mb-2 font-manrope text-2xl font-bold"
            style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}
          >
            Spécialités
          </h2>
          <p className="mb-7 font-inter text-sm" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
            Des stations ECOS adaptées à chaque discipline de votre programme.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SPECIALTIES.map((spec) => {
              const count = specialtyCounts[spec.name] ?? 0;
              return (
                <button
                  key={spec.name}
                  type="button"
                  onClick={() => onNavigate("library")}
                  className="flex flex-col items-start rounded-xl border p-5 text-left transition-all duration-200 hover:shadow-md"
                  style={darkMode
                    ? { ...dk.card, background: "rgba(30,41,59,0.5)" }
                    : { background: "#ffffff", borderColor: T.outlineVar }}
                >
                  <div
                    className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                    style={darkMode ? { background: dk.iconBg } : { background: `${T.primaryFixed}60` }}
                  >
                    <MSIcon
                      name={spec.icon}
                      size={20}
                      style={{ color: darkMode ? dk.iconColor : T.primary }}
                    />
                  </div>
                  <p className="font-manrope text-sm font-semibold" style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}>
                    {spec.name}
                  </p>
                  <p className="mt-1 font-inter text-xs" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
                    {isLoadingCases ? "…" : `${count} station${count !== 1 ? "s" : ""}`}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Feature modules ───────────────────────────────────────────── */}
        <section
          className="border-t py-12"
          style={darkMode ? { borderColor: dk.sectionBorder } : { borderColor: T.outlineVar }}
        >
          <div className="mx-auto max-w-6xl px-4">
            <h2
              className="mb-2 font-manrope text-2xl font-bold"
              style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}
            >
              Modules
            </h2>
            <p className="mb-7 font-inter text-sm" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
              Tout ce qu'il vous faut pour passer de "étudiant" à "prêt".
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {FEATURE_MODULES.map((mod) => (
                <div
                  key={mod.title}
                  className="rounded-xl border p-6"
                  style={darkMode
                    ? { ...dk.card, background: "rgba(30,41,59,0.5)" }
                    : { background: "#ffffff", borderColor: T.outlineVar }}
                >
                  <div
                    className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
                    style={darkMode ? { background: dk.iconBg } : { background: `${T.primaryFixed}60` }}
                  >
                    <MSIcon
                      name={mod.icon}
                      size={20}
                      style={{ color: darkMode ? dk.iconColor : T.primary }}
                    />
                  </div>
                  <h3
                    className="mb-2 font-manrope font-semibold"
                    style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}
                  >
                    {mod.title}
                  </h3>
                  <p
                    className="mb-5 font-inter text-sm leading-relaxed"
                    style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}
                  >
                    {mod.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate(mod.action)}
                    className="inline-flex items-center gap-1 font-inter text-sm font-semibold transition-opacity hover:opacity-70"
                    style={{ color: T.primary }}
                  >
                    {mod.cta}
                    <MSIcon name="arrow_forward" size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Recent stations ───────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2
                className="font-manrope text-2xl font-bold"
                style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}
              >
                Stations récentes
              </h2>
              <p className="mt-1 font-inter text-sm" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
                Nouveaux scénarios cliniques ajoutés à la bibliothèque.
              </p>
            </div>
            <button
              onClick={() => onNavigate("library")}
              className="inline-flex items-center gap-1 font-inter text-sm font-semibold transition-opacity hover:opacity-70"
              style={{ color: T.primary }}
            >
              Parcourir tout
              <MSIcon name="arrow_forward" size={16} />
            </button>
          </div>

          {isLoadingCases ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-36 animate-pulse rounded-xl border ${i === 0 ? "lg:col-span-2" : ""}`}
                  style={darkMode ? dk.card : { background: "#ffffff", borderColor: T.outlineVar }}
                />
              ))}
            </div>
          ) : recentCases.length === 0 ? (
            <div
              className="rounded-xl border p-10 text-center"
              style={darkMode ? dk.card : { background: "#ffffff", borderColor: T.outlineVar }}
            >
              <MSIcon name="menu_book" size={40} style={{ color: darkMode ? "#475569" : T.outlineVar }} />
              <p className="mt-3 font-manrope font-semibold" style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}>
                Aucune station dans la bibliothèque
              </p>
              <p className="mt-1 font-inter text-sm" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
                Importez des cas depuis la bibliothèque pour les voir ici.
              </p>
              <button
                onClick={() => onNavigate("library")}
                className="mt-4 rounded-full px-6 py-2.5 font-inter font-semibold text-sm text-white transition-opacity hover:opacity-90"
                style={{ background: T.gradientBtn }}
              >
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
      <footer
        className="mt-10 border-t"
        style={darkMode ? { borderColor: dk.sectionBorder } : { borderColor: T.outlineVar }}
      >
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div>
              <p className="mb-2 font-manrope text-lg font-bold" style={{ color: darkMode ? "#f1f5f9" : T.onSurface }}>
                ECOS<span style={{ color: T.primary }}>-AI</span>
              </p>
              <p className="font-inter text-sm leading-relaxed" style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}>
                La référence pour la préparation aux examens cliniques objectifs structurés,
                propulsé par l'IA vocale Gemini.
              </p>
            </div>
            <div>
              <p
                className="mb-3 font-inter text-xs font-semibold uppercase tracking-wider"
                style={{ color: darkMode ? "#64748b" : T.onSurfaceVar }}
              >
                Ressources
              </p>
              <ul className="space-y-2">
                {[
                  { label: "Bibliothèque ECOS", action: () => onNavigate("library") },
                  { label: "Mode PS / PSS", action: () => onNavigate("ps") },
                  { label: "Mode Sans PS", action: () => onNavigate("sans-ps") },
                ].map((item) => (
                  <li key={item.label}>
                    <button
                      onClick={item.action}
                      className="font-inter text-sm transition-opacity hover:opacity-70"
                      style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p
                className="mb-3 font-inter text-xs font-semibold uppercase tracking-wider"
                style={{ color: darkMode ? "#64748b" : T.onSurfaceVar }}
              >
                Support
              </p>
              <ul className="space-y-2">
                {[
                  { label: "Paramètres", action: onOpenSettings },
                  { label: "Tableau de bord", action: onOpenDashboard },
                ].map((item) => (
                  <li key={item.label}>
                    <button
                      onClick={item.action}
                      className="font-inter text-sm transition-opacity hover:opacity-70"
                      style={{ color: darkMode ? "#94a3b8" : T.onSurfaceVar }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p
            className="mt-8 border-t pt-6 text-center font-inter text-xs"
            style={darkMode
              ? { borderColor: "rgba(255,255,255,0.08)", color: "#475569" }
              : { borderColor: T.outlineVar, color: T.onSurfaceVar }}
          >
            © {new Date().getFullYear()} ECOS-AI — Outil d'entraînement médical
          </p>
        </div>
      </footer>
    </div>
  );
}
