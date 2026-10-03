# Voice Recording Block — Design

Date: 2026-09-27
Status: approved in brainstorming, pending spec review

## Goal

Let the user record a voice note directly inside a note. Typing `/Record`
(`/Запись`) inserts an in-editor recording placeholder; pressing **Stop** turns
it into a regular audio `media_block` whose file lives in the workspace assets.

Speech-to-text, pause/resume, device selection, level meter and a duration
limit are out of scope for v1.

## Decisions

| Topic | Decision |
| --- | --- |
| Purpose | Voice memo (audio file + existing player), not dictation |
| Platforms | **v1: desktop only** (Linux, Windows, macOS). On Android/iOS the slash item is hidden and the commands return `unsupported`. Mobile is a follow-up once the mobile build works (revised 2026-09-27) |
| Recording engine | **In-house**, `cpal` (capture) + `hound` (WAV) in `src-tauri/src/commands/voice_recording/`. No third-party Tauri plugin (revised 2026-09-27: `tauri-plugin-audio-recorder` 0.1.2 on crates.io has known defects, its fixed 0.2.0 exists only as a git commit, and pulling an unpublished git dependency was rejected) |
| Output format | WAV, 16-bit PCM, mono (channels downmixed by averaging). Sample rate: 16 kHz when the device offers it, otherwise the device default rate |
| Placeholder | ProseMirror widget decoration, never a document node |
| Leaving the note while recording | Auto-stop, finalize, insert the block before the editor unmounts |

### Why webview `MediaRecorder` was not chosen

It depends on WebKitGTK exposing the microphone and per-machine GStreamer
codecs. Native capture in Rust avoids both.

## Security constraint

Our commands never accept a file path from the frontend. The temporary
recording path is generated in Rust inside the app cache directory. No new
capability permissions are needed beyond our own three commands.

## Architecture

### Data flow

```
/Record ─► useVoiceRecording.start()
             ├─ placeholder widget inserted at selection (plugin meta)
             └─ voice_recording_start()  ── capture thread writes <app cache>/voice-recordings/<uuid>.wav
Stop     ─► placeholder shows "Saving…"
             └─ voice_recording_stop(workspacePath)
                   ├─ capture.stop() → finalized WAV + duration
                   ├─ import_asset_by_path_inner(workspace, temp, display name) → assets/
                   └─ delete temp file (only after a successful import)
             └─ replace placeholder position with media_block{kind:'audio', src, name, mime, size, duration}
                (media_block.duration is in seconds: durationMs / 1000)
Cancel   ─► voice_recording_cancel() → stop + delete temp; placeholder removed
```

A half-finished recording never enters workspace assets, so asset GC
(`commands/note/assets/gc.rs`) cannot race with it.

### Units

**Rust**

- `src-tauri/src/commands/voice_recording/` — `mod.rs` (three async commands,
  managed state), `session.rs` (pure finalize/cleanup logic), `capture.rs`
  (desktop-only cpal capture thread + WAV writer; `cpal::Stream` is `!Send`, so it
  lives on a dedicated thread controlled through channels). Commands:
  - `voice_recording_start() -> Result<(), String>`: builds the temp path under
    the app cache dir (`voice-recordings/`), starts capture, remembers the
    session in managed state. On mobile returns `unsupported`.
  - `voice_recording_stop(workspace_path: String) -> Result<RecordedAudioAsset, String>`:
    stops capture, imports the temp file via the existing asset import path,
    deletes the temp file on success, returns `{ src, name, mime, size, durationMs }`.
    On import failure the temp file is **kept** and the error is logged with its path.
  - `voice_recording_cancel() -> Result<(), String>`: stops and deletes the temp file.
  - Blocking work (file copy/hash) runs in `spawn_blocking`.
  - Display name: `Recording YYYY-MM-DD HH-mm.<ext>` (localized prefix passed
    from the frontend as a plain label, sanitized by the existing
    `sanitize_file_stem`).
- `import_asset_by_path_inner` in `commands/note/assets/import.rs` is reused
  through a new `pub(crate) fn import_asset_by_path_with_limit(workspace, source,
  file_name, max_bytes)`; the existing function delegates to it with
  `MAX_LOCAL_ASSET_BYTES`, so existing callers are unchanged.
- Errors returned to the frontend are stable codes: `permission_denied`,
  `no_device`, `already_recording`, `not_recording`, or `recording_failed: <detail>` /
  `import_failed: <detail>`.
- Registration: `commands/mod.rs`, `invoke_handler` in `lib.rs`, managed state.
  `cpal`/`hound` are desktop-only dependencies. Linux builds need ALSA headers
  (`libasound2-dev` in CI/release workflows, `alsa-lib` in distro packaging).

**Frontend**

