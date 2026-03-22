# PS/PSS & Sans-PS 3-Column Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 2-column layout on both PsPage and SansPsPage with a 3-zone layout (fixed sidebar + scrollable case content + live transcript panel) matching the provided design screenshot.

**Architecture:** Extract a shared `Sidebar.tsx` component; refactor `PsPage.tsx` and `SansPsPage.tsx` to import it, remove the existing `<header>`, and replace the 2-column `rawInput`-based layout with a station-input modal + 3-column content grid.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (inline hex values — no `primary-*` classes), Vitest + React Testing Library

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/Sidebar.tsx` | **Create** | Fixed left navigation sidebar, shared by PS and Sans-PS pages |
| `src/PsPage.tsx` | **Modify** | Remove header + left config panel; add Sidebar + station modal + 3-col layout |
| `src/SansPsPage.tsx` | **Modify** | Same layout changes as PsPage |

---

## Task 1: Create `src/Sidebar.tsx`

**Files:**
- Create: `src/Sidebar.tsx`

- [ ] **Step 1: Write `src/Sidebar.tsx`**

```tsx
import type { RouteMode } from "./types";

type SidebarProps = {
  darkMode: boolean;
  onDarkModeChange: (v: boolean) => void;
  currentRoute: RouteMode;
  canSwitchModes: boolean;
  onNavigate: (route: RouteMode) => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
};

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.59 3H10.5a2 2 0 1 1 4 0h-.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2m-7.07-14.07 1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2m-4.93-7.07-1.41 1.41M6.34 17.66l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

type NavItemProps = {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  darkMode: boolean;
};

