import type { CSSProperties } from "react";
import type { EvaluationResult } from "./types";

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
  };
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
      body:
        "Le seuil de validation est atteint. La démarche est globalement recevable, avec quelques points encore perfectibles selon la grille.",
    };
  }

  return {
    title: "Synthèse des résultats",
    badge: "Non validé",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
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
  darkMode: _darkMode,
  feedbackDetailLabel: _feedbackDetailLabel,
  elapsedSeconds = 0,
}: EvaluationReportProps) {
  const scoreState = parseScore(evaluation.score);
  const observedCount = evaluation.details.filter((detail) => detail.observed).length;
  const totalCount = evaluation.details.length;
  const commentary =
    evaluation.commentary?.trim() || reportSummaryMessage(scoreState.ratio);
  const palette = scorePalette(scoreState.ratio);
  const improvements = buildImprovementThemes(evaluation.details);
  const recommendations = buildRecommendations(evaluation);
  const validationSummary = buildValidationSummary(observedCount, totalCount);
  const ringAngle = Math.max(0, Math.min(360, scoreState.ratio * 360));
  const isValidated = observedCount >= totalCount / 2;
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div
            className={`relative flex items-center justify-center rounded-[28px] border px-6 py-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 ${
              isValidated
                ? "border-primary-100 bg-primary-50/35"
                : "border-rose-100 bg-rose-50/35"
            }`}
          >
            <div
              className={`absolute left-10 top-10 h-28 w-28 rounded-full blur-3xl ${
                isValidated ? "bg-primary-200/40" : "bg-rose-200/40"
              }`}
            />
            <div
              className={`absolute bottom-10 right-8 h-24 w-24 rounded-full blur-3xl ${
                isValidated ? "bg-sky-200/25" : "bg-amber-200/20"
              }`}
            />
            <div
              className={`absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${
                isValidated ? "bg-white/70" : "bg-white/60"
              }`}
            />
            <div className="text-center">
              <div
                className="mx-auto flex h-44 w-44 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(from 180deg, transparent 0deg, transparent ${
                    360 - ringAngle
                  }deg, ${scoreState.ratio >= 0.75 ? "#22c55e" : scoreState.ratio >= 0.5 ? "#f59e0b" : "#ef4444"} ${
                    360 - ringAngle
                  }deg, ${scoreState.ratio >= 0.75 ? "#059669" : scoreState.ratio >= 0.5 ? "#d97706" : "#dc2626"} 360deg)`,
                }}
              >
                <div
                  className={`relative flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full ring-1 ring-inset ring-white/50 ${
                    isValidated ? "bg-primary-50/70" : "bg-rose-50/70"
                  }`}
                >
                  <div
                    className={`absolute inset-5 rounded-full blur-2xl ${
                      isValidated ? "bg-primary-100/70" : "bg-rose-100/70"
                    }`}
                  />
                  <div className="flex items-end gap-1">
                    <span
                      className="relative text-5xl font-black tracking-tighter"
                      style={palette.scoreStyle}
                    >
                      {scoreState.value}
                    </span>
                    <span className="relative pb-1 text-2xl font-black tracking-tighter text-slate-300">
                      /{scoreState.max}
                    </span>
                  </div>
                </div>
              </div>
              <span
                className={`mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.16em] ring-1 ring-inset ring-white/50 ${validationSummary.badgeClass}`}
              >
                <span
                  className={`h-2 w-2 animate-pulse rounded-full ${
                    isValidated ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                {validationSummary.badge}
              </span>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                Note finale
              </p>
            </div>
          </div>

          <div className="min-w-0 border-l border-slate-200 pl-0 xl:pl-10">
            <h3 className="mt-4 text-4xl font-bold tracking-tight text-slate-800">
              {validationSummary.title}
            </h3>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
              {validationSummary.body}
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="flex items-center gap-4 rounded-2xl bg-white px-4 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-inset ring-white/50 transition-all duration-300 hover:-translate-y-1">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-white/50">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M7 12.5 10 15.5 17 8.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M7 4.5h7l3 3v12H7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.15em] text-slate-400">Observé</p>
                  <p className="text-4xl font-bold leading-none tracking-tight text-slate-800">{observedCount}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-2xl bg-white px-4 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-inset ring-white/50 transition-all duration-300 hover:-translate-y-1">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 ring-1 ring-inset ring-white/50">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M8 8l8 8M16 8l-8 8" strokeLinecap="round" />
                    <path d="M7 4.5h7l3 3v12H7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.15em] text-slate-400">Non observé</p>
                  <p className="text-4xl font-bold leading-none tracking-tight text-slate-800">{totalCount - observedCount}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-2xl bg-white px-4 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-inset ring-white/50 transition-all duration-300 hover:-translate-y-1">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-600 ring-1 ring-inset ring-white/50">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.15em] text-slate-400">Temps</p>
                  <p className="text-4xl font-bold leading-none tracking-tight text-slate-800">{formatClock(elapsedSeconds)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Grille détaillée
            </h3>
          </div>
          <div className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
            {evaluation.details.length} critères
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-100">
              <tr className="text-left">
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Critère
                </th>
                <th className="w-[170px] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Statut
                </th>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Observation étudiant
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {evaluation.details.map((detail, index) => (
                <tr
                  key={`${detail.criterion}-${index}`}
                  className="border-t border-slate-200 align-top"
                >
                  <td className="px-5 py-4 text-sm font-semibold leading-7 text-slate-900">
                    {detail.criterion}
                  </td>
                  <td className="w-[170px] px-5 py-4">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold ${
                        detail.observed
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {detail.observed ? "Observé" : "Non observé"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm leading-7 text-slate-700">
                    {detail.feedback}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-primary-200 bg-primary-50/70 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">
          Commentaire pédagogique
        </h3>
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-primary-100 bg-white/90 p-5">
            <p className="max-w-4xl text-sm leading-8 text-slate-700">
              {commentary}
            </p>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            {improvements.map((theme) => (
              <div
                key={theme.title}
                className="rounded-2xl border border-primary-100 bg-white/90 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Axe prioritaire
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {theme.title}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-700">
                  {theme.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">
          Recommandations
        </h3>
        <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
          {recommendations.map((recommendation, index) => (
            <li
              key={`${recommendation}-${index}`}
              className="ml-5 list-disc"
            >
              {recommendation}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
