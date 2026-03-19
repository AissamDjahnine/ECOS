import { useEffect, useState } from "react";
import PsPage from "./PsPage";
import SansPsPage from "./SansPsPage";

type RouteMode = "ps" | "sans-ps";

function resolveMode(pathname: string): RouteMode {
  return pathname === "/sans-ps" ? "sans-ps" : "ps";
}

export default function App() {
  const [mode, setMode] = useState<RouteMode>(() =>
    resolveMode(window.location.pathname),
  );

  useEffect(() => {
    const onPopState = () => {
      setMode(resolveMode(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  function navigate(nextMode: RouteMode) {
    const nextPath = nextMode === "sans-ps" ? "/sans-ps" : "/ps";
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setMode(nextMode);
  }

  return (
    mode === "sans-ps" ? (
      <SansPsPage currentMode={mode} onNavigate={navigate} />
    ) : (
      <PsPage currentMode={mode} onNavigate={navigate} />
    )
  );
}
