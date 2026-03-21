import type { CSSProperties } from "react";
import type { EvaluationResult } from "./types";

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function parseScore(score?: string) {
  if (!score) {
    return { value: 0, max: 15, ratio: 0 };
  }

  const match = score.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (!match) {
    return { value: 0, max: 15, ratio: 0 };
  }

  const value = Number(match[1].replace(",", "."));
  const max = Number(match[2].replace(",", "."));
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  return { value, max, ratio };
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function scorePalette(ratio: number) {
  if (ratio >= 0.75) {
    return {
      scoreStyle: {
        color: "#059669",
      } satisfies CSSProperties,
      progressStyle: {
        backgroundImage: "linear-gradient(90deg, #059669 0%, #22c55e 100%)",
      } satisfies CSSProperties,
      glowClass: "shadow-[0_18px_48px_rgba(34,197,94,0.18)]",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      badgeClassDark: "border-emerald-500/25 bg-emerald-500/15 text-emerald-300",
    };
  }

  if (ratio >= 0.45) {
    return {
      scoreStyle: {
        color: "#d97706",
      } satisfies CSSProperties,
      progressStyle: {
        backgroundImage: "linear-gradient(90deg, #d97706 0%, #f59e0b 100%)",
      } satisfies CSSProperties,
      glowClass: "shadow-[0_18px_48px_rgba(245,158,11,0.18)]",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
      badgeClassDark: "border-amber-500/25 bg-amber-500/15 text-amber-300",
    };
  }

  return {
    scoreStyle: {
      color: "#ef4444",
    } satisfies CSSProperties,
    progressStyle: {
      backgroundImage: "linear-gradient(90deg, #dc2626 0%, #fb7185 100%)",
    } satisfies CSSProperties,
    glowClass: "shadow-[0_18px_48px_rgba(248,113,113,0.18)]",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
    badgeClassDark: "border-rose-500/25 bg-rose-500/15 text-rose-300",
  };
}

function scoreTone(ratio: number) {
  if (ratio >= 0.75) {
    return "emerald" as const;
  }

  if (ratio >= 0.45) {
    return "amber" as const;
  }

  return "rose" as const;
}

function reportSummaryMessage(ratio: number) {
  if (ratio >= 0.75) {
    return "La station est globalement bien maîtrisée, avec une démonstration solide de la majorité des critères attendus.";
  }

  if (ratio >= 0.45) {
    return "La performance est intermédiaire: plusieurs attendus sont présents, mais certains points clés restent à consolider.";
  }

  return "La station montre encore des lacunes importantes sur plusieurs critères essentiels et nécessite une reprise ciblée.";
}

function buildValidationSummary(observedCount: number, totalCount: number) {
  const isValidated = observedCount >= totalCount / 2;

  if (isValidated) {
    return {
      title: "Synthèse des résultats",
      badge: "Validé",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      badgeClassDark: "border-emerald-500/25 bg-emerald-500/15 text-emerald-300",
      body:
        "Le seuil de validation est atteint. La démarche est globalement recevable, avec quelques points encore perfectibles selon la grille.",
    };
  }

  return {
    title: "Synthèse des résultats",
    badge: "Non validé",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
    badgeClassDark: "border-rose-500/25 bg-rose-500/15 text-rose-300",
    body:
      "Le seuil de validation n'a pas été atteint. Les éléments non observés doivent être retravaillés pour garantir une démarche clinique complète.",
  };
}

type EvaluationReportProps = {
  evaluation: EvaluationResult;
  darkMode: boolean;
  feedbackDetailLabel: string;
  elapsedSeconds?: number;
};

type ImprovementTheme = {
  title: string;
  description: string;
};

function buildImprovementThemes(details: EvaluationResult["details"]): ImprovementTheme[] {
  const missed = details.filter((detail) => !detail.observed);
  const sourceText = missed
    .map((detail) => `${detail.criterion} ${detail.feedback}`.toLowerCase())
    .join(" ");

  const themes: ImprovementTheme[] = [];

  if (/question|interrog|anamn|recherche|explor|demande/.test(sourceText)) {
    themes.push({
      title: "Questionnement clinique",
      description:
        "Poser davantage de questions ouvertes puis fermer pour confirmer les éléments clés utiles à la décision.",
    });
  }

  if (/structur|synth|organis|plan|conduite|raisonnement|prioris/.test(sourceText)) {
    themes.push({
      title: "Structuration des idées",
      description:
        "Hiérarchiser le raisonnement en annonçant l’hypothèse principale, les arguments utiles puis la conduite à tenir.",
    });
  }

  if (/patient|expli|comprend|rassur|communication|vulgar|annonce/.test(sourceText)) {
    themes.push({
      title: "Communication",
      description:
        "Simplifier la formulation et mieux reformuler les points importants pour rendre l’échange plus lisible.",
    });
  }

  if (/diagnostic|critique|urgence|grave|priorit|risque|sévère/.test(sourceText)) {
    themes.push({
      title: "Priorisation clinique",
      description:
        "Mieux expliciter les priorités, les diagnostics à éliminer et les éléments de gravité qui changent la prise en charge.",
    });
  }

  if (themes.length === 0) {
    themes.push({
      title: "Consolidation globale",
      description:
        "La marge de progression porte surtout sur la précision clinique et la clarté d’exposition du raisonnement.",
    });
  }

  return themes.slice(0, 3);
}

function buildRecommendations(evaluation: EvaluationResult) {
  const missed = evaluation.details.filter((detail) => !detail.observed);
  const observed = evaluation.details.filter((detail) => detail.observed);
  const missedText = missed
    .map((detail) => `${detail.criterion} ${detail.feedback}`.toLowerCase())
    .join(" ");

  const candidates = [
    "Refaire la station en chronométrant une première minute dédiée au cadrage initial et aux hypothèses prioritaires.",
    "Terminer chaque séquence importante par une reformulation courte pour rendre le raisonnement explicite pour l’examinateur.",
    "Préparer une check-list mentale très courte des critères majeurs à explorer avant de conclure.",
    "S’entraîner à annoncer plus tôt la conduite à tenir pour montrer une décision clinique structurée.",
  ];

  if (/question|interrog|anamn|recherche|explor|demande/.test(missedText)) {
    candidates.push(
      "Travailler une trame de questions ouvertes puis ciblées afin de ne pas laisser les données clés venir uniquement du patient.",
    );
  }

  if (/structur|synth|organis|plan|raisonnement|prioris/.test(missedText)) {
    candidates.push(
      "Verbaliser un plan constant en trois temps: recueil, interprétation, décision.",
    );
  }

  if (/patient|communication|vulgar|rassur|annonce/.test(missedText)) {
    candidates.push(
      "Utiliser des phrases plus simples et des transitions explicites pour rendre le discours plus pédagogique.",
    );
  }

  if (/urgence|grave|risque|diagnostic|priorit/.test(missedText)) {
    candidates.push(
      "Nommer explicitement les éléments de gravité ou les diagnostics à éliminer pour montrer la hiérarchisation clinique.",
    );
  }

  if (missed.length >= 4) {
    candidates.push(
      "Rejouer la station en format court de 3 à 5 minutes pour consolider d’abord la structure avant de densifier le contenu.",
    );
  }

  if (observed.length >= 3) {
    candidates.push(
      "Capitaliser sur les critères déjà acquis et viser maintenant une restitution plus synthétique et plus affirmée.",
    );
  }

  const uniqueRecommendations = Array.from(new Set(candidates));
  const seed = [
    evaluation.score,
    evaluation.commentary ?? "",
    ...evaluation.details.map((detail) => `${detail.criterion}:${detail.observed}:${detail.feedback}`),
  ].join("|");

  return uniqueRecommendations
    .sort((left, right) => hashString(`${seed}:${left}`) - hashString(`${seed}:${right}`))
    .slice(0, 2);
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function EvaluationReport({
  evaluation,
  darkMode,
  feedbackDetailLabel: _feedbackDetailLabel,
  elapsedSeconds = 0,
}: EvaluationReportProps) {
  const scoreState = parseScore(evaluation.score);
  const observedCount = evaluation.details.filter((detail) => detail.observed).length;
  const totalCount = evaluation.details.length;
  const commentary =
    evaluation.commentary?.trim() || reportSummaryMessage(scoreState.ratio);
  const palette = scorePalette(scoreState.ratio);
  const tone = scoreTone(scoreState.ratio);
  const improvements = buildImprovementThemes(evaluation.details);
  const recommendations = buildRecommendations(evaluation);
  const validationSummary = buildValidationSummary(observedCount, totalCount);
  const ringAngle = Math.max(0, Math.min(360, scoreState.ratio * 360));
  const isValidated = observedCount >= totalCount / 2;
  const verdictTintClass = darkMode
    ? tone === "emerald"
      ? "bg-emerald-500/14"
      : tone === "amber"
        ? "bg-amber-500/14"
        : "bg-rose-500/14"
    : tone === "emerald"
      ? "bg-emerald-100/70"
      : tone === "amber"
        ? "bg-amber-100/75"
        : "bg-rose-100/70";
  const verdictGlowClass = darkMode
    ? tone === "emerald"
      ? "bg-emerald-500/10"
      : tone === "amber"
        ? "bg-amber-500/10"
        : "bg-rose-500/10"
    : tone === "emerald"
      ? "bg-emerald-100/70"
      : tone === "amber"
        ? "bg-amber-100/80"
        : "bg-rose-100/70";
  const pageSectionClass = darkMode
    ? "rounded-[32px] bg-slate-900/72 p-6 shadow-[0_18px_54px_rgba(2,6,23,0.36)] ring-1 ring-inset ring-white/5 backdrop-blur-xl"
    : "rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm";
  const titleClass = darkMode ? "text-slate-50" : "text-slate-900";
  const bodyClass = darkMode ? "text-slate-300" : "text-slate-700";
  const mutedClass = darkMode ? "text-slate-400" : "text-slate-500";
  const verdictPanelClass = darkMode
    ? "rounded-[32px] bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(10,17,32,0.98))] p-6 shadow-[0_22px_68px_rgba(2,6,23,0.42)] ring-1 ring-inset ring-white/5"
    : "rounded-[32px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]";
  const verdictAsideClass = darkMode
    ? "bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.08),transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.9),rgba(8,15,30,0.95))]"
    : "border-slate-200 bg-[radial-gradient(circle_at_top,rgba(251,113,133,0.10),transparent_55%),linear-gradient(180deg,#fffdfd_0%,#fff8f8_100%)]";
  const verdictMetricClass = darkMode
    ? "rounded-2xl bg-slate-950/54 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
    : "rounded-2xl border border-slate-200 bg-slate-50/72 px-4 py-4";
  const tableWrapClass = darkMode
    ? "overflow-x-auto rounded-[28px] bg-slate-950/72"
    : "overflow-x-auto rounded-[28px] border border-slate-200 bg-white";
  const tableHeadClass = darkMode ? "bg-slate-900/95" : "bg-slate-100";
  const tableBodyClass = darkMode ? "bg-slate-950/68" : "bg-white";
  const tableRowClass = darkMode ? "border-t border-white/10 align-top" : "border-t border-slate-200 align-top";
  const narrativePanelClass = darkMode
    ? "rounded-[32px] bg-[linear-gradient(180deg,rgba(18,25,42,0.96),rgba(15,23,42,0.98))] p-6 shadow-[0_20px_64px_rgba(2,6,23,0.36)] ring-1 ring-inset ring-white/5"
    : "rounded-[32px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] p-6 shadow-sm";
  const narrativeBodyClass = darkMode
    ? "rounded-[26px] bg-slate-950/38 p-5"
    : "rounded-[26px] border border-slate-200 bg-slate-50/72 p-5";
  const themeCardClass = darkMode
    ? "rounded-[24px] bg-slate-900/48 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
    : "rounded-[24px] border border-slate-200 bg-white p-4";
  const planPanelClass = darkMode
    ? "rounded-[32px] bg-[linear-gradient(180deg,rgba(18,25,42,0.96),rgba(15,23,42,0.985))] p-6 shadow-[0_20px_64px_rgba(2,6,23,0.38)] ring-1 ring-inset ring-white/5"
    : "rounded-[32px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] p-6 shadow-sm";
  const planItemClass = darkMode
    ? "rounded-2xl bg-slate-900/48 px-4 py-4"
    : "rounded-2xl border border-slate-200 bg-white px-4 py-4";

  return (
    <div className="space-y-6">
      <section className={verdictPanelClass}>
        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div
            className={`relative flex items-center justify-center rounded-[28px] border px-6 py-8 ${
              tone === "emerald"
                ? darkMode
                  ? "border-transparent"
                  : "border-emerald-100"
                : tone === "amber"
                  ? darkMode
                    ? "border-transparent"
                    : "border-amber-100"
                  : darkMode
                    ? "border-transparent"
                    : "border-rose-100"
            } ${verdictAsideClass}`}
          >
            <div
              className={`absolute left-10 top-10 h-28 w-28 rounded-full blur-3xl ${
                tone === "emerald"
                  ? darkMode
                    ? "bg-emerald-500/15"
                    : "bg-emerald-200/40"
                  : tone === "amber"
                    ? darkMode
                      ? "bg-amber-500/15"
                      : "bg-amber-200/40"
                  : darkMode
                    ? "bg-rose-500/15"
                    : "bg-rose-200/40"
              }`}
            />
            <div
              className={`absolute bottom-10 right-8 h-24 w-24 rounded-full blur-3xl ${
                tone === "emerald"
                  ? darkMode
                    ? "bg-sky-500/12"
                    : "bg-sky-200/25"
                  : tone === "amber"
                    ? darkMode
                      ? "bg-rose-400/12"
                      : "bg-rose-200/20"
                    : darkMode
                      ? "bg-amber-400/12"
                      : "bg-amber-200/20"
              }`}
            />
            <div
              className={`absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${
                darkMode
                  ? "bg-white/10"
                  : isValidated
                    ? "bg-white/70"
                    : "bg-white/60"
              }`}
            />
            <div className="text-center">
              <div
                data-testid="score-ring"
                className="mx-auto flex h-44 w-44 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(from 180deg, transparent 0deg, transparent ${
                    360 - ringAngle
                  }deg, ${tone === "emerald" ? "#22c55e" : tone === "amber" ? "#f59e0b" : "#ef4444"} ${
                    360 - ringAngle
                  }deg, ${tone === "emerald" ? "#059669" : tone === "amber" ? "#d97706" : "#dc2626"} 360deg)`,
                }}
              >
                <div
                  data-testid="score-core"
                  className={`relative flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full ring-1 ring-inset ${
                    darkMode ? "ring-white/0" : "ring-white/50"
                  } ${verdictTintClass}`}
                >
                  <div className={`absolute inset-5 rounded-full blur-2xl ${verdictGlowClass}`} />
                  <div className="flex items-end gap-1">
                    <span
                      className="relative text-5xl font-black tracking-tighter"
                      style={palette.scoreStyle}
                    >
                      {scoreState.value}
                    </span>
                    <span className={`relative pb-1 text-2xl font-black tracking-tighter ${darkMode ? "text-slate-500" : "text-slate-300"}`}>
                      /{scoreState.max}
                    </span>
                  </div>
                </div>
              </div>
              <span
                className={`mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.16em] ${darkMode ? "" : "ring-1 ring-inset ring-white/50"} ${darkMode ? validationSummary.badgeClassDark : validationSummary.badgeClass}`}
              >
                <span
                  className={`h-2 w-2 animate-pulse rounded-full ${
                    isValidated ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                {validationSummary.badge}
              </span>
              <p className={`mt-3 text-[10px] font-semibold uppercase tracking-[0.15em] ${mutedClass}`}>
                Note finale
              </p>
            </div>
          </div>

          <div className={`min-w-0 xl:border-l xl:pl-10 ${darkMode ? "xl:border-white/10" : "xl:border-slate-200"}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${mutedClass}`}>
                  Rapport examinateur
                </p>
                <h3 className={`mt-3 text-4xl font-bold tracking-tight ${titleClass}`}>
                  {validationSummary.title}
                </h3>
                <p className={`mt-4 text-lg leading-8 ${bodyClass}`}>
                  {validationSummary.body}
                </p>
              </div>
              <div className={`inline-flex w-fit items-center rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${
                darkMode
                  ? "border-white/0 bg-white/[0.04] text-slate-300"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}>
                {observedCount} / {totalCount} critères observés
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className={`flex items-center gap-4 ${verdictMetricClass}`}>
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-emerald-600 ${darkMode ? "border-emerald-400/25 bg-emerald-500/10 ring-1 ring-inset ring-white/10" : "border-emerald-200 bg-emerald-50 ring-1 ring-inset ring-white/50"}`}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M7 12.5 10 15.5 17 8.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M7 4.5h7l3 3v12H7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex flex-col justify-center">
                  <p className={`mb-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.18em] ${mutedClass}`}>Observé</p>
                  <p className={`text-4xl font-bold leading-none tracking-tight ${titleClass}`}>{observedCount}</p>
                </div>
              </div>

              <div className={`flex items-center gap-4 ${verdictMetricClass}`}>
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-rose-600 ${darkMode ? "border-rose-400/25 bg-rose-500/10 ring-1 ring-inset ring-white/10" : "border-rose-200 bg-rose-50 ring-1 ring-inset ring-white/50"}`}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M8 8l8 8M16 8l-8 8" strokeLinecap="round" />
                    <path d="M7 4.5h7l3 3v12H7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex flex-col justify-center">
                  <p className={`mb-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.18em] ${mutedClass}`}>Non observé</p>
                  <p className={`text-4xl font-bold leading-none tracking-tight ${titleClass}`}>{totalCount - observedCount}</p>
                </div>
              </div>

              <div className={`flex items-center gap-4 ${verdictMetricClass}`}>
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-sky-600 ${darkMode ? "border-sky-400/25 bg-sky-500/10 ring-1 ring-inset ring-white/10" : "border-sky-200 bg-sky-50 ring-1 ring-inset ring-white/50"}`}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex flex-col justify-center">
                  <p className={`mb-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.18em] ${mutedClass}`}>Temps</p>
                  <p className={`text-4xl font-bold leading-none tracking-tight ${titleClass}`}>{formatClock(elapsedSeconds)}</p>
                </div>
              </div>
            </div>

            <div className={`mt-8 rounded-[24px] border px-5 py-4 ${
              darkMode
                ? "border-white/0 bg-white/[0.04]"
                : "border-slate-200 bg-slate-50/80"
            }`}>
              <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${mutedClass}`}>
                Lecture globale
              </p>
              <p className={`mt-2 text-base leading-7 ${bodyClass}`}>
                {reportSummaryMessage(scoreState.ratio)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={pageSectionClass}>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className={`text-lg font-semibold ${titleClass}`}>
              Grille détaillée
            </h3>
            <p className={`mt-1 text-sm ${mutedClass}`}>
              Lecture critère par critère de la performance observée.
            </p>
          </div>
          <div className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-medium ${darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
            {evaluation.details.length} critères
          </div>
        </div>

        <div className={tableWrapClass}>
          <table className="min-w-full border-collapse">
            <thead className={tableHeadClass}>
              <tr className="text-left">
                <th className={`px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] ${mutedClass}`}>
                  Critère
                </th>
                <th className={`w-[170px] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] ${mutedClass}`}>
                  Statut
                </th>
                <th className={`px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] ${mutedClass}`}>
                  Observation étudiant
                </th>
              </tr>
            </thead>
            <tbody className={tableBodyClass}>
              {evaluation.details.map((detail, index) => (
                <tr
                  key={`${detail.criterion}-${index}`}
                  className={tableRowClass}
                >
                  <td className={`px-5 py-4 text-sm font-semibold leading-7 ${titleClass}`}>
                    {detail.criterion}
                  </td>
                  <td className="w-[170px] px-5 py-4">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold ${
                        detail.observed
                          ? darkMode
                            ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : darkMode
                            ? "border-rose-500/25 bg-rose-500/15 text-rose-300"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {detail.observed ? "Observé" : "Non observé"}
                    </span>
                  </td>
                  <td className={`px-5 py-4 text-sm leading-7 ${bodyClass}`}>
                    {detail.feedback}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={narrativePanelClass}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${mutedClass}`}>
              Conclusion pédagogique
            </p>
            <h3 className={`mt-2 text-2xl font-bold tracking-tight ${titleClass}`}>
              Commentaire examinateur
            </h3>
          </div>
          <div className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
            darkMode
              ? "border-white/0 bg-white/[0.04] text-slate-300"
              : "border-slate-200 bg-white text-slate-600"
          }`}>
            Synthèse narrative
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className={narrativeBodyClass}>
            <p className={`max-w-4xl text-sm leading-8 ${bodyClass}`}>
              {commentary}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {improvements.map((theme) => (
              <div key={theme.title} className={themeCardClass}>
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                    mutedClass
                  }`}
                >
                  Axe prioritaire
                </p>
                <p className={`mt-3 text-base font-semibold ${titleClass}`}>
                  {theme.title}
                </p>
                <p className={`mt-2 text-sm leading-7 ${bodyClass}`}>
                  {theme.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={planPanelClass}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${mutedClass}`}>
              Plan d'amélioration
            </p>
            <h3 className={`mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight ${titleClass}`}>
              Recommandations
              <div className="group relative">
                <button
                  type="button"
                  className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                    darkMode
                      ? "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                      : "border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
                  }`}
                  aria-label="Informations sur les recommandations"
                >
                  <InfoIcon className="h-3.5 w-3.5" />
                </button>
                <div
                  className={`pointer-events-none absolute left-0 top-full z-20 mt-2 w-80 rounded-2xl border px-4 py-3 text-sm font-normal leading-relaxed opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
                    darkMode
                      ? "border-slate-700 bg-slate-900 text-slate-200"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  Deux axes concrets pour retravailler la station au prochain passage, générés à partir des critères non observés.
                </div>
              </div>
            </h3>
          </div>
          <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
            darkMode
              ? "border-white/0 bg-white/[0.04] text-slate-300"
              : "border-slate-200 bg-white text-slate-600"
          }`}>
            Plan suivant
          </span>
        </div>

        <ul className="mt-5 space-y-3">
          {recommendations.map((recommendation, index) => (
            <li key={`${recommendation}-${index}`} className={planItemClass}>
              <div className="flex gap-3">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${darkMode ? "bg-slate-300/80" : "bg-amber-500"}`} />
                <p className={`text-sm leading-7 ${bodyClass}`}>
                  {recommendation}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
