import { useCallback, useEffect, useRef, useState } from "react";
import PsPage from "./PsPage";
import SansPsPage from "./SansPsPage";
import { LibraryPage } from "./LibraryPage";
import { DashboardDrawer } from "./DashboardDrawer";
import { SettingsDrawer } from "./SettingsDrawer";
import { ToastViewport } from "./ToastViewport";
import { loadSettings, persistSettings } from "./lib/settings";
import type { AppSettings, AppToast, AppToastTone, RouteMode } from "./types";

function resolveMode(pathname: string): RouteMode {
  if (pathname === "/sans-ps") {
    return "sans-ps";
  }
  if (pathname === "/bibliotheque") {
    return "library";
  }
  return "ps";
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [mode, setMode] = useState<RouteMode>(() => resolveMode(window.location.pathname));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const darkMode = settings.darkMode;
  const [toast, setToast] = useState<AppToast | null>(null);
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
      {mode === "library" ? (
        <LibraryPage
          darkMode={darkMode}
          onDarkModeChange={(v) => setSettings((s) => ({ ...s, darkMode: v }))}
          onNavigate={navigate}
          onSelectCase={(_rawInput, targetMode) => navigate(targetMode)}
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
