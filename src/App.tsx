import { useEffect, useState } from "react";
import PsPage from "./PsPage";
import SansPsPage from "./SansPsPage";
import { SettingsDrawer } from "./SettingsDrawer";
import { loadSettings, persistSettings } from "./lib/settings";
import type { AppSettings, RouteMode } from "./types";

function resolveMode(pathname: string): RouteMode {
  if (pathname === "/sans-ps") {
    return "sans-ps";
  }

  return "ps";
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [mode, setMode] = useState<RouteMode>(() => resolveMode(window.location.pathname));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      setMode(resolveMode(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  function handleSettingsChange(patch: Partial<AppSettings>) {
    setSettings((current) => ({
      ...current,
      ...patch,
    }));
  }

  function navigate(nextMode: RouteMode) {
    const nextPath = nextMode === "sans-ps" ? "/sans-ps" : "/ps";
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setMode(nextMode);
  }

  return (
    <>
      {mode === "sans-ps" ? (
        <SansPsPage
          currentMode={mode}
          onNavigate={navigate}
          settings={settings}
          onOpenSettings={() => setIsSettingsOpen(true)}
          darkMode={darkMode}
          onDarkModeChange={setDarkMode}
        />
      ) : (
        <PsPage
          currentMode={mode}
          onNavigate={navigate}
          settings={settings}
          onOpenSettings={() => setIsSettingsOpen(true)}
          darkMode={darkMode}
          onDarkModeChange={setDarkMode}
        />
      )}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        darkMode={darkMode}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onChange={handleSettingsChange}
      />
    </>
  );
}
