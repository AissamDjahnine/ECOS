import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AppSettings,
  DashboardSnapshot,
  DashboardStatus,
  DashboardWindow,
} from "./types";

type DashboardDrawerProps = {
  isOpen: boolean;
  darkMode: boolean;
  settings: AppSettings;
  onClose: () => void;
  onShowToast?: (title: string, body?: string, tone?: "success" | "error" | "info") => void;
};

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  );
}

function LiveModelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  );
}

function BackendModelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16" />
      <path d="M4 12h10" />
      <path d="M4 19h16" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15.55-6.36L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15.55 6.36L3 16" />
    </svg>
  );
}

const EMPTY_DASHBOARD: DashboardSnapshot = {
  status: "blocked",
  statusMessage: "Chargement du tableau de bord…",
  keySource: "missing",
  liveModel: "",
  evalModel: "",
  window: "1d",
  windowLabel: "Dernier jour",
  period: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  today: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  lastSession: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  livePeriod: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  backendPeriod: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  liveToday: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  backendToday: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  recentFailures: 0,
  lastRequest: null,
  limitsHint: "",
  updatedAt: "",
};

const WINDOW_OPTIONS: Array<{ value: DashboardWindow; label: string }> = [
  { value: "1h", label: "1h" },
  { value: "1d", label: "1j" },
  { value: "7d", label: "7j" },
  { value: "30d", label: "30j" },
];

function formatInteger(value: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(value));
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value);
}