- `src/tauri/voiceRecording.ts` — typed wrappers; camelCase payloads matching Rust.
- `src/editor-core/plugins/voice-recording-placeholder.ts` — framework-agnostic
  ProseMirror plugin: state `{ id, pos, phase: 'recording' | 'saving' } | null`,
  meta actions `show`/`setPhase`/`remove`, position mapped through every
  transaction, rendered as a block widget decoration. The widget DOM gets its
  timer and button callbacks from a render callback supplied at plugin creation
  (no Vue inside editor-core).
- `src/app/composables/editor/useVoiceRecording.ts` — session logic: start,
  stop, cancel, timer, error toasts, `flushOnUnmount()` for auto-stop, and the
  single-session guard.
- Slash menu: new `voice_recording` item in the `media` category
  (`useSlashMenuGroups.ts` icon `Mic`, preview mapped to the existing `audio`
  preview in `src/utils/slashBlockPreview.ts`). Slash items are static, so
  selecting it while a session is active shows an "already recording" toast.
- i18n keys in all five locales (en, ru, fr, es, de).

**Platform config**

- macOS: `NSMicrophoneUsageDescription` in `src-tauri/Info.plist` and
  `com.apple.security.device.audio-input` in an entitlements file referenced
  from `tauri.conf.json` `bundle.macOS.entitlements`.
- Android/iOS: nothing in v1 (feature hidden).
- Linux, Windows: nothing extra.

### State ownership

- Recording session (active flag, start time, placeholder id): `useVoiceRecording`,
  one instance per editor, plus a module-level "session active" flag to enforce
  the single-session limit across editors.
- Placeholder position: the ProseMirror plugin state. Not in Pinia, not in
  `note.json`.
- Temp file path: Rust managed state only.

## UX

- Placeholder: compact block matching the audio player, borderless tokens:
  red dot (static under `prefers-reduced-motion`), "Recording", `mm:ss` timer,
  **Stop** and **Cancel** buttons with `aria-label`s. Focus moves to Stop on
  insert; `Esc` inside the placeholder = Cancel.
- Saving phase: label "Saving…", buttons disabled.
- Leaving the note while recording: a framework-agnostic registry
  (`src/core/voice-recording/activeRecording.ts`) exposes
  `finalizeActiveRecording()`. It is awaited at the three points that run
  while the editor is still mounted: the `activeNoteId` watcher in
  `WorkspaceShell.vue` (before `flushSave`), a new `router.beforeEach` guard,
  and `useAppCloseGuard` (before `flushDurably`). Finalize stops, imports and
  dispatches the `media_block` insert, so the following save includes it.
  `persistActiveNote`/`flushContent` are NOT used for this: autosave calls
  them, and that would stop the recording on every autosave.
- Safety net: if the editor view is destroyed while a session is still active
  (a path none of the three hooks covers), the recording is stopped and
  imported into assets anyway, and a toast says it was saved to assets but
  could not be inserted.
- If the placeholder's anchor text is deleted, the mapped position is used
  (nearest valid block position).

## Error handling

| Case | Behavior |
| --- | --- |
| Permission denied / no input device | Placeholder removed, toast pointing to system settings. (macOS reports a denied mic as silence, not an error — known limitation) |
| Start fails for another reason | Placeholder removed, toast |
| Stop succeeds, import fails | Temp file kept, toast with error, placeholder removed; no automatic recovery in v1 |
| Second recording requested | Toast "already recording"; Rust also rejects with `already_recording` |
| Recording larger than the import cap | Voice import uses a 512 MB cap (~4.5 h at 16 kHz mono, ~90 min at 48 kHz) instead of the generic 100 MB; above it the temp file is kept and a toast is shown |

## Testing

- Rust: temp path always under the cache dir; stop → import → temp deleted
  (using a WAV fixture, no real microphone); import failure keeps the temp
  file; cancel deletes it; capture helpers (config choice, downmix/convert,
  WAV append, duration from sample count) unit-tested without a device.
- Vitest:
  - placeholder plugin: show, position mapping over edits before/after, remove,
    not serialized;
  - `useVoiceRecording` with mocked commands: success, cancel, permission
    denied, import failure, auto-stop on unmount, single-session guard;
  - slash menu item and preview.
- Regression: `src/editor-core/__tests__/serialization.test.ts`,
  `regression.test.ts`; locale tests.
- `pnpm build`, `cargo fmt --check`, `cargo test`.
- Visual: `pnpm qa` for placeholder in light/dark and keyboard focus. Real
  microphone capture in headless GNOME may be impossible — report it if so.
  Mobile is out of scope for v1.

## Documentation to update

- `ARCHITECTURE.md`: native voice capture module and its desktop-only gating.
- `docs/data-model.md`: no schema change; note that recordings are ordinary
  audio `media_block` assets.
- `changes.md` after verification.
