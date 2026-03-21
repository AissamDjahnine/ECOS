import { useEffect, useState, type ReactNode } from "react";
import { formatTimerLabel } from "./lib/settings";
import type { AppSettings, AudioPlaybackRate, FeedbackDetailLevel } from "./types";

type SettingsDrawerProps = {
  isOpen: boolean;
  darkMode: boolean;
  settings: AppSettings;
  onClose: () => void;
  onChange: (patch: Partial<AppSettings>) => void;
  onShowToast?: (title: string, body?: string, tone?: "success" | "error" | "info") => void;
};

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.59 3H10.5a2 2 0 1 1 4 0h-.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L7 21l-4 1 1-4z" />
    </svg>
  );
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

type SegmentedOption<T extends string | number> = {
  value: T;
  label: string;
};

function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  darkMode,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  darkMode: boolean;
}) {
  return (
    <div
      className={`inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border p-1 shadow-sm ${
        darkMode
          ? "border-slate-700 bg-slate-800/95"
          : "border-slate-200 bg-white"
      }`}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
            value === option.value
              ? "bg-primary-600 text-white shadow-sm"
              : darkMode
                ? "text-slate-200 hover:bg-slate-700"
                : "text-slate-700 hover:bg-slate-50"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  darkMode,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  darkMode: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shadow-inner ${
        checked
          ? "bg-primary-600"
          : darkMode
            ? "bg-slate-700"
            : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function TextField({
  value,
  onChange,
  darkMode,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  darkMode: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="password"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      className={`w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition-all ${
        darkMode
          ? "border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-950 disabled:text-slate-400"
          : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      }`}
    />
  );
}

function SettingRow({
  title,
  description,
  control,
  darkMode,
  layout = "stacked",
}: {
  title: string;
  description: string;
  control: ReactNode;
  darkMode: boolean;
  layout?: "stacked" | "inline-toggle";
}) {
  const isInlineToggle = layout === "inline-toggle";

  return (
    <div
      className={`rounded-[28px] border shadow-sm ${
        darkMode
          ? "border-slate-700 bg-slate-900"
          : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`${
          isInlineToggle
            ? "flex items-center justify-between gap-4 px-5 py-4"
            : "px-5 py-3.5"
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className={`text-[1.05rem] font-semibold leading-none ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
              {title}
            </div>
            <div className="group relative">
              <button
                type="button"
                className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                  darkMode
                    ? "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                    : "border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
                }`}
                aria-label={`Informations sur ${title}`}
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
          {!isInlineToggle ? (
            <div className="w-full overflow-x-auto pt-3">{control}</div>
          ) : null}
        </div>
        {isInlineToggle ? <div className="shrink-0 pl-4">{control}</div> : null}
      </div>
    </div>
  );
}

const TIMER_OPTIONS: SegmentedOption<number>[] = [120, 180, 300, 480, 600, 720].map(
  (seconds) => ({ value: seconds, label: formatTimerLabel(seconds) }),
);

const PLAYBACK_OPTIONS: SegmentedOption<AudioPlaybackRate>[] = [
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "1x" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 2, label: "2x" },
];

const FEEDBACK_OPTIONS: SegmentedOption<FeedbackDetailLevel>[] = [
  { value: "brief", label: "Bref" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Détaillé" },
];

export function SettingsDrawer({
  isOpen,
  darkMode,
  settings,
  onClose,
  onChange,
  onShowToast = () => {},
}: SettingsDrawerProps) {
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.googleApiKey);
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);

  useEffect(() => {
    if (!isEditingApiKey) {
      setApiKeyDraft(settings.googleApiKey);
    }
  }, [isEditingApiKey, settings.googleApiKey]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const overlayClass = isOpen
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0";
  const panelClass = isOpen ? "translate-x-0" : "translate-x-full";
  const trimmedDraft = apiKeyDraft.trim();
  const hasApiKeyChanges = trimmedDraft !== settings.googleApiKey;

  const apiKeyActionButtonClass = darkMode
    ? "border-slate-700 bg-slate-900/90 text-slate-300 hover:border-slate-600 hover:bg-slate-800 disabled:border-slate-800 disabled:bg-slate-950 disabled:text-slate-600"
    : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-700 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300";

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
          <div className={`sticky top-0 z-10 flex items-center justify-between border-b px-6 py-5 backdrop-blur-xl ${
            darkMode
              ? "border-slate-700 bg-slate-950/96"
              : "border-slate-200 bg-slate-50/96"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                darkMode
                  ? "bg-slate-800 text-primary-400 shadow-sm shadow-slate-950/30"
                  : "bg-white text-primary-600 shadow-sm"
              }`}>
                <SettingsIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${darkMode ? "text-slate-50" : "text-slate-900"}`}>Réglages</h2>
                <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Préférences globales de la station
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-xl border p-2.5 transition-colors shadow-sm ${
                darkMode
                  ? "border-slate-700 bg-slate-800 hover:bg-slate-700"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              aria-label="Fermer les réglages"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <section className="space-y-2.5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-500">API</h3>
                <p className={`mt-1 text-[0.95rem] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Clé locale optionnelle envoyée au backend pour cette session.
                </p>
              </div>
              <SettingRow
                darkMode={darkMode}
                title="Google API Key"
                description="Clé locale conservée dans votre navigateur. Si elle est vide, le backend utilise la clé serveur configurée."
                control={
                  <div className="flex items-center gap-2">
                    <TextField
                      darkMode={darkMode}
                      value={apiKeyDraft}
                      placeholder="AIza..."
                      disabled={!isEditingApiKey}
                      onChange={setApiKeyDraft}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setApiKeyDraft(settings.googleApiKey);
                        setIsEditingApiKey(true);
                      }}
                      disabled={isEditingApiKey}
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm transition-all ${isEditingApiKey ? "opacity-40 cursor-not-allowed" : ""} ${apiKeyActionButtonClass}`}
                      aria-label="Modifier la clé API Google"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ googleApiKey: trimmedDraft });
                        setIsEditingApiKey(false);
                        onShowToast(
                          "Clé API enregistrée",
                          trimmedDraft
                            ? "La clé locale sera utilisée pour les prochains appels."
                            : "La clé locale a été supprimée. La clé serveur sera utilisée.",
                          "success",
                        );
                      }}
                      disabled={!isEditingApiKey || !hasApiKeyChanges}
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm transition-all ${apiKeyActionButtonClass}`}
                      aria-label="Enregistrer la clé API Google"
                    >
                      <SaveIcon className="h-4 w-4" />
                    </button>
                  </div>
                }
              />
            </section>

            <section className="space-y-2.5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-500">Session</h3>
                <p className={`mt-1 text-[0.95rem] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Réglages de démarrage et de fin de station.
                </p>
              </div>
              <SettingRow
                darkMode={darkMode}
                title="Durée par défaut"
                description="Durée appliquée aux nouvelles sessions et aux remises à zéro."
                control={
                  <SegmentedControl
                    darkMode={darkMode}
                    value={settings.defaultTimerSeconds}
                    options={TIMER_OPTIONS}
                    onChange={(value) => onChange({ defaultTimerSeconds: value })}
                  />
                }
              />
              <SettingRow
                darkMode={darkMode}
                title="Évaluer automatiquement en fin de session"
                description="Déclenche l’action Évaluer à la fin, sans contourner les garde-fous de durée."
                layout="inline-toggle"
                control={
                  <Toggle
                    darkMode={darkMode}
                    checked={settings.autoEvaluateAfterEnd}
                    onChange={(checked) => onChange({ autoEvaluateAfterEnd: checked })}
                  />
                }
              />
            </section>

            <section className="space-y-2.5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-500">Transcript</h3>
                <p className={`mt-1 text-[0.95rem] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Affichage uniquement. La capture et la transcription continuent en interne.
                </p>
              </div>
              <SettingRow
                darkMode={darkMode}
                title="Afficher la transcription en direct"
                description="S'applique aux deux modes (PS/PSS et Sans PS). Masque la transcription pendant la session, puis la réaffiche une fois terminée."
                layout="inline-toggle"
                control={
                  <Toggle
                    darkMode={darkMode}
                    checked={settings.showLiveTranscript}
                    onChange={(checked) => onChange({ showLiveTranscript: checked })}
                  />
                }
              />
              <SettingRow
                darkMode={darkMode}
                title="Afficher les messages système"
                description="Affiche ou masque les entrées système dans les deux modes."
                layout="inline-toggle"
                control={
                  <Toggle
                    darkMode={darkMode}
                    checked={settings.showSystemMessages}
                    onChange={(checked) => onChange({ showSystemMessages: checked })}
                  />
                }
              />
            </section>

            <section className="space-y-2.5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-500">Evaluation</h3>
                <p className={`mt-1 text-[0.95rem] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Contrôle du niveau de feedback et des sorties automatiques.
                </p>
              </div>
              <SettingRow
                darkMode={darkMode}
                title="Détail du feedback"
                description="Ajuste la longueur et la précision du feedback généré pour chaque critère."
                control={
                  <SegmentedControl
                    darkMode={darkMode}
                    value={settings.feedbackDetailLevel}
                    options={FEEDBACK_OPTIONS}
                    onChange={(value) => onChange({ feedbackDetailLevel: value })}
                  />
                }
              />
              <SettingRow
                darkMode={darkMode}
                title="Exporter automatiquement le PDF"
                description="Lance l’export PDF dès qu’une évaluation réussit."
                layout="inline-toggle"
                control={
                  <Toggle
                    darkMode={darkMode}
                    checked={settings.autoExportPdfAfterEvaluation}
                    onChange={(checked) => onChange({ autoExportPdfAfterEvaluation: checked })}
                  />
                }
              />
            </section>

            <section className="space-y-2.5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-500">Playback</h3>
                <p className={`mt-1 text-[0.95rem] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                  Paramètres appliqués au lecteur d’enregistrement final.
                </p>
              </div>
              <SettingRow
                darkMode={darkMode}
                title="Vitesse de lecture"
                description="Définit la vitesse par défaut des enregistrements audio."
                control={
                  <SegmentedControl
                    darkMode={darkMode}
                    value={settings.recordedAudioPlaybackRate}
                    options={PLAYBACK_OPTIONS}
                    onChange={(value) =>
                      onChange({ recordedAudioPlaybackRate: value })
                    }
                  />
                }
              />
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
