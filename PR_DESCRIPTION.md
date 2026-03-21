# PR Title

Improve Sans PS transcription flow, align live audio behavior, and polish evaluation report UI

## Summary

This PR improves the `Sans PS` monologue workflow, aligns important live-audio behavior between `Sans PS` and `PS / PSS`, and refines the evaluation report experience in both light and dark mode.

The main goals are:

- make `Sans PS` transcription more stable and easier to use
- support optional AI transcript correction before evaluation
- keep evaluation score and observed criteria consistent
- improve pause/microphone behavior across both modes
- refine the report UI and score palette behavior

## Main Changes

### 1. `Sans PS` transcription flow

- Refactored `Sans PS` to rely on the live transcription path instead of the previous turn-transcription fallback.
- Kept the student monologue in a single merged transcript bubble instead of splitting it across multiple temporary bubbles.
- Improved manual `mute` and `pause` behavior so the last in-flight spoken segment is preserved before the transcript freezes.
- Stopped model-side generation from interfering with `Sans PS` transcript segmentation.
- Added an optional `Correct transcript with AI` flow after session end.
- Let evaluation use either:
  - the raw transcript
  - or the AI-corrected transcript when activated

### 2. AI correction and export behavior

- Added a post-session AI transcript correction flow for `Sans PS`.
- The correction is designed to stay close to the original transcript with minimal cleanup rather than free paraphrasing.
- When AI correction is active:
  - evaluation uses the corrected transcript
  - PDF export includes both the corrected transcript and the raw source transcript
- Added a beta/disclaimer footer about AI transcription limits.

### 3. `PS / PSS` pause and audio behavior

- Aligned live audio capture settings between `PS / PSS` and `Sans PS`.
- `PS / PSS` pause now:
  - sends `audioStreamEnd`
  - mutes the microphone state
  - preserves tail speech before freezing
- `Reprendre` explicitly unmutes the microphone again.

### 4. Evaluation consistency and report polish

- Normalized the evaluation score from the number of observed criteria so the score can no longer drift from the detailed grid.
- Refined the evaluation report UI:
  - cleaner dark-mode surfaces
  - improved section hierarchy
  - more coherent examiner-report presentation
- Fixed score palette consistency so the score ring, score core background, and surrounding tint all follow the same ratio thresholds in light and dark mode.
- Added targeted tests for score palette behavior.

## Why

Before this PR, `Sans PS` had a few structural issues:

- transcript segmentation could be unstable
- mute/pause behavior could lose the tail end of speech
- model output could still interfere with transcription-only mode
- raw transcript quality could be much worse than what the model actually understood

The branch also fixes several UX inconsistencies:

- score/report visual consistency
- microphone state consistency on pause/resume
- score/report data consistency

## Testing

Added or updated targeted tests around:

- `Sans PS` pause / mute / single-bubble transcript behavior
- `PS / PSS` pause microphone behavior
- evaluation report score palette behavior

## Notes

- AI transcript correction is intentionally presented as an enhancement, not a guaranteed verbatim transcript.
- The app remains a beta training tool and the original audio is still the best source of truth for critical verification.

## Suggested QA Checks

- `Sans PS`
  - start, pause, resume, mute, stop
  - confirm transcript stays merged into a single student bubble
  - confirm tail speech is not lost on pause or mute
  - confirm `Correct transcript with AI` can be enabled and then used for evaluation
- `PS / PSS`
  - confirm pause mutes the microphone visually and functionally
  - confirm resume unmutes it
  - confirm live transcript still alternates patient / student correctly
- Evaluation report
  - verify low / mid / high scores in both light and dark mode
  - verify score, observed count, and detailed grid remain consistent
  - verify PDF export behavior with and without AI transcript correction
