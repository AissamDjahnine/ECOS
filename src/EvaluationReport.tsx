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

function scoreGradient(ratio: number) {
  if (ratio >= 0.75) {
    return "linear-gradient(90deg, #16a34a, #22c55e)";
  }

  if (ratio >= 0.45) {
    return "linear-gradient(90deg, #ca8a04, #eab308)";
  }

  return "linear-gradient(90deg, #dc2626, #f87171)";
}

function scoreColorClass(ratio: number) {
  if (ratio >= 0.75) {
    return "text-emerald-700 dark:text-emerald-300";
  }

  if (ratio >= 0.45) {
    return "text-amber-700 dark:text-amber-300";
  }

  return "text-rose-700 dark:text-rose-300";
}

function scoreToneClasses(ratio: number, darkMode: boolean) {
  if (ratio >= 0.75) {
    return darkMode
      ? "border-emerald-900/70 bg-emerald-950/20"
      : "border-emerald-200 bg-emerald-50";
  }

  if (ratio >= 0.45) {
    return darkMode
      ? "border-amber-900/70 bg-amber-950/20"
      : "border-amber-200 bg-amber-50";
  }

  return darkMode
    ? "border-rose-900/70 bg-rose-950/20"
    : "border-rose-200 bg-rose-50";
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

type EvaluationReportProps = {
  evaluation: EvaluationResult;
  darkMode: boolean;
  feedbackDetailLabel: string;
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

  if (
    /question|interrog|anamn|recherche|explor|demande/.test(sourceText)
  ) {
    themes.push({
      title: "Questionnement clinique",
      description:
        "Rendre l’entretien plus exploratoire: poser davantage de questions ouvertes puis fermer pour confirmer les éléments clés utiles à la décision.",
    });
  }

  if (
    /structur|synth|organis|plan|conduite|raisonnement|prioris/.test(sourceText)
  ) {
    themes.push({
      title: "Structuration des idées",
      description:
        "Mieux hiérarchiser le raisonnement: annoncer l’hypothèse principale, justifier avec les données utiles, puis conclure par une conduite à tenir claire.",
    });
  }

  if (
    /patient|expli|comprend|rassur|communication|vulgar|annonce/.test(sourceText)
  ) {
    themes.push({
      title: "Langage et vulgarisation",
      description:
        "Adapter davantage le niveau de langage au patient: phrases plus simples, informations découpées, et reformulation des points importants.",
    });
  }

  if (
    /diagnostic|critique|urgence|grave|priorit|risque|sévère/.test(sourceText)
  ) {
    themes.push({
      title: "Esprit critique",
      description:
        "Renforcer l’analyse critique: expliciter les priorités, les diagnostics à éliminer et les éléments de gravité qui modifient la prise en charge.",
    });
  }

  if (themes.length === 0) {
    themes.push({
      title: "Consolidation globale",
      description:
        "La marge de progression porte surtout sur la précision clinique et la clarté d’exposition. Un déroulé plus structuré et plus explicite améliorera la performance globale.",
    });
  }

  return themes.slice(0, 3);
}

function buildRecommendations(details: EvaluationResult["details"]) {
  const missedCount = details.filter((detail) => !detail.observed).length;

  const recommendations = [
    "S’entraîner à verbaliser un plan constant: contexte, hypothèse principale, arguments, conduite à tenir.",
    "Utiliser une check-list mentale courte pour ne pas oublier les données clés à rechercher pendant l’entretien.",
    "Reformuler à voix haute les éléments importants avant de conclure pour rendre le raisonnement plus lisible.",
  ];

  if (missedCount >= 4) {
    recommendations.unshift(
      "Rejouer la station en simulation courte de 3 à 5 minutes pour travailler d’abord la structure avant de chercher plus de détail.",
    );
  }

  return recommendations.slice(0, 4);
}

export function EvaluationReport({
  evaluation,
  darkMode,
  feedbackDetailLabel: _feedbackDetailLabel,
}: EvaluationReportProps) {
  const scoreState = parseScore(evaluation.score);
  const observedDetails = evaluation.details.filter((detail) => detail.observed);
  const missedDetails = evaluation.details.filter((detail) => !detail.observed);
  const strengths = observedDetails.slice(0, 3);
  const improvements = buildImprovementThemes(evaluation.details);
  const recommendations = buildRecommendations(evaluation.details);

  const cardBase = darkMode ? "border-slate-700 bg-slate-900/30" : "border-slate-200 bg-white";
  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className={`rounded-2xl border p-6 ${scoreToneClasses(scoreState.ratio, darkMode)}`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className={`mb-2 text-xs font-semibold uppercase tracking-[0.2em] ${mutedText}`}>
                Note finale
              </div>
              <div className="flex items-end gap-3">
                <span className={`text-6xl font-bold tracking-tight ${scoreColorClass(scoreState.ratio)}`}>
                  {scoreState.value}
                </span>
                <span className={`pb-2 text-2xl font-semibold ${mutedText}`}>/ {scoreState.max}</span>
              </div>
              <p className={`mt-4 max-w-xl text-sm leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                {reportSummaryMessage(scoreState.ratio)}
              </p>
            </div>

            <div className={`rounded-2xl border px-5 py-4 ${cardBase} min-w-[220px]`}>
              <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${mutedText}`}>
                Note
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-bold">{observedDetails.length}</div>
                  <div className={`text-xs ${mutedText}`}>observés</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{missedDetails.length}</div>
                  <div className={`text-xs ${mutedText}`}>à reprendre</div>
                </div>
              </div>
              <div className="mt-4">
                <div className={`mb-2 flex items-center justify-between text-xs ${mutedText}`}>
                  <span>Résultat global</span>
                  <span>{scoreState.value} / {scoreState.max}</span>
                </div>
                <div className={`h-2 overflow-hidden rounded-full ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${scoreState.ratio * 100}%`,
                      background: scoreGradient(scoreState.ratio),
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl border p-6 ${cardBase}`}>
          <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${mutedText}`}>
            Synthèse
          </div>
          <div className="mt-4 space-y-4">
            <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/30" : "border-slate-200 bg-slate-50"}`}>
              <div className={`text-xs font-medium uppercase tracking-[0.14em] ${mutedText}`}>
                Note obtenue
              </div>
              <div className="mt-2 text-3xl font-bold">
                {scoreState.value} <span className={`text-lg ${mutedText}`}>/ {scoreState.max}</span>
              </div>
            </div>
            <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/30" : "border-slate-200 bg-slate-50"}`}>
              <div className={`text-xs font-medium uppercase tracking-[0.14em] ${mutedText}`}>
                Lecture rapide
              </div>
              <p className={`mt-2 text-sm leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                {observedDetails.length > missedDetails.length
                  ? "Les attendus essentiels sont globalement présents, avec encore quelques points à consolider."
                  : "La performance reste inégale: la structure, la formulation et la priorisation clinique méritent encore d’être renforcées."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className={`rounded-2xl border p-6 ${darkMode ? "border-emerald-900/70 bg-emerald-950/20" : "border-emerald-200 bg-emerald-50"}`}>
          <h3 className="text-lg font-semibold">Points validés</h3>
          {strengths.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {strengths.map((detail, index) => (
                <li key={`${detail.criterion}-${index}`} className="rounded-xl border border-emerald-200/60 bg-white/70 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-emerald-900/60 dark:bg-slate-950/20 dark:text-slate-200">
                  <div className="font-semibold">{detail.criterion}</div>
                  <div className={`mt-1 text-xs ${mutedText}`}>{detail.feedback}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`mt-4 text-sm ${mutedText}`}>
              Aucun critère n&apos;a été validé dans cette tentative.
            </p>
          )}
        </div>

        <div className={`rounded-2xl border p-6 ${darkMode ? "border-amber-900/70 bg-amber-950/20" : "border-amber-200 bg-amber-50"}`}>
          <h3 className="text-lg font-semibold">Axes d&apos;amélioration</h3>
          {improvements.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {improvements.map((detail, index) => (
                <li key={`${detail.title}-${index}`} className="rounded-xl border border-amber-200/60 bg-white/70 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-amber-900/60 dark:bg-slate-950/20 dark:text-slate-200">
                  <div className="font-semibold">{detail.title}</div>
                  <div className={`mt-1 text-xs ${mutedText}`}>{detail.description}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`mt-4 text-sm ${mutedText}`}>
              Aucun axe prioritaire n&apos;est remonté: l&apos;ensemble des critères observés est satisfaisant.
            </p>
          )}
        </div>
      </div>

      <div className={`rounded-2xl border p-6 ${darkMode ? "border-sky-900/70 bg-sky-950/20" : "border-sky-200 bg-sky-50"}`}>
        <h3 className="text-lg font-semibold">Recommandations</h3>
        <ul className="mt-4 space-y-3">
          {recommendations.map((recommendation, index) => (
            <li
              key={`${recommendation}-${index}`}
              className="rounded-xl border border-sky-200/60 bg-white/70 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-sky-900/60 dark:bg-slate-950/20 dark:text-slate-200"
            >
              {recommendation}
            </li>
          ))}
        </ul>
      </div>

      <div className={`rounded-2xl border p-6 ${cardBase}`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold">Grille de notation détaillée</h3>
        </div>

        <div className="space-y-4">
          {evaluation.details.map((detail, index) => (
            <div
              key={`${detail.criterion}-${index}`}
              className={`rounded-2xl border p-5 ${detail.observed
                ? darkMode
                  ? "border-emerald-900/60 bg-emerald-950/10"
                  : "border-emerald-200 bg-emerald-50/60"
                : darkMode
                  ? "border-rose-900/60 bg-rose-950/10"
                  : "border-rose-200 bg-rose-50/60"}`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="text-base font-semibold leading-relaxed">{detail.criterion}</div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                    detail.observed
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                  }`}
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      detail.observed
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                    }`}
                  >
                    {detail.observed ? "✓" : "×"}
                  </span>
                  {detail.observed ? "Observé" : "Non observé"}
                </span>
              </div>

              <div className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
                darkMode ? "border-slate-700 bg-slate-950/30 text-slate-300" : "border-slate-200 bg-white text-slate-600"
              }`}>
                {detail.feedback}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
