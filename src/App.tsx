import { useCallback, useEffect, useRef, useState } from "react";
import PsPage from "./PsPage";
import SansPsPage from "./SansPsPage";
import { LibraryPage } from "./LibraryPage";
import { HomePage } from "./HomePage";
import { DashboardDrawer } from "./DashboardDrawer";
import { SettingsDrawer } from "./SettingsDrawer";
import { ToastViewport } from "./ToastViewport";
import { loadSettings, persistSettings } from "./lib/settings";
import { detectStationJSON, reconstructPageText, reconstructSansPsExaminerText, extractGradingGrid } from "./lib/stationJson";
import type { AppSettings, AppToast, AppToastTone, RouteMode } from "./types";

function resolveMode(pathname: string): RouteMode {
  if (pathname === "/sans-ps") {
    return "sans-ps";
  }
  if (pathname === "/bibliotheque") {
    return "library";
  }
  if (pathname === "/ps") {
    return "ps";
  }
  return "home";
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [mode, setMode] = useState<RouteMode>(() => resolveMode(window.location.pathname));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const darkMode = settings.darkMode;
  const [toast, setToast] = useState<AppToast | null>(null);
  const [pendingRawInput, setPendingRawInput] = useState<string | null>(null);
  const [pendingGradingGrid, setPendingGradingGrid] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setMode(resolveMode(window.location.pathname));
      setIsSettingsOpen(false);
      setIsDashboardOpen(false);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    if (!toast) {
      return;
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3200);

    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [toast]);

  const showToast = useCallback(
    (title: string, body?: string, tone: AppToastTone = "info") => {
      setToast({
        id: crypto.randomUUID(),
        title,
        body,
        tone,
      });
    },
    [],
  );

  function handleSettingsChange(patch: Partial<AppSettings>) {
    setSettings((current) => ({
      ...current,
      ...patch,
    }));
  }

  function navigate(nextMode: RouteMode) {
    const nextPath =
      nextMode === "sans-ps"
        ? "/sans-ps"
        : nextMode === "library"
          ? "/bibliotheque"
          : nextMode === "home"
            ? "/"
            : "/ps";
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setMode(nextMode);
    setIsSettingsOpen(false);
    setIsDashboardOpen(false);
  }

  return (
    <>
      {mode === "home" ? (
        <HomePage
          darkMode={darkMode}
          onDarkModeChange={(v) => setSettings((s) => ({ ...s, darkMode: v }))}
          onNavigate={navigate}
          onOpenDashboard={() => setIsDashboardOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          settings={settings}
          onShowToast={showToast}
        />
      ) : mode === "library" ? (
        <LibraryPage
          darkMode={darkMode}
          onDarkModeChange={(v) => setSettings((s) => ({ ...s, darkMode: v }))}
          onNavigate={navigate}
          onSelectCase={(rawInput, targetMode) => {
            const stationJSON = detectStationJSON(rawInput);
            if (stationJSON) {
              if (stationJSON.mode === 'sans-ps') {
                // SANS PS: textarea = full "Pour l'examinateur" page content, grid = direct from JSON
                setPendingRawInput(reconstructSansPsExaminerText(stationJSON));
                setPendingGradingGrid(extractGradingGrid(stationJSON));
              } else {
                // PS / PSS: reconstruct page text using actual JSON field titles → parseCaseInput parses it
                setPendingRawInput(reconstructPageText(stationJSON));
                setPendingGradingGrid(null);
              }
            } else {
              setPendingRawInput(rawInput);
              setPendingGradingGrid(null);
            }
            navigate(targetMode);
          }}
          onOpenDashboard={() => setIsDashboardOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          settings={settings}
          onShowToast={showToast}
        />
      ) : mode === "sans-ps" ? (
        <SansPsPage
          currentMode={mode}
          onNavigate={navigate}
          settings={settings}
          onOpenDashboard={() => setIsDashboardOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          darkMode={darkMode}
          onDarkModeChange={(v) => setSettings((s) => ({ ...s, darkMode: v }))}
          onShowToast={showToast}
          initialRawInput={pendingRawInput ?? undefined}
          initialGradingGrid={pendingGradingGrid ?? undefined}
        />
      ) : (
        <PsPage
          currentMode={mode}
          onNavigate={navigate}
          settings={settings}
          onOpenDashboard={() => setIsDashboardOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          darkMode={darkMode}
          onDarkModeChange={(v) => setSettings((s) => ({ ...s, darkMode: v }))}
          onShowToast={showToast}
          initialRawInput={pendingRawInput ?? undefined}
        />
      )}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        darkMode={darkMode}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onChange={handleSettingsChange}
        onShowToast={showToast}
      />
      <DashboardDrawer
        isOpen={isDashboardOpen}
        darkMode={darkMode}
        settings={settings}
        onClose={() => setIsDashboardOpen(false)}
        onShowToast={showToast}
      />
      <ToastViewport
        toast={toast}
        darkMode={darkMode}
        onDismiss={() => setToast(null)}
      />
    </>
  );
}
