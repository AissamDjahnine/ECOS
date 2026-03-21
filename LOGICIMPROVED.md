# LOGICIMPROVED

## MEDIUM IMPACT

### 1. Dashboard refresh button not disabled during loading (DashboardDrawer)
The refresh button shows a spinner but remains clickable, allowing redundant API calls.
- **DashboardDrawer.tsx:** ~line 426–437
- **Fix:** Add `disabled={isLoading}`.

### 4. Unused prop `feedbackDetailLabel` (EvaluationReport)
Prop is declared in the type and received as `_feedbackDetailLabel` but never rendered.
- **EvaluationReport.tsx:** ~line 135, 269
- **Fix:** Remove from type and call sites, or use it.

### 5. Silent error swallowing in stopDiscussion/stopSession (PsPage + SansPsPage)
Cleanup errors are caught with empty `catch {}` blocks — user gets no feedback if session teardown fails.
- **PsPage:** ~line 1738–1739
- **SansPsPage:** similar location
- **Fix:** Log or show toast on cleanup failure.

### 6. Auto-export PDF: ref set before success (PsPage + SansPsPage)
`autoExportedEvaluationRef` is set before `exportPdf()` runs. If the popup is blocked, the ref is already set and retry is impossible.
- **PsPage:** ~line 2014
- **Fix:** Set ref after successful export, or catch errors and reset.

### 7. ConfirmDialog missing accessibility attributes
No `role="alertdialog"`, `aria-modal`, `aria-labelledby`, or focus trapping.
- **ConfirmDialog.tsx:** ~line 47–95
- **Fix:** Add semantic attributes and basic focus management.

### 8. SettingsDrawer pencil button has no disabled state when already editing
User can click the edit button repeatedly while in edit mode.
- **SettingsDrawer.tsx:** ~line 350–360
- **Fix:** Add `disabled={isEditingApiKey}`.

### 9. Window selector buttons poor hover contrast in light mode (DashboardDrawer)
Unselected buttons use `text-slate-300` with `hover:text-slate-500`, making hover state nearly invisible on light backgrounds.
- **DashboardDrawer.tsx:** ~line 474–489
- **Fix:** Use darker text color for unselected state in light mode.

## LOW IMPACT

### 10. Fire-and-forget usage logging with no error handling
Usage tracking fetch has no `.catch()` — failures are silently lost.
- **SansPsPage:** ~line 1308 (and PsPage equivalent)
- **Fix:** Add `.catch()` or show a non-blocking warning.

### 11. RecordingPlayer missing `playbackRate` in useEffect dependency
Event listener setup only depends on `src`, so changing playback rate doesn't re-register listeners.
- **RecordingPlayer.tsx:** ~line 86
- **Fix:** Add `playbackRate` to the dependency array.