function NavItem({ icon, label, onClick, active, disabled, darkMode }: NavItemProps) {
  const mutedText = darkMode ? "text-slate-500" : "text-slate-300";
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? "border-l-[3px] border-[#008282] bg-[#008282]/10 pl-[9px] text-[#008282]"
          : disabled
            ? `cursor-not-allowed ${mutedText}`
            : darkMode
              ? "text-slate-300 hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function Sidebar({
  darkMode,
  onDarkModeChange,
  currentRoute,
  canSwitchModes,
  onNavigate,
  onOpenDashboard,
  onOpenSettings,
}: SidebarProps) {
  const isSession = currentRoute === "ps" || currentRoute === "sans-ps";
  const bg = darkMode
    ? "bg-slate-900 border-slate-700/60"
    : "bg-white border-slate-200";
  const borderColor = darkMode ? "border-slate-700/60" : "border-slate-200";

  return (
    <div
      className={`flex h-screen w-60 shrink-0 flex-col border-r ${bg}`}
      style={{ position: "sticky", top: 0 }}
    >
      {/* Logo */}
      <div className="px-4 py-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl shadow-lg"
            style={{ background: "linear-gradient(135deg, #008282 0%, #004f4f 100%)" }}
          >
            <ActivityIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className={`text-lg font-bold tracking-tight ${darkMode ? "text-slate-100" : "text-[#181c20]"}`}>
              Ecos-AI
            </div>
            <div className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
              Ethereal Curator
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3">
        <NavItem
          darkMode={darkMode}
          icon={<HomeIcon className="h-4 w-4 shrink-0" />}
          label="Accueil"
          onClick={() => onNavigate("home")}
          disabled={!canSwitchModes}
        />
        <NavItem
          darkMode={darkMode}
          icon={<ActivityIcon className="h-4 w-4 shrink-0" />}
          label="Tableau de bord"
          onClick={onOpenDashboard}
        />
        <NavItem
          darkMode={darkMode}
          icon={<ZapIcon className="h-4 w-4 shrink-0" />}
          label="Analytique"
          active={isSession}
        />
        <NavItem
          darkMode={darkMode}
          icon={<BookIcon className="h-4 w-4 shrink-0" />}
          label="Bibliothèque"
          onClick={() => onNavigate("library")}
          disabled={!canSwitchModes}
        />
        <NavItem
          darkMode={darkMode}
          icon={<SettingsIcon className="h-4 w-4 shrink-0" />}
          label="Paramètres"
          onClick={onOpenSettings}
        />
      </nav>

      {/* Bottom */}
      <div className={`border-t px-3 py-4 ${borderColor}`}>
        <button
          type="button"
          onClick={() => onDarkModeChange(!darkMode)}
          className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
            darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {darkMode ? (
            <SunIcon className="h-4 w-4 shrink-0 text-amber-400" />
          ) : (
            <MoonIcon className="h-4 w-4 shrink-0" />
          )}
          {darkMode ? "Mode clair" : "Mode sombre"}
        </button>
        <div className={`flex items-center gap-3 rounded-xl px-3 py-2 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#b3e3e3] text-[#004f4f]">
            <UserIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className={`truncate text-xs font-semibold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
              Dr. Clinician Profile
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors from `src/Sidebar.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/Sidebar.tsx
git commit -m "feat(ui): add shared Sidebar navigation component"
```

---

## Task 2: Refactor PsPage.tsx — State & Logic

**Files:**
- Modify: `src/PsPage.tsx` (state declarations ~line 682, handleParse ~line 997, reset logic ~line 1790, canClearText ~line 804)

> **Context:** PsPage currently has `rawInput` state fed by the textarea. We split it into `studentRawInput` (for display) and `examinatorRawInput` (for evaluation). A new `isStationModalOpen` controls the input modal. `parsedCase` is now initialized to empty and populated via `handleAnalyse`.

- [ ] **Step 1: Replace rawInput state + parsedCase initialization**

Find (line ~682):
```tsx
  const [rawInput, setRawInput] = useState(initialRawInput ?? "");
  const [parsedCase, setParsedCase] = useState<ParsedCase>(() =>
    parseCaseInput(initialRawInput ?? ""),
  );
  const [parseError, setParseError] = useState("");
```

Replace with:
```tsx
  const [studentRawInput, setStudentRawInput] = useState(initialRawInput ?? "");
  const [examinatorRawInput, setExaminatorRawInput] = useState("");
  const [isStationModalOpen, setIsStationModalOpen] = useState(
    () => Boolean(initialRawInput),
  );
  const [parsedCase, setParsedCase] = useState<ParsedCase>(() =>
    parseCaseInput(initialRawInput ?? ""),
  );
  const [parseError, setParseError] = useState("");
```

- [ ] **Step 2: Replace canClearText**

Find (line ~804):
```tsx
  const canClearText =
```
Find the full block (it spans ~6 lines checking `rawInput.trim().length`, `parsedReady`, etc.) and replace the `rawInput.trim().length > 0` check with:
```tsx
  const canClearText =
    !isDiscussing &&
    !isPaused &&
    !isEvaluating &&
    !isConnecting &&
    (studentRawInput.trim().length > 0 ||
      examinatorRawInput.trim().length > 0 ||
      parsedReady ||
      hasEndedDiscussion);
```

- [ ] **Step 3: Replace handleParse with handleAnalyse**

Find (line ~997):
```tsx
  function handleParse() {
    const parsed = parseCaseInput(rawInput);
```

Replace the entire `handleParse` function with:
```tsx
  function handleAnalyse(studentRaw: string, examinatorRaw: string) {
    const combined = studentRaw.trim() + "\n" + examinatorRaw.trim();
    const parsed = parseCaseInput(combined);
    if (!parsed.patientScript || !parsed.gradingGrid) {
      setParseError(
        "Le texte ne contient pas de script patient ou de grille détectable. Vérifiez les sections.",
      );
      return;
    }
    setParseError("");
    setStudentRawInput(studentRaw);
    setExaminatorRawInput(examinatorRaw);
    setParsedCase(parsed);
    setIsStationModalOpen(false);
  }
```

- [ ] **Step 4: Fix reset session — clear rawInput references**

Find the reset logic (line ~1790). It currently calls `setParsedCase(parseCaseInput(""))` and probably `setRawInput("")`. Replace any `setRawInput("")` call with:
```tsx
    setStudentRawInput("");
    setExaminatorRawInput("");
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Fix any remaining `rawInput` references that were missed (search for `rawInput` in PsPage.tsx, should be zero occurrences after this task).

```bash
grep -n "rawInput\b" src/PsPage.tsx
```
Expected: 0 occurrences.

- [ ] **Step 6: Run existing tests**

```bash
npm test -- --reporter=verbose
```
Expected: same pass/fail as before (layout tests not yet changed).

- [ ] **Step 7: Commit**

```bash
git add src/PsPage.tsx
git commit -m "refactor(ps): replace rawInput with studentRawInput + examinatorRawInput + station modal state"
```

---

## Task 3: Rebuild PsPage.tsx — Layout

**Files:**
- Modify: `src/PsPage.tsx` (return statement from line ~2181 onward)

> **Context:** The current layout is `flex-col` with a sticky `<header>` and a 2-column `<main>`. We replace it with `flex-row` (`<Sidebar>` + content area). The content area is itself `flex-col`: top bar → [case content | transcript] → bottom action bar.

- [ ] **Step 1: Add Sidebar import**

At the top of the file, add:
```tsx
import { Sidebar } from "./Sidebar";
```

- [ ] **Step 2: Add student content formatter helper**

Add this function before the `return` statement (after the status helpers):

```tsx
  function renderStudentContent(text: string) {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let bulletGroup: string[] = [];

    function flushBullets() {
      if (bulletGroup.length === 0) return;
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 space-y-1 pl-4">
          {bulletGroup.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#008282]" />
              {b}
            </li>
          ))}
        </ul>,
      );
      bulletGroup = [];
    }

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushBullets();
        elements.push(<div key={`gap-${i}`} className="h-2" />);
        return;
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
        bulletGroup.push(trimmed.replace(/^[-•*]\s/, ""));
        return;
      }
      flushBullets();
      // Heading: all-caps line OR short line ending with ":"
      const isHeading =
        trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-ZÀÂÉÈÊÙÛÎ]/.test(trimmed);
      if (isHeading) {
        elements.push(
          <h3 key={i} className={`mt-5 mb-2 text-sm font-bold uppercase tracking-wide ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
            {trimmed}
          </h3>,
        );
        return;
      }
      if (trimmed.endsWith(":") && trimmed.length < 60) {
        elements.push(
          <p key={i} className={`mt-4 mb-1 text-sm font-semibold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
            {trimmed}
          </p>,
        );
        return;
      }
      elements.push(
        <p key={i} className={`text-sm leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
          {trimmed}
        </p>,
      );
    });
    flushBullets();
    return elements;
  }
```

- [ ] **Step 3: Replace the outer wrapper + header**

Find:
```tsx
  return (
    <div className={`flex min-h-screen flex-col ${theme} ${bgClass} ${textClass} transition-colors duration-300`}>
      {/* Header */}
      <header className="sticky top-0 z-40 ...
```

Replace the outer `<div>` opening tag and the entire `<header>` block (up to and including the closing `</header>` tag at line ~2317) with:

```tsx
  return (
    <div className={`flex h-screen flex-row overflow-hidden ${theme} ${bgClass} ${textClass} transition-colors duration-300`}>
      <Sidebar
        darkMode={darkMode}
        onDarkModeChange={onDarkModeChange}
        currentRoute={currentMode}
        canSwitchModes={canSwitchModes}
        onNavigate={onNavigate}
        onOpenDashboard={onOpenDashboard}
        onOpenSettings={onOpenSettings}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
```

- [ ] **Step 4: Replace EvaluationReport section wrapper**

The evaluation report branch currently starts at:
```tsx
      {/* Main Content */}
      {showEvaluationReport && evaluation ? (
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8">
```

Replace that opening with:
```tsx
      {/* Main Content */}
      {showEvaluationReport && evaluation ? (
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-[1280px]">
```

And find the matching closing `</main>` for the evaluation report branch and replace it with:
```tsx
          </div>
        </div>
```

- [ ] **Step 5: Replace the session main content area**

Find the session branch opening:
```tsx
      <main className="max-w-[1600px] mx-auto w-full flex-1 px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-[470px_1fr] gap-6">
          {/* Left Sidebar */}
          <div className="flex flex-col gap-6">
```

Replace from that `<main>` tag all the way to the end of the `{/* Left Sidebar */}` column (closing `</div>` at ~line 2574, which closes the left config column), with the new top-bar + content structure:

```tsx
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className={`flex shrink-0 items-center justify-between gap-4 border-b px-6 py-3 ${
          darkMode
            ? "border-slate-700/60 bg-slate-900/80"
            : "border-slate-200 bg-white"
        }`}>
          <div className="min-w-0">
            <h2 className={`text-lg font-bold ${darkMode ? "text-slate-100" : "text-[#181c20]"}`}>
              Cas Clinique
            </h2>
            {parsedCase.patientName ? (
              <p className={`text-xs ${mutedText}`}>{parsedCase.patientName}{parsedCase.patientAge ? ` · ${parsedCase.patientAge}` : ""}</p>
            ) : (
              <p className={`text-xs ${mutedText}`}>Aucun cas chargé</p>
            )}
          </div>
          {parsedReady && (
            <div className="flex shrink-0 items-center gap-3">
              {/* Timer */}
              <div className="text-right">
                <div className={`text-[10px] font-semibold uppercase tracking-widest ${mutedText}`}>
                  Temps restant
                </div>
                <div className={`text-xl font-bold tabular-nums tracking-tight ${
                  timerDanger ? "animate-pulse text-rose-500" : darkMode ? "text-slate-100" : "text-[#181c20]"
                }`}>
                  {formatCountdown(remainingSeconds)}
                </div>
              </div>
              {/* Voice chip */}
              <button
                type="button"
                onClick={() => setIsVoiceDrawerOpen(true)}
                disabled={!parsedReady || isDiscussing || isConnecting}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                  darkMode
                    ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                } ${(!parsedReady || isDiscussing || isConnecting) ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {selectedVoiceOption?.label ?? selectedVoiceName}
                <span className="opacity-60">{selectedVoiceOption?.gender === "female" ? "♀" : "♂"}</span>
              </button>
              {/* Mic button */}
              <button
                type="button"
                onClick={toggleMicMute}
                disabled={!isDiscussing && !isPaused}
                aria-pressed={isMicMuted}
                aria-label={isMicMuted ? "Réactiver le microphone" : "Couper le microphone"}
                className={`relative flex h-11 w-11 items-center justify-center rounded-full transition-all ${
                  isMicMuted
                    ? darkMode
                      ? "bg-slate-800 text-rose-400"
                      : "bg-rose-50 text-rose-500"
                    : "text-white shadow-lg"
                } ${(!isDiscussing && !isPaused) ? "cursor-not-allowed opacity-40" : ""}`}
                style={(!isMicMuted && (isDiscussing || isPaused)) ? { background: "linear-gradient(135deg, #006767 0%, #008282 100%)" } : undefined}
              >
                {isMicMuted ? (
                  <MicOffIcon className="h-5 w-5" />
                ) : (
                  <MicIcon className="h-5 w-5" />
                )}
                {!isMicMuted && (isDiscussing || isPaused) && conversationPhase === "patient-speaking" && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-[#008282] opacity-30" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Content area: case content + transcript */}
        <div className="flex min-h-0 flex-1">
          {/* Middle: case content */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
```

- [ ] **Step 6: Replace the left-sidebar config content with the station modal + case display**

After the new middle column opening div (from step 5), add the station modal trigger and case content.

Find and **remove** the entire left config column content that was there (Case Input card + Patient Info card, lines ~2435–2574).

In its place, insert:

```tsx
            {/* Station modal trigger / case content */}
            {!parsedReady ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="text-center">
                  <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${darkMode ? "bg-slate-800" : "bg-slate-100"}`}>
                    <FileTextIcon className={`h-8 w-8 ${mutedText}`} />
                  </div>
                  <p className={`mb-1 text-sm font-semibold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                    Aucune station chargée
                  </p>
                  <p className={`mb-5 text-xs ${mutedText}`}>
                    Chargez une station pour commencer la simulation
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsStationModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #006767 0%, #008282 100%)" }}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Démarrer une station
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className={`mb-4 rounded-2xl border p-5 ${cardBg}`}>
                  {renderStudentContent(studentRawInput)}
                </div>
                {hasEndedDiscussion && !isDiscussing && (
                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      onClick={() => setIsStationModalOpen(true)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                        darkMode
                          ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Changer de station
                    </button>
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 7: Remove the old "Main Panel" right section (Session Controls + Discussion Area)**

The old right column (currently at lines ~2576–3116 in PsPage.tsx) starts with:
```tsx
          {/* Main Panel */}
          <div className="space-y-6">
            {/* Session Controls */}
            <div className={`rounded-2xl border ${cardBg} p-6 shadow-soft`}>
```
and ends with the closing `</div>` of the outer `grid grid-cols-1 xl:grid-cols-[470px_1fr]` div (which is itself closed by `</div>` at ~line 3117), followed by `</main>` at ~line 3119.

Remove this entire block — from the `{/* Main Panel */}` comment through the `</main>` closing tag. This removes:
- The Session Controls card (start/pause/stop/evaluate buttons)
- The Discussion Area grid (the `grid-cols-[320px_1fr]` sub-grid)
- The Outils de session panel (timer, mic ring, voice selector card)
- The Transcript panel (the old `transcriptRef` scroll div)

The transcript JSX (the `transcriptForDisplay.map(...)` loop and the draft indicator block, currently at lines ~2966–3111) must be **moved** (not deleted) into the new right panel's scroll div in Step 8. Locate it now and cut it before deleting this block. The approximate source location is lines 2966–3111 — search for `{transcriptForDisplay.map((entry)` to find the start, and the matching closing brace + `}` that closes the conditional, ending just before `</div>` at ~3113.

- [ ] **Step 8: Add the transcript as the right panel**

Close the middle column `</div>` and open the right transcript panel:

```tsx
          </div>

          {/* Right panel: Transcription en live */}
          <div className={`flex w-[380px] shrink-0 flex-col border-l ${
            darkMode ? "border-slate-700/60" : "border-slate-200"
          }`}>
            {/* Header */}
            <div className={`flex shrink-0 items-start justify-between border-b px-4 py-3 ${
              darkMode ? "border-slate-700/60" : "border-slate-200"
            }`}>
              <div>
                <h3 className={`text-sm font-semibold ${darkMode ? "text-slate-100" : "text-[#181c20]"}`}>
                  Transcription en live
                </h3>
                <p className={`text-xs ${mutedText}`}>Live transcription &amp; analysis feed</p>
              </div>
              <button
                type="button"
                onClick={() => void copyTextToClipboard(transcriptCopyText, "La transcription a été copiée.")}
                disabled={!canCopyTranscript}
                title="Copier le transcript"
                aria-label="Copier le transcript"
                className={`rounded-lg p-1.5 transition-colors ${
                  darkMode
                    ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                } ${!canCopyTranscript ? "cursor-not-allowed opacity-40" : ""}`}
              >
                <CopyIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Transcript feed — same JSX as the existing transcript panel */}
            <div
              ref={transcriptRef}
              className={`min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth ${
                darkMode ? "bg-slate-950/50" : "bg-slate-50/80"
              }`}
            >
              {/* KEEP the existing transcript entries JSX here (transcriptForDisplay.map + draft indicator) */}
              {/* Just move it from the old location into this div */}
            </div>

            {/* Footer */}
            <div className={`shrink-0 border-t p-3 ${darkMode ? "border-slate-700/60" : "border-slate-200"}`}>
              <button
                type="button"
                onClick={() => {
                  const text = transcriptCopyText;
                  const blob = new Blob([text], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "transcription.txt";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={!canCopyTranscript}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  canCopyTranscript
                    ? darkMode
                      ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "cursor-not-allowed opacity-40"
                } ${darkMode ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-700"}`}
              >
                <DownloadIcon className="h-4 w-4" />
                Exporter la transcription
              </button>
            </div>
          </div>
        </div>
```

- [ ] **Step 9: Add the bottom action bar**

After closing the content flex row, before closing the content flex column, add:

```tsx
        {/* Bottom action bar */}
        <div className={`flex shrink-0 items-center gap-3 border-t px-6 py-3 ${
          darkMode
            ? "border-slate-700/60 bg-slate-900/80"
            : "border-slate-200 bg-white"
        }`} style={{ backdropFilter: "blur(12px)" }}>
          <button
            onClick={startDiscussion}
            disabled={!canStart}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
              canStart
                ? "text-white shadow-lg hover:opacity-90"
                : darkMode
                  ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
            style={canStart ? { background: "linear-gradient(135deg, #006767 0%, #008282 100%)" } : undefined}
          >
            <PlayIcon className="h-4 w-4" />
            {isConnecting ? "Connexion..." : "Démarrer"}
          </button>

          <button
            onClick={togglePauseDiscussion}
            disabled={!canPause && !isPaused}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
              canPause || isPaused
                ? darkMode
                  ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                  : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                : darkMode
                  ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            {isPaused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
            {isPaused ? "Reprendre" : "Pause"}
          </button>

          <button
            type="button"
            onClick={requestStopDiscussion}
            disabled={!canEnd}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
              canEnd
                ? darkMode
                  ? "bg-rose-900/40 text-rose-300 hover:bg-rose-900/60"
                  : "border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                : darkMode
                  ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            <StopIcon className="h-4 w-4" />
            Terminer
          </button>

          <button
            onClick={handleEvaluateClick}
            disabled={!canJudge}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
              canJudge
                ? darkMode
                  ? "bg-slate-700 text-slate-100 hover:bg-slate-600"
                  : "border border-slate-200 bg-slate-800 text-white hover:bg-slate-900"
                : darkMode
                  ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            <CheckIcon className="h-4 w-4" />
            Évaluer
          </button>

          <button
            onClick={requestResetSession}
            disabled={!canResetSession}
            title="Réinitialiser la session"
            aria-label="Réinitialiser la session"
            className={`flex items-center justify-center rounded-xl p-2.5 transition-all duration-200 ${
              canResetSession
                ? darkMode
                  ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                  : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                : darkMode
                  ? "cursor-not-allowed bg-slate-800/70 text-slate-500"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            <ResetIcon className="h-4 w-4" />
          </button>
        </div>
```

- [ ] **Step 10: Close the wrapping divs**

Close the content column div `</div>` and the outer flex row div `</div>`, then close the modal/dialogs/overlays that follow.

The old `<div className="mt-auto ...">` footer text block should be removed entirely.

- [ ] **Step 11: Add the Station Input Modal**

Add the modal just before the final closing `</div>` of the outer wrapper. It renders a centered overlay:

```tsx
      {/* Station Input Modal */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-3xl rounded-2xl border shadow-2xl ${cardBg} p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Nouvelle station</h2>
                <p className={`text-sm ${mutedText}`}>Collez les deux documents de la station SDD</p>
              </div>
              {!isDiscussing && !isConnecting && !isPaused && (
                <button
                  type="button"
                  onClick={() => { setIsStationModalOpen(false); setParseError(""); }}
                  className={`rounded-xl p-2 transition-colors ${darkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}
                  aria-label="Fermer"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              )}
            </div>
            <ModalInputForm
              darkMode={darkMode}
              inputBg={inputBg}
              parseError={parseError}
              isLocked={isDiscussing || isConnecting || isPaused}
              onAnalyse={handleAnalyse}
              initialStudentRaw={studentRawInput}
              initialExaminatorRaw={examinatorRawInput}
            />
          </div>
        </div>
      )}
```

- [ ] **Step 12: Add the ModalInputForm + XIcon + PlusIcon helpers**

Add these before the `PsPageProps` type definition (before line ~659):

```tsx
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5v14" />
    </svg>
  );
}

type ModalInputFormProps = {
  darkMode: boolean;
  inputBg: string;
  parseError: string;
  isLocked: boolean;
  onAnalyse: (studentRaw: string, examinatorRaw: string) => void;
  initialStudentRaw: string;
  initialExaminatorRaw: string;
};

function ModalInputForm({
  darkMode,
  inputBg,
  parseError,
  isLocked,
  onAnalyse,
  initialStudentRaw,
  initialExaminatorRaw,
}: ModalInputFormProps) {
  const [studentRaw, setStudentRaw] = useState(initialStudentRaw);
  const [examinatorRaw, setExaminatorRaw] = useState(initialExaminatorRaw);
  const mutedText = darkMode ? "text-slate-400" : "text-slate-500";

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${mutedText}`}>
            Pour l&apos;examinateur
          </label>
          <textarea
            value={examinatorRaw}
            onChange={(e) => setExaminatorRaw(e.target.value)}
            placeholder="Collez ici le contenu SDD pour l'examinateur (grille de correction)..."
            disabled={isLocked}
            className={`h-64 w-full resize-none rounded-xl border p-3 text-sm leading-relaxed transition-all focus:outline-none focus:ring-2 focus:ring-[#008282]/30 ${inputBg} ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
          />
        </div>
        <div>
          <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${mutedText}`}>
            Pour l&apos;étudiant
          </label>
          <textarea
            value={studentRaw}
            onChange={(e) => setStudentRaw(e.target.value)}
            placeholder="Collez ici le contenu SDD pour l'étudiant (cas clinique affiché)..."
            disabled={isLocked}
            className={`h-64 w-full resize-none rounded-xl border p-3 text-sm leading-relaxed transition-all focus:outline-none focus:ring-2 focus:ring-[#008282]/30 ${inputBg} ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
          />
        </div>
      </div>

      {parseError && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
          {parseError}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={isLocked || (!studentRaw.trim() && !examinatorRaw.trim())}
          onClick={() => onAnalyse(studentRaw, examinatorRaw)}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #006767 0%, #008282 100%)" }}
        >
          <SearchIcon className="h-4 w-4" />
          Analyser
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 13: Verify the build**

```bash
npm run build
```
Expected: compiles with no errors. Warnings about unused vars are OK temporarily.

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 14: Visual check**

```bash
npm run dev
```
Open `http://localhost:5173/ps`. Verify:
- Left sidebar visible with nav items
- Middle shows empty state + "Démarrer une station" button
- Click button → modal opens with two textareas
- Paste content + Analyser → modal closes, student text shown in middle
- Right panel "Transcription en live" visible
- Bottom bar shows action buttons

- [ ] **Step 15: Commit**

```bash
git add src/PsPage.tsx
git commit -m "feat(ps): rebuild layout as 3-column with sidebar, station modal, and bottom action bar"
```

---

## Task 4: Refactor SansPsPage.tsx — State & Logic

**Files:**
- Modify: `src/SansPsPage.tsx` (state declarations ~line 643, handleParse ~line 877, canClearText ~line 748)

> **Context:** SansPsPage already has separate `rawInput` (student text) and `gradingGrid` (examiner grid). We rename these to `studentRawInput` and `examinatorRawInput` for consistency with PsPage and the new modal design.

- [ ] **Step 1: Replace rawInput + gradingGrid state declarations**

Find (line ~643):
```tsx
  const [rawInput, setRawInput] = useState(initialRawInput ?? "");
  const [gradingGrid, setGradingGrid] = useState(initialGradingGrid ?? "");
```

Replace with:
```tsx
  const [studentRawInput, setStudentRawInput] = useState(initialRawInput ?? "");
  const [examinatorRawInput, setExaminatorRawInput] = useState(initialGradingGrid ?? "");
  // gradingGrid is kept as separate state because the evaluate call at line ~1611 references it directly
  const [gradingGrid, setGradingGrid] = useState(initialGradingGrid ?? "");
  const [isStationModalOpen, setIsStationModalOpen] = useState(
    () => Boolean(initialRawInput) || Boolean(initialGradingGrid),
  );
```

- [ ] **Step 2: Update gridReady and all rawInput / gradingGrid references**

`gridReady` (line ~711) currently checks `Boolean(gradingGrid)` → update to `Boolean(examinatorRawInput)`.

`canClearText` (line ~748) checks `rawInput.trim().length > 0 || gradingGrid.length > 0` → update to `studentRawInput.trim().length > 0 || examinatorRawInput.trim().length > 0`.

`canResetSession` — find any reference to `rawInput` or `gradingGrid` and update.

- [ ] **Step 3: Replace handleParse**

Find (line ~877):
```tsx
  function handleParse() {
    const nextGrid = extractGradingGridOnly(rawInput);
```

Replace the entire function with:
```tsx
  function handleAnalyse(studentRaw: string, examinatorRaw: string) {
    const nextGrid = examinatorRaw.trim();
    if (!nextGrid) {
      setParseError(
        "Aucune grille de correction détectée dans le texte de l'examinateur.",
      );
      return;
    }
    setParseError("");
    setStudentRawInput(studentRaw);
    setExaminatorRawInput(nextGrid);
    setGradingGrid(nextGrid);  // keep existing gradingGrid state for evaluation compat
    setIsStationModalOpen(false);
  }
```

> Note: SansPsPage uses `gradingGrid` state directly in the evaluate call (line ~1611). Keep that state variable; `handleAnalyse` sets it from `examinatorRaw` directly. The `rawInput` variable used for the evaluate PDF source (line ~1715) should be updated to `studentRawInput`.

- [ ] **Step 4: Fix evaluate + PDF references**

Find `gradingGrid` in the evaluate call (line ~1611) — no change needed (it's still `gradingGrid` state).
Find `rawInput` at line ~1715 (PDF source) — change to `studentRawInput`.
Find any remaining `setRawInput`/`setGradingGrid` reset calls and update to `setStudentRawInput("")` / `setExaminatorRawInput("")`.

- [ ] **Step 5: Verify no remaining rawInput references**

```bash
grep -n "\brawInput\b\|\bgradingGrid\b" src/SansPsPage.tsx
```
`gradingGrid` state can remain (used for evaluation); `rawInput` should be 0 occurrences.

- [ ] **Step 6: Compile check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/SansPsPage.tsx
git commit -m "refactor(sans-ps): rename rawInput→studentRawInput, gradingGrid→examinatorRawInput for modal flow"
```

---

## Task 5: Rebuild SansPsPage.tsx — Layout

**Files:**
- Modify: `src/SansPsPage.tsx` (return statement from line ~1907 onward)

> **Context:** Mirror the layout changes from Task 3 exactly. SansPsPage has a Sans-PS-specific AI transcript correction section; this moves into the right panel below the transcript feed.

- [ ] **Step 1: Add Sidebar import**

```tsx
import { Sidebar } from "./Sidebar";
```

- [ ] **Step 2: Add the same helpers as PsPage**

Copy `XIcon`, `PlusIcon`, `ModalInputForm` (adapted for Sans-PS: no patient script check — only grading grid required), and `renderStudentContent` from PsPage to SansPsPage.

For SansPsPage `ModalInputForm`, the "Analyser" button calls `onAnalyse(studentRaw, examinatorRaw)` identically.

- [ ] **Step 3: Replace the outer wrapper + header**

Find:
```tsx
  return (
    <div className={`flex min-h-screen flex-col ${theme} ${bgClass} ${textClass} transition-colors duration-300`}>
      <header className="sticky top-0 z-40 ...
```

Replace outer div + entire `<header>` (up to `</header>`) with:
```tsx
  return (
    <div className={`flex h-screen flex-row overflow-hidden ${theme} ${bgClass} ${textClass} transition-colors duration-300`}>
      <Sidebar
        darkMode={darkMode}
        onDarkModeChange={onDarkModeChange}
        currentRoute={currentMode}
        canSwitchModes={canSwitchModes}
        onNavigate={onNavigate}
        onOpenDashboard={onOpenDashboard}
        onOpenSettings={onOpenSettings}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
```

- [ ] **Step 4: Wrap EvaluationReport in new content shell**

Same as Task 3 Step 4 — replace `<main>` evaluation wrapper with `<div className="flex-1 overflow-y-auto px-6 py-8">`.

- [ ] **Step 5: Replace session main content with 3-col layout**

Apply the same top-bar + middle + right panel + bottom action bar structure as PsPage (Task 3 Steps 5–10).

**Sans-PS specific differences:**
- Top bar: no voice chip (Sans-PS has no AI patient voice). Just timer + mic button.
- Middle: shows `studentRawInput` via `renderStudentContent` when `gridReady` (SansPsPage uses `gridReady` not `parsedReady`). Empty state CTA button is the same.
- Bottom bar: same buttons; `canStart` in SansPsPage uses `gridReady` instead of `parsedReady`.
- Right panel: after the transcript feed, add the **AI transcript correction section** (currently rendered elsewhere in the old layout):

```tsx
              {/* Sans-PS: AI transcript correction */}
              {hasEndedDiscussion && (
                <div className={`border-t px-4 py-3 ${darkMode ? "border-slate-700/60" : "border-slate-200"}`}>
                  {/* Move the existing aiCorrection / useAiCorrectedTranscript UI here unchanged */}
                </div>
              )}
```

- [ ] **Step 6: Add Sans-PS Station Modal**

Same modal as PsPage. In `ModalInputForm` for Sans-PS, the validation in `handleAnalyse` only requires `examinatorRaw` (grading grid). Student text is optional — show the case content if provided.

- [ ] **Step 7: Build and visual check**

```bash
npm run build && npx tsc --noEmit
```

```bash
npm run dev
```
Open `http://localhost:5173/sans-ps`. Verify:
- Sidebar shows, "Analytique" is active
- Station modal opens, accepts content
- Student text displays in middle (or empty state if not provided)
- Transcript panel visible on right
- AI correction section appears after session ends

- [ ] **Step 8: Run full test suite**

```bash
npm test
```
Expected: all existing tests pass (layout changes don't affect test logic).

- [ ] **Step 9: Commit**

```bash
git add src/SansPsPage.tsx
git commit -m "feat(sans-ps): rebuild layout as 3-column mirroring PsPage redesign"
```

---

## Task 6: Final Polish & Verification

**Files:** `src/PsPage.tsx`, `src/SansPsPage.tsx`

- [ ] **Step 1: Remove the old footer text block**

Both pages have a `<div className="mt-auto ...">` paragraph about Echo-IA / AI disclaimer. Remove it — it's no longer needed in the fixed-height layout.

- [ ] **Step 2: Check dark mode across all panels**

```bash
npm run dev
```
Toggle dark mode via sidebar. Verify: sidebar, top bar, middle, right panel, modal, bottom bar all respect dark/light correctly.

- [ ] **Step 3: Check library navigation flow**

In the library, select a PS station and click "Utiliser en PS". Verify:
- Navigates to /ps
- Station modal auto-opens with student content pre-filled
- Examiner textarea empty (PS case — no `initialGradingGrid`)
- Click Analyser → case displays in middle

Select a Sans-PS station. Verify:
- Station modal opens with both textareas pre-filled (`initialRawInput` → student, `initialGradingGrid` → examiner)

- [ ] **Step 4: Run full test suite one final time**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 5: Final commit**

```bash
git add src/PsPage.tsx src/SansPsPage.tsx
git commit -m "fix(ui): final polish — remove footer, verify dark mode and library flow"
```
