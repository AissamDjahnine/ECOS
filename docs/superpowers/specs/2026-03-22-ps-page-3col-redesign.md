# PS/PSS & Sans-PS Page — 3-Column Layout Redesign

**Date**: 2026-03-22
**Scope**: `src/PsPage.tsx`, `src/SansPsPage.tsx`, new `src/Sidebar.tsx`
**Branch**: UI/taste

---

## Goal

Replace the current 2-column layout (config sidebar + main panel) on both the PS/PSS and Sans-PS pages with a 3-zone layout: fixed left navigation sidebar, scrollable middle case content column, and live transcript right panel — matching the provided design screenshot.

---

## Layout Structure

Full-height `flex-row` layout. The existing sticky `<header>` is removed; branding moves into the sidebar.

```
┌──────────────┬────────────────────────────────────┬──────────────┐
│              │ Top bar: title + timer + voice + mic│              │
│   Sidebar    ├────────────────────────────────────┤ Transcription│
│   240px      │ Middle: scrollable case content     │ en live      │
│   (fixed)    │ (empty state OR formatted student   │ 380px        │
│              │  SDD text)                          │              │
│              ├────────────────────────────────────┴──────────────┤
│              │ Bottom bar: Démarrer | Pause | Terminer | Évaluer | ↺ │
└──────────────┴──────────────────────────────────────────────────┘
```

When `showEvaluationReport && evaluation` is true, the evaluation report replaces the middle + right columns entirely. The sidebar remains visible. The layout becomes: `[sidebar 240px] [EvaluationReport full-width]`.

For viewport widths below 1024px, the sidebar collapses to icon-only (40px). Responsive behavior below 768px is deferred to a future task.

---

## Component: `src/Sidebar.tsx` (new, shared)

### Props
```ts
type SidebarProps = {
  darkMode: boolean;
  onDarkModeChange: (v: boolean) => void;
  currentRoute: "ps" | "sans-ps" | "library" | "home";
  canSwitchModes: boolean;
  onNavigate: (route: "ps" | "sans-ps" | "library" | "home") => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
};
```

Props are received from the parent page component (same prop-threading pattern as the rest of the app — no new context or direct App.tsx wiring).

### Layout (top → bottom)
1. **Logo block**: "Ecos-AI" bold + "ETHEREAL CURATOR" muted subtitle
2. **Nav items** (vertical list):
   - 🏠 Accueil → `onNavigate("home")`; disabled if `!canSwitchModes`
   - 📊 Tableau de bord → `onOpenDashboard()`; always enabled
   - ⚡ Analytique → **visual active indicator only** (no navigation); always shown as active on PS and Sans-PS pages; clicking does nothing
   - 📚 Bibliothèque → `onNavigate("library")`; disabled if `!canSwitchModes`
   - ⚙️ Paramètres → `onOpenSettings()`; always enabled
3. **Bottom strip**: dark mode toggle + "Dr. Clinician Profile" user label

### Styling
- Active item (Analytique): teal left border + teal text
- Disabled items: muted text, `cursor-not-allowed`, no click handler
- Width: 240px, full viewport height, border-right

---

## Station Input Modal

Defined as an inline sub-component in each page file.

### Trigger
- **Empty state**: "Démarrer une station" button in the middle column
- **After session ends**: "Changer de station" button appears in the middle column (same position as the empty-state CTA), allowing the user to load a new case

### Modal content
- Title: "Nouvelle station"
- Two textareas:
  - **Pour l'examinateur** — examiner SDD text (contains the grading grid)
  - **Pour l'étudiant** — student SDD text (displayed in middle column)
- "Analyser" button (teal gradient)
- Parse error displayed inline on failure
- Dismissible (X button) only when no session is live

### Library-selection flow (`initialRawInput` / `initialGradingGrid` props)
**PsPage**: When `initialRawInput` is truthy on mount, the modal opens automatically with `initialRawInput` pre-filled in the **"Pour l'étudiant"** textarea and the **"Pour l'examinateur"** textarea empty.

**SansPsPage**: `App.tsx` already passes a separate `initialGradingGrid` prop (reconstructed examiner/grading text) alongside `initialRawInput` (student text). When either is truthy on mount, the modal opens automatically with `initialRawInput` pre-filled in **"Pour l'étudiant"** and `initialGradingGrid` pre-filled in **"Pour l'examinateur"**. No changes to `App.tsx` or these prop signatures are needed — the modal simply reads both props for its initial values.

### Parsing on "Analyser"
```
combined = studentRaw + "\n" + examinatorRaw
parsedCase = parseCaseInput(combined)   // same parser, backward-compatible
```
- `parsedCase.gradingGrid` is extracted from the examiner section (as today)
- `parsedCase` patient metadata (name, age, sex, context) is extracted from the student section
- `studentRaw` stored separately in state for rendering in the middle column
- `examinatorRaw` stored in state as `examinatorRawInput` — passed to `/api/evaluate` alongside the transcript; never displayed
- Modal closes on success