function formatUpdatedAt(value?: string) {
  if (!value) {
    return "À l’instant";
  }

  return new Date(value).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusVisual(status: DashboardStatus, darkMode: boolean) {
  if (status === "ready") {
    return darkMode
      ? {
          badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
          panel: "border-emerald-500/25 bg-emerald-500/10",
          accent: "text-emerald-300",
        }
      : {
          badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
          panel: "border-emerald-200 bg-emerald-50/80",
          accent: "text-emerald-700",
        };
  }

  if (status === "risky") {
    return darkMode
      ? {
          badge: "bg-amber-500/15 text-amber-300 border-amber-500/25",
          panel: "border-amber-500/25 bg-amber-500/10",
          accent: "text-amber-300",
        }
      : {
          badge: "bg-amber-50 text-amber-700 border-amber-200",
          panel: "border-amber-200 bg-amber-50/80",
          accent: "text-amber-700",
        };
  }

  return darkMode
    ? {
        badge: "bg-rose-500/15 text-rose-300 border-rose-500/25",
        panel: "border-rose-500/25 bg-rose-500/10",
        accent: "text-rose-300",
      }
    : {
        badge: "bg-rose-50 text-rose-700 border-rose-200",
        panel: "border-rose-200 bg-rose-50/80",
        accent: "text-rose-700",
      };
}

function TooltipLabel({
  label,
  description,
  darkMode,
}: {
  label: string;
  description: string;
  darkMode: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span>{label}</span>
      <div className="group relative">
        <button
          type="button"
          className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
            darkMode
              ? "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              : "border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
          }`}
          aria-label={`Informations sur ${label}`}
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
          {description}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  darkMode,
  label,
  description,
  value,
  tone,
  valueClassName,
}: {
  darkMode: boolean;
  label: string;
  description: string;
  value: string;
  tone?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={`rounded-[26px] border px-5 py-3.5 shadow-sm ${
        darkMode
          ? "border-slate-700 bg-slate-900"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
        <TooltipLabel label={label} description={description} darkMode={darkMode} />
      </div>
      <div className={`mt-2.5 text-[2.1rem] font-semibold leading-none tracking-tight ${valueClassName ?? ""} ${tone ?? (darkMode ? "text-slate-50" : "text-slate-900")}`}>
        {value}
      </div>
    </div>
  );
}

function SplitStatCard({
  darkMode,
  label,
  description,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  tone,
}: {
  darkMode: boolean;
  label: string;
  description: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  tone?: string;
}) {
  return (
    <div
      className={`rounded-[26px] border px-5 py-3.5 shadow-sm ${
        darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
      }`}
    >
      <div className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
        <TooltipLabel label={label} description={description} darkMode={darkMode} />
      </div>
      <div className={`mt-2.5 text-[2.05rem] font-semibold leading-none tracking-tight ${tone ?? (darkMode ? "text-slate-50" : "text-slate-900")}`}>
        {primaryValue}
      </div>
      <div className={`mt-2 flex items-center gap-2 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
        <span className="uppercase tracking-[0.14em] text-[0.68rem] font-semibold">{secondaryLabel}</span>
        <span className={`font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{secondaryValue}</span>
      </div>
    </div>
  );
}

function FactCard({
  darkMode,
  label,
  description,
  value,
  icon,
}: {
  darkMode: boolean;
  label: string;
  description: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className={`rounded-[24px] border px-4 py-4 shadow-sm ${
        darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
      }`}
    >
      <div className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
        <TooltipLabel label={label} description={description} darkMode={darkMode} />
      </div>
      <div className={`mt-2.5 flex items-center gap-2 ${
        darkMode ? "text-slate-100" : "text-slate-900"
      }`}>
        {icon ? (
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
            darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"
          }`}>
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 break-words text-sm font-semibold leading-relaxed">
          {value}
        </div>
      </div>
    </div>
  );
}

export function DashboardDrawer({
  isOpen,
  darkMode,
  settings,
  onClose,
  onShowToast = () => {},
}: DashboardDrawerProps) {
  const [dashboard, setDashboard] = useState<DashboardSnapshot>(EMPTY_DASHBOARD);
  const [selectedWindow, setSelectedWindow] = useState<DashboardWindow>("1d");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadDashboard(options?: { silent?: boolean }) {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          googleApiKey: settings.googleApiKey || undefined,
          window: selectedWindow,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setDashboard((await response.json()) as DashboardSnapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dashboard unavailable.";
      setLoadError(message);
      if (!options?.silent) {
        onShowToast("Dashboard indisponible", message, "error");
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadDashboard({ silent: true });
    const intervalId = window.setInterval(() => {
      void loadDashboard({ silent: true });
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isOpen, selectedWindow, settings.googleApiKey]);

  const overlayClass = isOpen
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0";
  const panelClass = isOpen ? "translate-x-0" : "translate-x-full";
  const visual = useMemo(
    () => statusVisual(dashboard.status, darkMode),
    [dashboard.status, darkMode],
  );

  return (
    <div className={`fixed inset-0 z-50 transition-opacity duration-200 ${overlayClass}`}>
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-xl transform border-l shadow-2xl transition-transform duration-300 ${
          darkMode
            ? "border-slate-700 bg-slate-950 text-slate-100"
            : "border-slate-200 bg-slate-50 text-slate-900"
        } ${panelClass}`}
      >
        <div className="flex h-full flex-col">
          <div
            className={`sticky top-0 z-10 flex items-center justify-between border-b px-6 py-5 backdrop-blur-xl ${
              darkMode
                ? "border-slate-700 bg-slate-950/96"
                : "border-slate-200 bg-slate-50/96"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                  darkMode
                    ? "bg-slate-800 text-primary-400 shadow-sm shadow-slate-950/30"
                    : "bg-white text-primary-600 shadow-sm"
                }`}
              >
                <DashboardIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${darkMode ? "text-slate-50" : "text-slate-900"}`}>
                  Dashboard
                </h2>
                <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Usage, limites et coûts estimés
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadDashboard()}
                className={`rounded-xl border p-2.5 transition-colors shadow-sm ${
                  darkMode
                    ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
                aria-label="Rafraîchir le dashboard"
              >
                <RefreshIcon className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`rounded-xl border p-2.5 transition-colors shadow-sm ${
                  darkMode
                    ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
                aria-label="Fermer le dashboard"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <section className={`rounded-[30px] border px-6 py-5 shadow-sm ${visual.panel}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${visual.badge}`}>
                      {dashboard.status === "ready"
                        ? "Ready"
                        : dashboard.status === "risky"
                          ? "At risk"
                          : "Blocked"}
                    </span>
                    <span className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                      Mis à jour à {formatUpdatedAt(dashboard.updatedAt)}
                    </span>
                  </div>
                  <div className={`mt-3 inline-flex rounded-xl border p-1 shadow-sm ${
                    darkMode
                      ? "border-slate-700 bg-slate-900/70"
                      : "border-white/50 bg-white/50"
                  }`}>
                    {WINDOW_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedWindow(option.value)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                          selectedWindow === option.value
                            ? "bg-primary-600 text-white shadow-sm"
                            : darkMode
                              ? "text-slate-200 hover:bg-slate-800"
                              : "text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <h3 className={`mt-3 text-[2rem] font-semibold leading-tight tracking-tight ${visual.accent}`}>
                    {dashboard.statusMessage}
                  </h3>
                  <p className={`mt-3 max-w-lg text-sm leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                    {dashboard.limitsHint}
                  </p>
                </div>
                <div className={`min-w-[142px] rounded-[24px] border px-4 py-3 text-right shadow-sm ${
                  darkMode ? "border-slate-700 bg-slate-900/90" : "border-white/70 bg-white/90"
                }`}>
                  <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                    Coût estimé
                  </div>
                  <div className={`mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                    {dashboard.windowLabel}
                  </div>
                  <div className={`mt-2 text-[2.2rem] font-semibold leading-none tracking-tight ${darkMode ? "text-slate-50" : "text-slate-900"}`}>
                    {formatUsd(dashboard.period.estimatedCostUsd)}
                  </div>
                </div>
              </div>
            </section>

            {loadError ? (
              <div className={`rounded-3xl border px-5 py-4 text-sm shadow-sm ${
                darkMode
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}>
                {loadError}
              </div>
            ) : null}

            <section className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-500">
                    Vue d’ensemble
                  </h3>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${
                      darkMode
                        ? "border-slate-700 bg-slate-900 text-slate-200"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {dashboard.windowLabel}
                  </span>
                </div>
                <p className={`mt-1 text-[0.95rem] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Organisation des volumes et coûts estimés sur {dashboard.windowLabel.toLowerCase()}.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <StatCard darkMode={darkMode} label="Input tokens" description={`Tous les tokens envoyés vers l’API sur ${dashboard.windowLabel.toLowerCase()}.`} value={formatInteger(dashboard.period.inputTokens)} />
                <StatCard darkMode={darkMode} label="Output tokens" description={`Tous les tokens retournés par les modèles sur ${dashboard.windowLabel.toLowerCase()}.`} value={formatInteger(dashboard.period.outputTokens)} />
                <StatCard darkMode={darkMode} label="Total tokens" description={`Somme des tokens d’entrée et de sortie observés sur ${dashboard.windowLabel.toLowerCase()}.`} value={formatInteger(dashboard.period.totalTokens)} />
                <StatCard darkMode={darkMode} label="Erreurs récentes" description="Nombre d’échecs sur la dernière heure. Un pic récent rend le lancement d’une session plus risqué." value={formatInteger(dashboard.recentFailures)} tone={dashboard.recentFailures > 0 ? visual.accent : undefined} />
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-500">
                    Répartition
                  </h3>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${
                      darkMode
                        ? "border-slate-700 bg-slate-900 text-slate-200"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {dashboard.windowLabel}
                  </span>
                </div>
                <p className={`mt-1 text-[0.95rem] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Distinction entre activité live et appels backend sur {dashboard.windowLabel.toLowerCase()}.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SplitStatCard darkMode={darkMode} label="Live période" description={`Tokens live observés sur ${dashboard.windowLabel.toLowerCase()}, via les métadonnées renvoyées au client plus le coût estimé du prompt d’ouverture.`} primaryValue={formatInteger(dashboard.livePeriod.totalTokens)} secondaryLabel="Coût" secondaryValue={formatUsd(dashboard.livePeriod.estimatedCostUsd)} />
                <SplitStatCard darkMode={darkMode} label="Backend période" description={`Transcription et évaluation transitant par le backend sur ${dashboard.windowLabel.toLowerCase()}.`} primaryValue={formatInteger(dashboard.backendPeriod.totalTokens)} secondaryLabel="Coût" secondaryValue={formatUsd(dashboard.backendPeriod.estimatedCostUsd)} />
                <SplitStatCard darkMode={darkMode} label="Dernière session" description="Agrégation de la dernière session identifiée par l’application, utile pour estimer le poids d’un cas récent." primaryValue={formatInteger(dashboard.lastSession.totalTokens)} secondaryLabel="Coût" secondaryValue={formatUsd(dashboard.lastSession.estimatedCostUsd)} />
                <StatCard darkMode={darkMode} label="Source de clé" description="Indique si l’application consomme la clé locale fournie dans les réglages ou la clé serveur." value={dashboard.keySource === "custom" ? "Clé locale" : dashboard.keySource === "server" ? "Clé serveur" : "Aucune clé"} valueClassName="text-[1.55rem]" />
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-500">
                  État API
                </h3>
                <p className={`mt-1 text-[0.95rem] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Faits techniques essentiels pour vérifier rapidement le contexte du projet.
                </p>
              </div>
              <div className={`rounded-[28px] border px-5 py-5 shadow-sm ${
                darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
              }`}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FactCard darkMode={darkMode} label="Modèle live" description={dashboard.liveModel || "—"} value="Gemini Live" icon={<LiveModelIcon className="h-4.5 w-4.5" />} />
                  <FactCard darkMode={darkMode} label="Modèle backend" description={dashboard.evalModel || "—"} value="Gemini Flash" icon={<BackendModelIcon className="h-4.5 w-4.5" />} />
                  <div className="sm:col-span-2">
                    <div className={`text-sm font-medium ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                      <TooltipLabel label="Dernier appel" description="Dernier appel observé par le backend, avec son endpoint, son état et le message d’erreur éventuel." darkMode={darkMode} />
                    </div>
                    {dashboard.lastRequest ? (
                      <div className={`mt-2 rounded-[24px] border px-4 py-3 ${
                        darkMode ? "border-slate-700 bg-slate-950/80" : "border-slate-200 bg-slate-50"
                      }`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            dashboard.lastRequest.outcome === "success"
                              ? darkMode
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-emerald-50 text-emerald-700"
                              : darkMode
                                ? "bg-rose-500/15 text-rose-300"
                                : "bg-rose-50 text-rose-700"
                          }`}>
                            {dashboard.lastRequest.outcome === "success" ? "Succès" : "Erreur"}
                          </span>
                          <span className={`text-sm font-medium ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                            {dashboard.lastRequest.endpoint} · {dashboard.lastRequest.statusCode}
                          </span>
                          <span className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                            {new Date(dashboard.lastRequest.occurredAt).toLocaleString("fr-FR")}
                          </span>
                        </div>
                        <div className={`mt-2 grid gap-2 text-sm leading-relaxed sm:grid-cols-[auto_1fr] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                          <span className={`font-medium ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Modèle</span>
                          <span>{dashboard.lastRequest.model}</span>
                          {dashboard.lastRequest.message ? (
                            <>
                              <span className={`font-medium ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Message</span>
                              <span>{dashboard.lastRequest.message}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className={`mt-2 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                        Aucun appel enregistré pour le moment.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
