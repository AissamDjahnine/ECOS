import type { SVGProps } from "react";
import type { AppToast } from "./types";

type ToastViewportProps = {
  toast: AppToast | null;
  darkMode: boolean;
  onDismiss: () => void;
};

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}

function InfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m18 6-12 12" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function ToastViewport({ toast, darkMode, onDismiss }: ToastViewportProps) {
  if (!toast) {
    return null;
  }

  const toneClass =
    toast.tone === "success"
      ? darkMode
        ? "border-emerald-500/20 bg-slate-900/95 text-emerald-200"
        : "border-emerald-200 bg-white/95 text-emerald-700"
      : toast.tone === "error"
        ? darkMode
          ? "border-rose-500/20 bg-slate-900/95 text-rose-200"
          : "border-rose-200 bg-white/95 text-rose-700"
        : darkMode
          ? "border-sky-500/20 bg-slate-900/95 text-sky-200"
          : "border-sky-200 bg-white/95 text-sky-700";

  const accentBg =
    toast.tone === "success"
      ? darkMode
        ? "bg-emerald-500/12 text-emerald-300"
        : "bg-emerald-50 text-emerald-600"
      : toast.tone === "error"
        ? darkMode
          ? "bg-rose-500/12 text-rose-300"
          : "bg-rose-50 text-rose-600"
        : darkMode
          ? "bg-sky-500/12 text-sky-300"
          : "bg-sky-50 text-sky-600";

  const icon =
    toast.tone === "success" ? (
      <CheckIcon className="h-4.5 w-4.5" />
    ) : toast.tone === "error" ? (
      <AlertIcon className="h-4.5 w-4.5" />
    ) : (
      <InfoIcon className="h-4.5 w-4.5" />
    );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4 sm:justify-end">
      <div
        className={`pointer-events-auto w-full max-w-md rounded-2xl border shadow-2xl backdrop-blur-xl transition-all ${toneClass} ${
          darkMode ? "shadow-slate-950/50" : "shadow-slate-900/10"
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accentBg}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${darkMode ? "text-slate-50" : "text-slate-900"}`}>{toast.title}</p>
            {toast.body ? (
              <p className={`mt-1 text-sm leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-600"}`}>{toast.body}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className={`rounded-lg p-1.5 transition-colors ${
              darkMode ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200" : "text-slate-500 hover:bg-white hover:text-slate-700"
            }`}
            aria-label="Fermer la notification"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
