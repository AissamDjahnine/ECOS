type ConfirmDialogProps = {
  isOpen: boolean;
  darkMode: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "neutral" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
};

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}

export function ConfirmDialog({
  isOpen,
  darkMode,
  title,
  body,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  tone = "neutral",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!isOpen) {
    return null;
  }

  const panelClass = darkMode
    ? "border-slate-700 bg-slate-900 text-slate-100"
    : "border-slate-200 bg-white text-slate-900";

  const confirmClass =
    tone === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700"
      : "bg-primary-600 text-white hover:bg-primary-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl sm:p-7 ${panelClass}`}>
        <div className="flex items-start gap-4 sm:gap-5">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${
              tone === "danger"
                ? darkMode
                  ? "bg-rose-500/15 text-rose-300"
                  : "bg-rose-50 text-rose-600"
                : darkMode
                  ? "bg-slate-800 text-slate-200"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            <AlertTriangleIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold sm:text-xl">{title}</h3>
            <p className={`mt-2 text-sm leading-relaxed sm:text-[0.95rem] ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
              {body}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
              darkMode
                ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-all ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
