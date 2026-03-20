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

export function EvaluationReport({
  evaluation,
  darkMode,
  feedbackDetailLabel,
}: EvaluationReportProps) {
  const scoreState = parseScore(evaluation.score);
  const observedDetails = evaluation.details.filter((detail) => detail.observed);
  const missedDetails = evaluation.details.filter((detail) => !detail.observed);
  const strengths = observedDetails.slice(0, 3);
  const improvements = missedDetails.slice(0, 3);
  const totalCriteria = evaluation.details.length;

  const cardBase = darkMode ? "border-slate-700 bg-slate-900/30" : "border-slate-200 bg-white";
  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
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
                Vue rapide
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
                  <span>Progression</span>
                  <span>{Math.round(scoreState.ratio * 100)}%</span>
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
            Métadonnées du rapport
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/30" : "border-slate-200 bg-slate-50"}`}>
              <div className={`text-xs font-medium uppercase tracking-[0.14em] ${mutedText}`}>
                Critères
              </div>
              <div className="mt-2 text-2xl font-bold">{totalCriteria}</div>
            </div>
            <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/30" : "border-slate-200 bg-slate-50"}`}>
              <div className={`text-xs font-medium uppercase tracking-[0.14em] ${mutedText}`}>
                Niveau feedback
              </div>
              <div className="mt-2 text-lg font-semibold">{feedbackDetailLabel}</div>
            </div>
            <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/30" : "border-slate-200 bg-slate-50"}`}>
              <div className={`text-xs font-medium uppercase tracking-[0.14em] ${mutedText}`}>
                Points validés
              </div>
              <div className="mt-2 text-lg font-semibold">{observedDetails.length} / {totalCriteria}</div>
            </div>
            <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-950/30" : "border-slate-200 bg-slate-50"}`}>
              <div className={`text-xs font-medium uppercase tracking-[0.14em] ${mutedText}`}>
                Confiance
              </div>
              <div className="mt-2 text-lg font-semibold">
                {feedbackDetailLabel === "Detailed" ? "Élevée" : feedbackDetailLabel === "Brief" ? "Essentielle" : "Standard"}
              </div>
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
                <li key={`${detail.criterion}-${index}`} className="rounded-xl border border-amber-200/60 bg-white/70 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-amber-900/60 dark:bg-slate-950/20 dark:text-slate-200">
                  <div className="font-semibold">{detail.criterion}</div>
                  <div className={`mt-1 text-xs ${mutedText}`}>{detail.feedback}</div>
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

      <div className={`rounded-2xl border p-6 ${cardBase}`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold">Grille de notation détaillée</h3>
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
            darkMode
              ? "border-slate-700 bg-slate-800 text-slate-300"
              : "border-slate-200 bg-slate-100 text-slate-600"
          }`}>
            {feedbackDetailLabel}
          </span>
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