### Dismissal rules
- Can be dismissed (X) before any session starts
- Non-dismissable while a session is live (`isDiscussing || isConnecting || isPaused`)
- Can be reopened after session ends via "Changer de station" button

---

## Removed Elements

- Existing `rawInput` textarea + "Configuration du cas" card
- "Informations patient" card (patient info grid)
- Top `<header>` element and all its nav buttons (Accueil, PS/PSS, Sans-PS, Bibliothèque, dashboard icon, dark mode icon, settings icon)
- The `rawInput` state variable (replaced by `studentRawInput` + `examinatorRawInput`)

---

## Middle Column: Cas Clinique

### Top bar (sticky within content area, not full-page sticky)
- Left: **"Cas Clinique"** bold + SDD subtitle (patient name/context from `parsedCase`, or "Aucun cas chargé" when empty)
- Right: `TIME REMAINING` label + countdown (`MM:SS`, danger pulse when low) + voice chip (voice name + sex icon, e.g. "Zephyr ♀") + teal mic button (pulse ring when active; clicking toggles mute)
- Voice chip is only shown when `parsedCase` is loaded; clicking the chip opens the voice drawer (same `isVoiceDrawerOpen` logic as today)
- Timer and voice chip hidden in empty state

### Content area (scrollable, fills remaining height between top bar and bottom action bar)

**Empty state**:
- Centered icon + "Aucune station chargée"
- Teal "Démarrer une station" CTA button

**Loaded state**:
- `studentRawInput` rendered as formatted HTML with Tailwind prose-like classes (headings `text-xl font-bold`, bullet lists, clinical info inset boxes with left teal border)
- Scrollable independently of the right panel

**After session ends (no evaluation yet)**:
- Case content remains visible
- "Changer de station" button appears below case content

---

## Right Panel: Transcription en live (380px)

### Header
- "Transcription en live" title
- "Live transcription & analysis feed" subtitle
- **Copy icon button** (top right) → copies transcript to clipboard (same `copyTextToClipboard` logic as today)

### Feed (scrollable, respects `settings.showLiveTranscript`)
- When `showLiveTranscript` is false and session is live: show "Transcription masquée — visible à la fin de la session" placeholder (same message as today)
- **Patient turns**: dark teal bubble (`bg-[#006767] text-white`), left-aligned, labelled "AI ASSISTANT"
- **Student turns**: white/light bordered bubble, right-aligned, labelled "DR. CLINICIAN"
- **System messages**: centered divider (unchanged from current)
- Timestamp shown below each bubble
- Auto-scroll to bottom on new entries (same `transcriptRef` logic as today)

### Sans-PS specific: transcript correction
The AI transcript correction section (raw vs. corrected toggle + correction button) remains in the right panel, appended below the transcript feed — same UI as today, just placed within the new right panel frame.

### Footer
- "Exporter la transcription" full-width button → **downloads transcript as `.txt` file** (new behavior; distinct from the copy-to-clipboard icon in the header)

---

## Bottom Action Bar (fixed)

Fixed to bottom of content area (right of sidebar, does not overlap sidebar).

| Button | Style | Enabled when |
|---|---|---|
| ▶ Démarrer | Teal gradient | `canStart` |
| ⏸ / ▶ Pause/Reprendre | Gray | `canPause \|\| isPaused` |
| ■ Terminer | Rose | `canEnd` |
| ☑ Évaluer | Dark slate | `canJudge` |
| ↺ | Icon only, gray | `canResetSession` |

Same enable/disable logic as today. Bar has `border-t` + backdrop blur. `position: fixed; bottom: 0; left: 240px; right: 0`.

---

## Data / State Changes

### New state (both pages)
```ts
const [studentRawInput, setStudentRawInput] = useState(""); // student SDD text for display
const [examinatorRawInput, setExaminatorRawInput] = useState(""); // examiner text for evaluation
const [isStationModalOpen, setIsStationModalOpen] = useState(false);
```

### Removed state
- `rawInput` / `setRawInput` (replaced by the two fields above)

### Parsing
`parseCaseInput(studentRawInput + "\n" + examinatorRawInput)` — same function, backward-compatible. No changes to `ParsedCase` type or `parseCaseInput()`.

### Evaluation call
The evaluation API receives **`parsedCase.gradingGrid`** — the structured grading grid extracted by `parseCaseInput()` from the combined text. The raw `examinatorRawInput` string is **not** passed directly to `/api/evaluate`. This is identical to the current behavior: the grading grid is always the parsed result, not the raw examiner prose. `examinatorRawInput` is stored in state solely to feed the combined parse on "Analyser" and to pre-fill the modal if reopened.

---

## Files Changed

| File | Change |
|---|---|
| `src/Sidebar.tsx` | New shared component |
| `src/PsPage.tsx` | Remove header + left config panel; add Sidebar + 3-col layout + modal |
| `src/SansPsPage.tsx` | Same layout changes as PsPage |
| `src/types.ts` | No changes needed |
| `src/App.tsx` | No changes needed |

---

## Out of Scope

- App.tsx routing changes
- LibraryPage layout
- Test updates (separate task)
- Sub-768px responsive behavior
