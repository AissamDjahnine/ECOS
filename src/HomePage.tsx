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

// ── Icon helper ───────────────────────────────────────────────────────────────
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

// ── Design tokens ─────────────────────────────────────────────────────────────
const P = "#006767";          // primary teal
const PC = "#008282";         // primary container
const PF = "#8cf3f3";         // primary fixed (light cyan)
const OV = "#bcc9c8";         // outline variant
const OS = "#181c20";         // on surface (headings)
const OSV = "#3d4949";        // on surface variant (body)
const SURF = "#f7f9fe";       // surface background
const GRAD = `linear-gradient(135deg, ${P} 0%, ${PC} 100%)`;

// ── Difficulty helpers ────────────────────────────────────────────────────────
const DIFF_COLORS: Record<CaseDifficulty, { light: string; dark: string }> = {
  facile:    { light: "bg-emerald-50 text-emerald-700 border-emerald-200", dark: "bg-emerald-900/30 text-emerald-300 border-emerald-700/40" },
  moyen:     { light: "bg-amber-50 text-amber-700 border-amber-200",       dark: "bg-amber-900/30 text-amber-300 border-amber-700/40" },
  difficile: { light: "bg-rose-50 text-rose-700 border-rose-200",          dark: "bg-rose-900/30 text-rose-300 border-rose-700/40" },
};
const DIFF_LABEL: Record<CaseDifficulty, string> = { facile: "Facile", moyen: "Moyen", difficile: "Difficile" };
const MODE_LABEL: Record<string, string> = { ps: "PS / PSS", "sans-ps": "Sans PS", both: "PS & Sans PS" };

// ── Workflow steps ────────────────────────────────────────────────────────────
const STEPS = [
  { n: "01", title: "Sélectionnez", desc: "Choisissez votre station sur Hypocampus." },
  { n: "02", title: "Copiez",       desc: "L'énoncé depuis votre source." },
  { n: "03", title: "Collez",       desc: "Dans le simulateur ECOS-AI." },
  { n: "04", title: "Simulez",      desc: "Lancez l'IA vocale en temps réel." },
  { n: "05", title: "Débriefez",    desc: "Obtenez grille, score et exports PDF/Audio." },
];

