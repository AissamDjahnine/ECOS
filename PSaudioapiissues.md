# PS/PSS & Sans PS — Audio & API Issues Tracker

## Status: WIP BETA — needs re-testing

---

## 1. AudioContext suspension in PS/PSS mode

**Problem:** PS mode calls `startMixedRecorder()` before `startMicrophoneStream()`, creating two AudioContexts from the same MediaStream. The second AudioContext starts in `suspended` state (the user gesture is consumed by the first), so no audio chunks are sent to Gemini.

**Fix:** Added `await audioContext.resume()` in `src/lib/audio.ts` after creating the AudioContext.

**Files:** `src/lib/audio.ts`

---

## 2. `Blob.arrayBuffer()` hanging in PS mode

**Problem:** In PS mode with two AudioContexts sharing a stream, `await chunk.arrayBuffer()` on Blobs created in `onaudioprocess` would hang indefinitely.

**Fix:** Changed `startMicrophoneStream` to pass raw `Uint8Array` directly alongside the Blob, eliminating the async call. Both PsPage and SansPsPage mic callbacks now use the sync `rawPcm` parameter.

**Files:** `src/lib/audio.ts`, `src/PsPage.tsx`, `src/SansPsPage.tsx`

---

## 3. Stale `isPaused` closure in PsPage mic callback

**Problem:** PsPage used `isPaused` (React state) inside the mic `onChunk` callback, which captures the value at session start (always `false`). Pausing never actually stopped audio sending.

**Fix:** Added `isPausedRef` ref to PsPage (matching SansPsPage pattern). All `setIsPaused()` calls sync the ref. Mic callback uses `isPausedRef.current`.

**Files:** `src/PsPage.tsx`

---

## 4. "En train de parler" persists after mic mute (PS/PSS)

**Problem:** Muting the mic in PS mode didn't clear the student draft indicator. Buffered `inputTranscription` events from Gemini kept re-setting it to `true`.

**Fix:**
- `toggleMicMute()` now calls `setShowStudentDraftIndicator(false)` and `finalizeStudentDraft()` when muting.
- `inputTranscription` handler guards against `isMicMutedRef.current` — late transcription is accumulated then immediately finalized (not shown as draft).

**Files:** `src/PsPage.tsx`

---

## 5. Draft text lost on mute in Sans PS

**Problem:** Muting in Sans PS cleared the "En train de parler" indicator, but if Gemini's `inputTranscription` hadn't arrived yet, the transcript area went blank (`transcriptForDisplay` returned `[]`). Late-arriving transcription sometimes got lost.

**Fix:**
- `inputTranscription` handler: when `isMicMutedRef.current` is true, flushes immediately instead of showing draft indicator.
- `transcriptForDisplay` now includes `isMicMuted && isDiscussing` in its visibility condition — transcript area stays visible while muted during a session.
- `turnComplete`/`waitingForInput` handlers no longer re-enable `shouldSendAudioRef` while mic is muted.

**Files:** `src/SansPsPage.tsx`

---

## 6. Microphone sensitivity for quiet speech

**Problem:** Gemini's transcription struggled with quiet/short speech. The mic level ring barely reacted to soft voice.

**Fix:**
- Added a `GainNode` (4.0x) in the audio pipeline: `source → gainNode → processor`. Amplifies quiet speech before it reaches Gemini and the level indicators.
- Ring display now uses `sqrt(peak)` scale for better low-level visibility.
- `floatTo16BitPCM` clamps to [-1, 1] so loud speech clips gracefully without overflow.

**Files:** `src/lib/audio.ts`, `src/PsPage.tsx`, `src/SansPsPage.tsx`

---

## Known limitations

- **Gemini transcription latency:** ~1-2s delay between speech and `inputTranscription` arrival. If the user mutes very quickly after speaking, text may appear with a delay. The code handles this correctly but the UX shows a brief empty state.
- **Short word accuracy:** Gemini's streaming ASR is less accurate for very short utterances (1-2 words). This is a Gemini API limitation, not a client-side issue.
- **MIC_GAIN = 4.0:** May cause clipping on loud speech. Needs validation with different microphones/environments. Adjustable via the `MIC_GAIN` constant in `src/lib/audio.ts`.