// ── Pricing plans ─────────────────────────────────────────────────────────────
const PLAN_FREE = [
  { ok: true,  label: "25 stations « Découverte »" },
  { ok: true,  label: "1 essai par station" },
  { ok: true,  label: "Feedback basique" },
  { ok: false, label: "Suivi de performance" },
];
const PLAN_PREMIUM = [
  { label: "+300 stations R2C / Hypocampus" },
  { label: "2 essais par station" },
  { label: "Suivi de performance complet" },
  { label: "Exports PDF / Audio illimités" },
  { label: "Analyse détaillée par item" },
];

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
  const [isLoadingCases, setIsLoadingCases] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/cases");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { cases: LibraryCaseSummary[] };
        const sorted = [...data.cases].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        setRecentCases(sorted.slice(0, 3));
      } catch {
        onShowToast?.("Erreur", "Impossible de charger les stations.", "error");
      } finally {
        setIsLoadingCases(false);
      }
    }
    void load();
  }, [onShowToast]);

  // Dark mode shorthands
  const bg = darkMode ? "#0f172a" : "#ffffff";
  const headColor = darkMode ? "#f1f5f9" : OS;
  const subColor = darkMode ? "#94a3b8" : OSV;
  const cardStyle = darkMode
    ? { background: "rgba(30,41,59,0.6)", borderColor: "rgba(255,255,255,0.08)" }
    : { background: "#ffffff", borderColor: OV };
  const sectionBg = darkMode ? "#0f172a" : "#ffffff";

  return (
    <div className="min-h-screen font-inter" style={{ background: darkMode ? bg : SURF }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <header
        className="sticky top-0 z-30 border-b"
        style={{
          background: darkMode ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.85)",
          borderColor: darkMode ? "rgba(255,255,255,0.08)" : OV,
          backdropFilter: "blur(24px)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 gap-4">
          {/* Brand block */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl shadow-sm"
              style={{ background: `linear-gradient(135deg, ${PC} 0%, #004f4f 100%)` }}
            >
              {/* Waveform icon */}
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <p className="font-manrope text-base font-bold leading-tight tracking-tight" style={{ color: headColor }}>
                ECOS-AI
              </p>
              <p className="font-inter text-xs leading-tight" style={{ color: darkMode ? "#94a3b8" : OSV }}>
                Simulateur d'examen clinique
              </p>
            </div>
          </div>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {[
              { label: "Bibliothèque", action: () => onNavigate("library") },
              { label: "Comment ça marche", action: () => document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" }) },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className="px-4 py-2 text-sm font-manrope font-medium rounded-lg transition-colors"
                style={{ color: subColor }}
                onMouseEnter={(e) => (e.currentTarget.style.color = headColor)}
                onMouseLeave={(e) => (e.currentTarget.style.color = subColor)}
              >
                {item.label}
              </button>
            ))}
            {/* Active item */}
            <button
              className="px-4 py-2 text-sm font-manrope font-semibold rounded-lg relative"
              style={{ color: P }}
            >
              Simulateur
              <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full" style={{ background: P }} />
            </button>
            <button
              className="px-4 py-2 text-sm font-manrope font-medium rounded-lg opacity-40 cursor-default"
              style={{ color: subColor }}
            >
              Mon Parcours
            </button>
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenDashboard}
              className="rounded-full border px-4 py-1.5 text-sm font-manrope font-medium transition-colors"
              style={darkMode
                ? { borderColor: "rgba(255,255,255,0.15)", color: "#cbd5e1" }
                : { borderColor: OV, color: OS }}
            >
              Tableau de bord
            </button>
            <button
              onClick={() => onDarkModeChange(!darkMode)}
              className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
              style={cardStyle}
              title="Thème"
            >
              <MSIcon name={darkMode ? "light_mode" : "dark_mode"} size={16} style={{ color: subColor }} />
            </button>
          </div>
        </div>
      </header>

      {/* ══ HERO ════════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:items-center">

          {/* Left — copy */}
          <div>
            {/* Badge */}
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-inter font-semibold uppercase tracking-widest"
              style={{ background: `${PF}35`, color: P }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: P }} />
              Patient virtuel réactif
            </div>

            {/* Heading */}
            <h1 className="font-manrope font-extrabold leading-[1.08] tracking-tight mb-6" style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)", color: headColor }}>
              Préparez vos ECOS<br />
              avec l'IA{" "}
              <em className="not-italic" style={{ color: P, fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif" }}>
                en temps
              </em>
              <br />
              <em style={{ color: P, fontFamily: "Georgia, 'Times New Roman', serif" }}>réel</em>
            </h1>

            {/* Body */}
            <p className="font-inter text-base leading-relaxed mb-8 max-w-md" style={{ color: subColor }}>
              Simulez vos fiches Hypocampus avec une IA qui connaît vos grilles de correction.
              Compatible avec les standards{" "}
              <strong style={{ color: headColor, fontWeight: 600 }}>Hypocampus / OSCE</strong>{" "}
              pour une préparation aux ECOS 2026 sans compromis.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => onNavigate("ps")}
                className="rounded-full px-6 py-3 font-inter font-semibold text-sm text-white transition-opacity hover:opacity-90"
                style={{ background: GRAD }}
              >
                Essai gratuit (5 stations)
              </button>
              <button
                onClick={() => onNavigate("library")}
                className="rounded-full border px-6 py-3 font-inter font-semibold text-sm transition-colors"
                style={darkMode
                  ? { borderColor: "rgba(255,255,255,0.2)", color: "#cbd5e1" }
                  : { borderColor: OS, color: OS }}
              >
                Accès Premium
              </button>
            </div>
          </div>

          {/* Right — Live Transcription mockup */}
          <div className="hidden lg:flex justify-end">
            <div
              className="w-80 rounded-2xl border shadow-elevated overflow-hidden"
              style={{ background: "#ffffff", borderColor: OV }}
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: OV }}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-manrope text-xs font-semibold" style={{ color: OS }}>Live Transcription</span>
                </div>
                <span className="font-inter text-xs" style={{ color: OSV }}>04:12 / 10:08</span>
              </div>
              {/* Messages */}
              <div className="p-4 space-y-3">
                {/* Student message */}
                <div className="flex items-start gap-2">
                  <div
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-xs font-manrope font-bold text-white"
                    style={{ background: GRAD }}
                  >
                    ET
                  </div>
                  <div
                    className="rounded-xl rounded-tl-none px-3 py-2 text-xs font-inter leading-relaxed"
                    style={{ background: `${PF}30`, color: OS, maxWidth: "85%" }}
                  >
                    "Bonjour Monsieur Martin, je suis l'étudiant en charge de votre examen aujourd'hui. Pouvez-vous me décrire votre douleur ?"
                  </div>
                </div>
                {/* Patient message */}
                <div className="flex items-start gap-2 flex-row-reverse">
                  <div
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-xs font-manrope font-bold text-white"
                    style={{ background: "#8f4922" }}
                  >
                    PM
                  </div>
                  <div
                    className="rounded-xl rounded-tr-none px-3 py-2 text-xs font-inter leading-relaxed text-white"
                    style={{ background: GRAD, maxWidth: "85%" }}
                  >
                    "Bonjour… C'est comme un poids sur ma poitrine, ça me lance dans le bras gauche depuis une heure."
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ WORKFLOW ════════════════════════════════════════════════════════ */}
      <section
        id="workflow"
        className="border-t border-b py-20"
        style={{
          borderColor: darkMode ? "rgba(255,255,255,0.06)" : OV,
          background: darkMode ? "#0a1020" : "#ffffff",
        }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <h2
            className="font-manrope font-bold text-center mb-3"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", color: headColor }}
          >
            Travaillez vos dossiers Hypocampus avec l'IA
          </h2>
          <p className="font-inter text-sm text-center mb-14 max-w-md mx-auto" style={{ color: subColor }}>
            Transformez vos fiches de révision en simulations réelles en moins de 2 minutes.
          </p>

          {/* Steps */}
          <div className="flex items-start justify-between gap-0">
            {STEPS.map((step, i) => {
              const isLast = i === STEPS.length - 1;
              const isActive = isLast;
              return (
                <React.Fragment key={step.n}>
                  <div className="flex flex-col items-center text-center flex-1 min-w-0 px-1">
                    {/* Circle */}
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full border-2 font-manrope font-bold text-sm mb-3 shrink-0"
                      style={isActive
                        ? { background: GRAD, borderColor: "transparent", color: "#ffffff" }
                        : { borderColor: darkMode ? "rgba(255,255,255,0.2)" : OV, color: darkMode ? "#94a3b8" : OSV, background: "transparent" }}
                    >
                      {step.n}
                    </div>
                    <p className="font-manrope font-semibold text-sm mb-1" style={{ color: isActive ? P : headColor }}>
                      {step.title}
                    </p>
                    <p className="font-inter text-xs leading-snug" style={{ color: subColor }}>
                      {step.desc}
                    </p>
                  </div>
                  {/* Connector line between circles */}
                  {!isLast && (
                    <div
                      className="h-px mt-5 shrink-0"
                      style={{ width: "2rem", background: darkMode ? "rgba(255,255,255,0.12)" : OV }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ COMPLIANCE BANNER ═══════════════════════════════════════════════ */}
      <div
        className="py-4"
        style={{ background: darkMode ? "#022020" : "#004545" }}
      >
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-center gap-2">
          <MSIcon name="verified" size={16} className="text-white opacity-90" />
          <p className="font-inter text-sm font-medium text-center" style={{ color: "rgba(255,255,255,0.9)" }}>
            Stations 100% conformes aux référentiels officiels de la R2C 2025.
          </p>
        </div>
      </div>

      {/* ══ NEW STATIONS ════════════════════════════════════════════════════ */}
      <section className="py-16" style={{ background: sectionBg }}>
        <div className="mx-auto max-w-6xl px-6">
          {/* Header row */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2
                className="font-manrope font-bold mb-1"
                style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", color: headColor }}
              >
                Nouvelles stations ECOS
              </h2>
              <p className="font-inter text-sm" style={{ color: subColor }}>
                Contenu mis à jour quotidiennement selon les recommandations HAS.
              </p>
            </div>
            <button
              onClick={() => onNavigate("library")}
              className="hidden sm:inline-flex items-center gap-1 font-inter text-sm font-semibold shrink-0 transition-opacity hover:opacity-70"
              style={{ color: P }}
            >
              Voir la librairie complète
              <MSIcon name="arrow_forward" size={16} style={{ color: P }} />
            </button>
          </div>

          {/* Cards grid */}
          {isLoadingCases ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`animate-pulse rounded-xl border ${i === 0 ? "lg:col-span-1 lg:row-span-2 h-72" : "h-28"}`}
                  style={cardStyle}
                />
              ))}
            </div>
          ) : recentCases.length === 0 ? (
            <div
              className="rounded-xl border py-16 text-center"
              style={cardStyle}
            >
              <MSIcon name="menu_book" size={40} style={{ color: OV }} />
              <p className="mt-3 font-manrope font-semibold" style={{ color: headColor }}>
                Aucune station disponible
              </p>
              <button
                onClick={() => onNavigate("library")}
                className="mt-4 rounded-full px-6 py-2.5 text-sm font-inter font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background: GRAD }}
              >
                Ouvrir la bibliothèque
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Large featured card */}
              <div
                className="lg:col-span-1 lg:row-span-3 rounded-xl border overflow-hidden flex flex-col"
                style={cardStyle}
              >
                {recentCases[0] && (
                  <>
                    <div className="p-5 flex-1">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-inter font-semibold mb-3"
                        style={{ background: `${PF}40`, color: P }}
                      >
                        {recentCases[0].specialty || "Général"}
                      </span>
                      <h3
                        className="font-manrope font-bold text-lg leading-snug mb-3"
                        style={{ color: headColor }}
                      >
                        {recentCases[0].title}
                      </h3>
                      <p className="font-inter text-sm leading-relaxed" style={{ color: subColor }}>
                        {MODE_LABEL[recentCases[0].mode]} · {DIFF_LABEL[recentCases[0].difficulty]}
                      </p>
                    </div>
                    {/* Visual accent */}
                    <div
                      className="h-40 flex items-center justify-center"
                      style={{ background: GRAD }}
                    >
                      <MSIcon name="medical_information" size={64} className="opacity-30 text-white" />
                    </div>
                  </>
                )}
              </div>

              {/* Right column — 2 small cards + upsell */}
              <div className="lg:col-span-2 grid grid-cols-1 gap-4">
                {recentCases[1] && (
                  <div
                    className="rounded-xl border p-4 flex items-center gap-4"
                    style={cardStyle}
                  >
                    <div
                      className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ background: `${PF}40` }}
                    >
                      <MSIcon name="stethoscope" size={20} style={{ color: P }} />
                    </div>
                    <div className="min-w-0">
                      <span
                        className="text-xs font-inter font-semibold uppercase tracking-wider"
                        style={{ color: P }}
                      >
                        {recentCases[1].specialty || "Général"}
                      </span>
                      <p className="font-manrope font-semibold text-sm mt-0.5 truncate" style={{ color: headColor }}>
                        {recentCases[1].title}
                      </p>
                      <p className="font-inter text-xs mt-0.5" style={{ color: subColor }}>
                        {MODE_LABEL[recentCases[1].mode]}
                      </p>
                    </div>
                  </div>
                )}

                {recentCases[2] && (
                  <div
                    className="rounded-xl border p-4 flex items-center justify-between gap-4"
                    style={cardStyle}
                  >
                    <div className="min-w-0">
                      <span
                        className="text-xs font-inter font-semibold uppercase tracking-wider"
                        style={{ color: P }}
                      >
                        {recentCases[2].specialty || "Général"}
                      </span>
                      <p className="font-manrope font-semibold text-sm mt-0.5 truncate" style={{ color: headColor }}>
                        {recentCases[2].title}
                      </p>
                      <p className="font-inter text-xs mt-0.5" style={{ color: subColor }}>
                        {MODE_LABEL[recentCases[2].mode]}
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigate("library")}
                      className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-white transition-opacity hover:opacity-80"
                      style={{ background: GRAD }}
                    >
                      <MSIcon name="play_arrow" size={18} className="text-white" />
                    </button>
                  </div>
                )}

                {/* Upsell card */}
                <div
                  className="rounded-xl p-5"
                  style={{ background: GRAD }}
                >
                  <p className="font-manrope font-bold text-white text-base mb-1">
                    Débloquez 500+ stations spécialisées
                  </p>
                  <p className="font-inter text-xs text-white opacity-80 mb-4">
                    Urologie, Gynécologie, Psychiatrie et plus encore.
                  </p>
                  <button
                    onClick={() => onNavigate("library")}
                    className="font-inter text-sm font-semibold underline text-white opacity-90 hover:opacity-100 transition-opacity"
                  >
                    Passer au Premium
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══ PRICING ═════════════════════════════════════════════════════════ */}
      <section
        className="py-20 border-t"
        style={{
          borderColor: darkMode ? "rgba(255,255,255,0.06)" : OV,
          background: darkMode ? "#0a1020" : SURF,
        }}
      >
        <div className="mx-auto max-w-4xl px-6">
          <h2
            className="font-manrope font-bold text-center mb-2"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", color: headColor }}
          >
            Choisissez votre mode de préparation
          </h2>
          <p className="font-inter text-sm text-center mb-12" style={{ color: subColor }}>
            Des outils précis pour chaque étape de votre externat.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Free plan */}
            <div
              className="rounded-2xl border p-8"
              style={darkMode ? cardStyle : { background: "#ffffff", borderColor: OV }}
            >
              <p className="font-manrope font-semibold text-base mb-1" style={{ color: headColor }}>
                Découverte
              </p>
              <div className="flex items-end gap-1 mb-6">
                <span className="font-manrope font-extrabold" style={{ fontSize: "2.5rem", color: headColor, lineHeight: 1 }}>
                  0€
                </span>
                <span className="font-inter text-sm mb-1" style={{ color: subColor }}>/mois</span>
              </div>
              <ul className="space-y-3 mb-8">
                {PLAN_FREE.map((f) => (
                  <li key={f.label} className="flex items-center gap-2.5">
                    {f.ok
                      ? <MSIcon name="check_circle" size={16} style={{ color: P }} />
                      : <MSIcon name="close" size={16} style={{ color: darkMode ? "#475569" : OV }} />}
                    <span
                      className="font-inter text-sm"
                      style={{ color: f.ok ? (darkMode ? "#cbd5e1" : OS) : (darkMode ? "#475569" : "#9ca3af") }}
                    >
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onNavigate("ps")}
                className="w-full rounded-full border py-3 font-inter font-semibold text-sm transition-colors hover:bg-black/5"
                style={{ borderColor: darkMode ? "rgba(255,255,255,0.2)" : OS, color: darkMode ? "#cbd5e1" : OS }}
              >
                Commencer maintenant
              </button>
            </div>

            {/* Premium plan */}
            <div
              className="rounded-2xl border-2 p-8 relative"
              style={{ borderColor: P, background: darkMode ? "rgba(0,103,103,0.08)" : "#ffffff" }}
            >
              {/* Badge */}
              <div
                className="absolute -top-3 right-6 rounded-full px-3 py-1 text-xs font-inter font-bold text-white uppercase tracking-wider"
                style={{ background: GRAD }}
              >
                Recommandé
              </div>
              <p className="font-manrope font-semibold text-base mb-1" style={{ color: headColor }}>
                Premium
              </p>
              <div className="flex items-end gap-1 mb-6">
                <span className="font-manrope font-extrabold" style={{ fontSize: "2.5rem", color: headColor, lineHeight: 1 }}>
                  9.99€
                </span>
                <span className="font-inter text-sm mb-1" style={{ color: subColor }}>/mois</span>
              </div>
              <ul className="space-y-3 mb-8">
                {PLAN_PREMIUM.map((f) => (
                  <li key={f.label} className="flex items-center gap-2.5">
                    <MSIcon name="check_circle" size={16} style={{ color: P }} />
                    <span className="font-inter text-sm" style={{ color: darkMode ? "#cbd5e1" : OS }}>
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onNavigate("ps")}
                className="w-full rounded-full py-3 font-inter font-semibold text-sm text-white transition-opacity hover:opacity-90"
                style={{ background: GRAD }}
              >
                S'abonner maintenant
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <footer
        className="border-t py-12"
        style={{
          borderColor: darkMode ? "rgba(255,255,255,0.06)" : OV,
          background: darkMode ? "#0f172a" : "#ffffff",
        }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <p className="font-manrope text-base font-bold mb-2" style={{ color: headColor }}>
                ECOS<span style={{ color: P }}>-AI</span>
              </p>
              <p className="font-inter text-xs leading-relaxed" style={{ color: subColor }}>
                Le futur de la simulation médicale pour les futurs praticiens. Précision. Professionnalisme. Performance.
              </p>
            </div>
            {/* Ressources */}
            <div>
              <p className="font-manrope text-xs font-bold uppercase tracking-wider mb-4" style={{ color: headColor }}>
                Ressources
              </p>
              <ul className="space-y-2.5">
                {["Blog ECOS 2026", "Documentation", "Support"].map((label) => (
                  <li key={label}>
                    <button className="font-inter text-xs transition-opacity hover:opacity-60" style={{ color: subColor }}>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {/* Légal */}
            <div>
              <p className="font-manrope text-xs font-bold uppercase tracking-wider mb-4" style={{ color: headColor }}>
                Légal
              </p>
              <ul className="space-y-2.5">
                {["Confidentialité", "CGV / CGU"].map((label) => (
                  <li key={label}>
                    <button className="font-inter text-xs transition-opacity hover:opacity-60" style={{ color: subColor }}>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {/* Contact */}
            <div>
              <p className="font-manrope text-xs font-bold uppercase tracking-wider mb-4" style={{ color: headColor }}>
                Contact
              </p>
              <ul className="space-y-2.5">
                <li>
                  <button
                    onClick={onOpenSettings}
                    className="font-inter text-xs transition-opacity hover:opacity-60"
                    style={{ color: subColor }}
                  >
                    Contacter un Expert
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div
            className="flex items-center justify-between border-t pt-6"
            style={{ borderColor: darkMode ? "rgba(255,255,255,0.06)" : OV }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <p className="font-inter text-xs" style={{ color: darkMode ? "#475569" : "#9ca3af" }}>
                © 2026 ECOS-AI Clinical Simulation Systems. Préparation ECOS 2026.
              </p>
              <div
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-inter font-medium w-fit"
                style={{ borderColor: `${P}40`, color: P, background: `${PF}20` }}
              >
                <MSIcon name="verified" size={12} style={{ color: P }} />
                Conforme référentiel R2C &amp; EDN
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDarkModeChange(!darkMode)}
                className="flex h-7 w-7 items-center justify-center rounded-full border transition-colors"
                style={{ borderColor: darkMode ? "rgba(255,255,255,0.1)" : OV }}
              >
                <MSIcon name={darkMode ? "light_mode" : "dark_mode"} size={14} style={{ color: subColor }} />
              </button>
              <button
                onClick={onOpenSettings}
                className="flex h-7 w-7 items-center justify-center rounded-full border transition-colors"
                style={{ borderColor: darkMode ? "rgba(255,255,255,0.1)" : OV }}
              >
                <MSIcon name="settings" size={14} style={{ color: subColor }} />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
