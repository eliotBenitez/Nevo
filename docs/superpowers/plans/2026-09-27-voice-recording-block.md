# Voice Recording Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/Record` inserts an in-editor recording placeholder; Stop turns it into an audio `media_block` whose file is imported into workspace assets.

**Architecture:** In-house native capture on desktop (`cpal` + `hound` on a dedicated capture thread) behind our own Rust commands; hidden on Android/iOS in v1. Recording goes to the app cache dir, then is imported through the existing asset import path. In the editor, the placeholder is a ProseMirror widget decoration (never serialized); a framework-agnostic registry lets navigation/app-close hooks finalize an active recording while the editor is still mounted.

**Tech Stack:** Tauri v2 (Rust), `cpal` 0.15 + `hound` 3.5 (desktop-only deps), Vue 3 `<script setup>`, ProseMirror, vue-i18n, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-27-voice-recording-block-design.md`

## Global Constraints

- No third-party recording plugin. `cpal`/`hound` only under the desktop-only dependency table; every use behind `#[cfg(desktop)]`.
- Desktop only in v1: on Android/iOS the commands return `unsupported` and the slash item is not registered.
- Our commands never accept a file path from the frontend.
- Output: WAV 16-bit PCM mono; 16000 Hz when the device supports it, else device default rate.
- Voice import cap: `512 * 1024 * 1024` bytes. Generic import cap (`MAX_LOCAL_ASSET_BYTES`, 100 MB) unchanged for other callers.
- Temp dir: `<app_cache_dir>/voice-recordings/`. Temp file deleted only after a successful import or on cancel.
- Stable error codes to frontend: `permission_denied`, `no_device`, `already_recording`, `not_recording`, `unsupported`, `recording_failed: <detail>`, `import_failed: <detail>`.
- `media_block.duration` is seconds (`durationMs / 1000`).
- No schema change; the placeholder never appears in `note.json`.
- All five locales (en, ru, fr, es, de). Append keys as text — never round-trip locale JSON through a JSON dumper.
- TS style: 2 spaces, single quotes, no semicolons. Rust: `rustfmt`, no panics/`unwrap` in command handlers, blocking work in `spawn_blocking`.
- Do not commit unless the user explicitly asks (dirty worktree is user-owned).

## Review Focus

1. **Autosave during recording** — autosave must NOT stop the recording. Pinned in Task 6 (finalize is never wired to `flushContent`/`persistActiveNote`; test asserts `flushContent` does not call finalize).
2. **User types into / deletes the paragraph the placeholder sits before** — the recording still lands at a valid position (mapped pos or doc end). Pinned in Task 3.
3. **Double Stop click / Stop during "Saving…"** — only one `voice_recording_stop` call. Pinned in Task 5.
4. **Import fails (disk full, >512 MB)** — temp file kept, user informed, no placeholder left behind. Pinned in Tasks 1 and 5.
5. **Editor destroyed mid-recording by a path none of the hooks cover** — recording still stopped and imported, user told it was not inserted. Pinned in Task 5.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/commands/voice_recording/mod.rs` (create) | Tauri commands + managed state; thin |
| `src-tauri/src/commands/voice_recording/session.rs` (create) | Pure logic: temp paths, error mapping, finalize (import + cleanup), `RecorderBackend` trait; unit-tested |
| `src-tauri/src/commands/voice_recording/capture.rs` (create) | Desktop cpal capture thread + WAV writer + pure helpers |
| `src-tauri/src/commands/note/assets/import.rs` (modify) | Add `import_asset_by_path_with_limit` |
| `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml` (modify) | Registration |
| `src-tauri/Info.plist`, `src-tauri/Entitlements.plist` (create), `tauri.conf.json` (modify), `AndroidManifest.xml` (modify) | Platform mic permissions |
| `src/tauri/voiceRecording.ts` (+ test) | Typed wrappers, error-code parsing |
| `src/editor-core/plugins/voice-recording-placeholder.ts` (+ test) | Placeholder widget plugin + helpers |
| `src/editor-core/state.ts` (modify) | Register plugin + slash item |
| `src/core/voice-recording/activeRecording.ts` (+ test) | Single active session registry, `finalizeActiveRecording()` |
| `src/app/composables/editor/useVoiceRecording.ts` (+ test) | Session logic, toasts, editor bindings |
| `src/app/composables/editor/useEditorCore.ts`, `useWorkspaceEditorCore.ts`, `WorkspaceEditorPane.vue`, `EditorSurface.vue` (modify) | Wiring |
| `src/app/WorkspaceShell.vue`, `src/router/index.ts`, `src/composables/useAppCloseGuard.ts` (modify) | Finalize hooks |
| `src/app/composables/editor/useSlashMenuGroups.ts`, `src/utils/slashBlockPreview.ts` (modify) | Icon + preview |
| `src/styles/editor-prose/prose-links-embeds.css` (modify) | Placeholder styles |
| `src/locales/{en,ru,fr,es,de}.json` (modify) | Strings |

---

### Task 1: Rust — in-house desktop capture (revision of the plugin-based Task 1)

> Revised 2026-09-27: the user rejected the third-party plugin. The current tree already contains a plugin-based Task 1 (session.rs, mod.rs, plugin_backend.rs, `import_asset_by_path_with_limit`, Info.plist/Entitlements.plist, tauri.conf.json entitlements, AndroidManifest RECORD_AUDIO, `tauri-plugin-audio-recorder = "=0.1.2"`). This task converts it. Keep what still applies.

**Files:**
- Modify: `src-tauri/Cargo.toml` (remove `tauri-plugin-audio-recorder`; add `cpal = "0.15"` and `hound = "3.5"` under the existing `[target."cfg(not(any(target_os = \"android\", target_os = \"ios\")))".dependencies]` table), `Cargo.lock` (via cargo)
- Modify: `src-tauri/src/lib.rs` (remove `.plugin(tauri_plugin_audio_recorder::init())` and its comment; keep `.manage(...)` and the three handlers)
- Delete: `src-tauri/src/commands/voice_recording/plugin_backend.rs`
- Create: `src-tauri/src/commands/voice_recording/capture.rs`
- Modify: `src-tauri/src/commands/voice_recording/{mod.rs,session.rs}`
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml` — remove ONLY the `RECORD_AUDIO` line Task 1 added (the file has other user-owned changes; leave them)
- Keep: `src-tauri/Info.plist`, `src-tauri/Entitlements.plist`, `tauri.conf.json` entitlements (macOS still needs mic permission for cpal)
- Modify: `.github/workflows/ci.yml` and `.github/workflows/release.yml` — add `libasound2-dev` to the Linux `apt-get install` lists; `packaging/arch/*` PKGBUILD (if it lists runtime `depends`) — add `alsa-lib`; any flatpak manifest in the repo — check whether ALSA is already in the runtime and note it in the report

**Interfaces (unchanged for the frontend):**
- `voice_recording_start() -> Result<(), String>`
- `voice_recording_stop(workspacePath: String, label: String) -> Result<RecordedAudioAsset, String>`
- `voice_recording_cancel() -> Result<(), String>`
- `RecordedAudioAsset { src, name, mime, size, durationMs }` (camelCase)
- Error codes: `no_device`, `already_recording`, `not_recording`, `unsupported` (new, mobile), `recording_failed: <detail>`, `import_failed: <detail>`. `permission_denied` stays in the enum for the frontend contract but desktop cpal does not produce it.

**Design:**
- `cpal::Stream` is `!Send`, so it lives on a dedicated capture thread. `CaptureSession` (Send) holds only channels + `JoinHandle` and is stored in `VoiceRecordingState`.
- Output: WAV, 16-bit PCM, mono. Multi-channel input is downmixed by averaging. Sample rate: 16000 Hz if any supported input config range covers it (prefer the one with the fewest channels), else the device default config.
- Duration = frames written / sample rate (not wall clock).
- A stream error (e.g. device unplugged) is logged; stop still finalizes and returns what was recorded.

- [ ] **Step 1: Write failing tests for capture helpers** in `capture.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn cand(channels: u16, min: u32, max: u32) -> ConfigCandidate {
        ConfigCandidate { channels, min_rate: min, max_rate: max }
    }

    #[test]
    fn picks_16k_with_fewest_channels() {
        let c = [cand(2, 8_000, 48_000), cand(1, 8_000, 48_000)];
        assert_eq!(pick_config(&c, PREFERRED_SAMPLE_RATE), Some((1, 16_000)));
    }

    #[test]
    fn returns_none_when_16k_unsupported() {
        let c = [cand(2, 44_100, 48_000)];
        assert_eq!(pick_config(&c, PREFERRED_SAMPLE_RATE), None);
    }

    #[test]
    fn downmixes_stereo_f32_to_mono_i16() {
        let mut out = Vec::new();
        downmix_to_i16(&[1.0f32, 0.0, -1.0, -1.0], 2, &mut out);
        assert_eq!(out, vec![16_383, -32_767]);
    }

    #[test]
    fn downmixes_i16_and_u16() {
        let mut out = Vec::new();
        downmix_to_i16(&[100i16, 300], 2, &mut out);
        assert_eq!(out, vec![200]);
        out.clear();
        downmix_to_i16(&[32_768u16], 1, &mut out);
        assert_eq!(out, vec![0]);
    }

    #[test]
    fn mono_passthrough_and_partial_frame_dropped() {
        let mut out = Vec::new();
        downmix_to_i16(&[0.5f32, 0.25, 0.1], 2, &mut out); // trailing half-frame ignored
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn duration_from_frames() {
        assert_eq!(duration_ms(16_000, 16_000), 1_000);
        assert_eq!(duration_ms(24_000, 48_000), 500);
        assert_eq!(duration_ms(10, 0), 0);
    }

    #[test]
    fn wav_writer_round_trip() {
        let dir = std::env::temp_dir().join(format!("nevo-capture-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.wav");
        let mut writer = create_wav_writer(&path, 16_000).unwrap();
        for s in [1i16, -1, 2] { writer.write_sample(s).unwrap(); }
        writer.finalize().unwrap();
        let reader = hound::WavReader::open(&path).unwrap();
        let spec = reader.spec();
        assert_eq!((spec.channels, spec.sample_rate, spec.bits_per_sample), (1, 16_000, 16));
        assert_eq!(reader.len(), 3);
    }
}
```
Run `cargo test --manifest-path src-tauri/Cargo.toml voice_recording::capture` → FAIL (symbols missing).

- [ ] **Step 2: Implement `capture.rs`**

Pure helpers (compiled on all targets so tests run everywhere; gate with `#[cfg_attr(mobile, allow(dead_code))]` if needed):
```rust
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

pub const PREFERRED_SAMPLE_RATE: u32 = 16_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConfigCandidate {
    pub channels: u16,
    pub min_rate: u32,
    pub max_rate: u32,
}

/// Index of the candidate to use at `preferred` Hz (fewest channels wins), or
/// None when no candidate covers that rate.
pub fn pick_config(candidates: &[ConfigCandidate], preferred: u32) -> Option<(usize, u32)> {
    candidates
        .iter()
        .enumerate()
        .filter(|(_, c)| c.channels > 0 && c.min_rate <= preferred && preferred <= c.max_rate)
        .min_by_key(|(_, c)| c.channels)
        .map(|(index, _)| (index, preferred))
}

pub trait ToI16Sample: Copy {
    fn to_i16_sample(self) -> i32;
}
impl ToI16Sample for f32 {
    fn to_i16_sample(self) -> i32 { (self.clamp(-1.0, 1.0) * i16::MAX as f32) as i32 }
}
impl ToI16Sample for i16 {
    fn to_i16_sample(self) -> i32 { self as i32 }
}
impl ToI16Sample for u16 {
    fn to_i16_sample(self) -> i32 { self as i32 - 32_768 }
}

/// Averages each interleaved frame into one i16 sample; a trailing partial
/// frame is dropped.
pub fn downmix_to_i16<T: ToI16Sample>(data: &[T], channels: u16, out: &mut Vec<i16>) {
    let channels = channels.max(1) as usize;
    for frame in data.chunks_exact(channels) {
        let sum: i32 = frame.iter().map(|s| s.to_i16_sample()).sum();
        out.push((sum / channels as i32).clamp(i16::MIN as i32, i16::MAX as i32) as i16);
    }
}

pub fn duration_ms(frames: u64, sample_rate: u32) -> u64 {
    if sample_rate == 0 { 0 } else { frames * 1000 / sample_rate as u64 }
}

pub fn create_wav_writer(path: &Path, sample_rate: u32) -> Result<hound::WavWriter<BufWriter<File>>, String> {
    hound::WavWriter::create(
        path,
        hound::WavSpec { channels: 1, sample_rate, bits_per_sample: 16, sample_format: hound::SampleFormat::Int },
    )
    .map_err(|e| e.to_string())
}
```
Note: `hound` is a desktop-only dependency in Cargo.toml; if `create_wav_writer` must compile on mobile, gate it and its test with `#[cfg(desktop)]` instead. Pick whichever keeps `cargo check` clean on desktop; mobile compile is not verifiable here — just keep every cpal/hound use behind `#[cfg(desktop)]`.

Desktop capture (`#[cfg(desktop)]`):
```rust
pub struct CaptureSession {
    stop_tx: std::sync::mpsc::Sender<()>,
    done_rx: std::sync::mpsc::Receiver<Result<StoppedRecording, RecorderError>>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl CaptureSession {
    /// Starts capturing into `<output_base>.wav`. Returns once the stream is
    /// playing, or with the error that prevented it.
    pub fn start(output_base: &Path) -> Result<Self, RecorderError>;
    /// Stops the stream, finalizes the WAV, joins the thread.
    pub fn stop(mut self) -> Result<StoppedRecording, RecorderError>;
}

impl Drop for CaptureSession {
    // If dropped without stop(): send stop, join; the file stays in the cache dir.
}
```
Thread body outline (implement fully):
1. `let host = cpal::default_host(); let device = host.default_input_device().ok_or(RecorderError::NoDevice)?;`
2. Build `ConfigCandidate`s from `device.supported_input_configs()` (map errors: `DeviceNotAvailable` → `NoDevice`, others → `Other`). If `pick_config` returns `Some((i, rate))`, use that range `.with_sample_rate(cpal::SampleRate(rate))`; else `device.default_input_config()`.
3. `path = output_base.with_extension("wav")`; `writer = Arc<Mutex<Option<WavWriter>>>`; `frames = Arc<AtomicU64>`.
4. `build_input_stream` for `F32`, `I16`, `U16` (else `Other("unsupported sample format")`); callback: `downmix_to_i16` into a reused local `Vec`, lock writer, `write_sample` each (on write error set an `AtomicBool` and stop writing), `frames.fetch_add`. Error callback: log via the project logger (`crate::logging::logger()`, as in session.rs).
5. `stream.play()`; send `Ok(())` on a ready channel; on any error before this point send the error and return.
6. `stop_rx.recv()` (returns on stop or when the sender is dropped); `stream.pause()` then `drop(stream)`; take + `finalize()` the writer (map failure to `Other`); send `Ok(StoppedRecording { file_path: path, duration_ms: duration_ms(frames, rate) })`.
`start` waits on the ready channel; if the thread died without sending, return `Other("capture thread exited")`. No `unwrap()` on mutex locks in the callback — use `if let Ok(mut guard) = writer.lock()`.

- [ ] **Step 3: Update `session.rs`**

Remove the `RecorderBackend` trait (no longer used). Add `Unsupported` to `RecorderError` with `code()` → `"unsupported"`, plus a test assertion for it in `maps_known_recorder_errors_to_codes`. `mime_for_path` may keep `m4a` (harmless) — or drop it and its test line; prefer dropping it (WAV only now).

- [ ] **Step 4: Update `mod.rs`**

```rust
mod capture;
mod session;

#[derive(Default)]
pub struct VoiceRecordingState {
    #[cfg(desktop)]
    active: Mutex<Option<capture::CaptureSession>>,
}
```
Desktop commands:
- start: reject `already_recording` if `active.is_some()`; compute `base` via `temp_output_base(app_cache_dir, uuid)`; `spawn_blocking(move || CaptureSession::start(&base))`; store the session.
- stop: take the session (`not_recording` if none); `spawn_blocking` → `session.stop()` → `display_file_name` → `finalize_recording` with `crate::commands::note::import_asset_by_path_with_limit(..., VOICE_IMPORT_MAX_BYTES)` (as today).
- cancel: take the session (Ok if none); `spawn_blocking` → `stop()` → `discard_temp_file`.
Mobile (`#[cfg(mobile)]`): the three commands keep the same signatures and return `Err(RecorderError::Unsupported.code())`.
Update the module doc comment: in-house capture, no third-party plugin, paths never come from the frontend.

- [ ] **Step 5: Cargo / lib.rs / manifest / CI edits** as listed under **Files**.

- [ ] **Step 6: Verify**

```
cargo test --manifest-path src-tauri/Cargo.toml voice_recording
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
grep -rn "audio.recorder\|audio_recorder" src-tauri/Cargo.toml src-tauri/src src-tauri/capabilities   # expect nothing
```
Optional smoke check if a capture device exists on this machine: a `#[test] #[ignore]` test `capture_smoke` that starts a session on a temp base, sleeps 300 ms, stops, and asserts the WAV exists with `reader.len() > 0`; run it once with `-- --ignored capture_smoke` and report the result (it is fine if it reports `NoDevice`).

---

### Task 2: Frontend Tauri wrappers

**Files:**
- Create: `src/tauri/voiceRecording.ts`, `src/tauri/voiceRecording.test.ts`

**Interfaces:**
- Consumes: Task 1 commands.
- Produces:
  ```ts
  export interface RecordedAudioAsset { src: string, name: string, mime: string, size: number, durationMs: number }
  export type VoiceRecordingErrorCode = 'permission_denied' | 'no_device' | 'already_recording' | 'not_recording' | 'import_failed' | 'recording_failed'
  export function startVoiceRecording(): Promise<void>
  export function stopVoiceRecording(workspacePath: string, label: string): Promise<RecordedAudioAsset>
  export function cancelVoiceRecording(): Promise<void>
  export function voiceRecordingErrorCode(error: unknown): VoiceRecordingErrorCode
  export function isVoiceRecordingSupported(): boolean // false when document.documentElement.dataset.platform is 'android' or 'ios' (same signal as src/tauri/mediaServer.ts isMobileRuntime)
  ```
  `VoiceRecordingErrorCode` also includes `'unsupported'` (exact match).

- [ ] **Step 1: Write failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('../utils/logger', () => ({ appLogger: { error: vi.fn() } }))

import {
  cancelVoiceRecording,
  startVoiceRecording,
  stopVoiceRecording,
  voiceRecordingErrorCode,
} from './voiceRecording'

describe('voice recording Tauri wrappers', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
  })

  it('starts without sending any path', async () => {
    await startVoiceRecording()
    expect(invoke).toHaveBeenCalledWith('voice_recording_start', undefined)
  })

  it('stops with camelCase workspace path and label', async () => {
    invoke.mockResolvedValue({ src: '.nevo/assets/a.wav', name: 'R.wav', mime: 'audio/wav', size: 3, durationMs: 1200 })
    const asset = await stopVoiceRecording('/ws', 'Recording')
    expect(invoke).toHaveBeenCalledWith('voice_recording_stop', { workspacePath: '/ws', label: 'Recording' })
    expect(asset.durationMs).toBe(1200)
  })

  it('cancels', async () => {
    await cancelVoiceRecording()
    expect(invoke).toHaveBeenCalledWith('voice_recording_cancel', undefined)
  })

  it.each([
    ['permission_denied', 'permission_denied'],
    ['no_device', 'no_device'],
    ['already_recording', 'already_recording'],
    ['not_recording', 'not_recording'],
    ['import_failed: disk full', 'import_failed'],
    ['recording_failed: boom', 'recording_failed'],
    [new Error('weird'), 'recording_failed'],
  ])('maps %s to %s', (error, code) => {
    expect(voiceRecordingErrorCode(error)).toBe(code)
  })

  it('reports support by platform', () => {
    document.documentElement.dataset.platform = 'android'
    expect(isVoiceRecordingSupported()).toBe(false)
    document.documentElement.dataset.platform = 'linux'
    expect(isVoiceRecordingSupported()).toBe(true)
    delete document.documentElement.dataset.platform
  })

  it('logs and rethrows command failures', async () => {
    invoke.mockRejectedValue('permission_denied')
    await expect(startVoiceRecording()).rejects.toBe('permission_denied')
  })
})
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/tauri/voiceRecording.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { invoke } from '@tauri-apps/api/core'
import { appLogger } from '../utils/logger'

export interface RecordedAudioAsset {
  src: string
  name: string
  mime: string
  size: number
  durationMs: number
}

export type VoiceRecordingErrorCode =
  | 'permission_denied'
  | 'no_device'
  | 'already_recording'
  | 'not_recording'
  | 'import_failed'
  | 'recording_failed'

const EXACT_CODES: VoiceRecordingErrorCode[] = ['permission_denied', 'no_device', 'already_recording', 'not_recording']

async function invokeVoice<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    await appLogger.error({ source: 'frontend.invoke', event: command, message: 'Tauri command failed', error })
    throw error
  }
}

export function startVoiceRecording(): Promise<void> {
  return invokeVoice<void>('voice_recording_start')
}

export function stopVoiceRecording(workspacePath: string, label: string): Promise<RecordedAudioAsset> {
  return invokeVoice<RecordedAudioAsset>('voice_recording_stop', { workspacePath, label })
}

export function cancelVoiceRecording(): Promise<void> {
  return invokeVoice<void>('voice_recording_cancel')
}

export function voiceRecordingErrorCode(error: unknown): VoiceRecordingErrorCode {
  const message = typeof error === 'string' ? error : ''
  const exact = EXACT_CODES.find(code => code === message)
  if (exact) return exact
  if (message.startsWith('import_failed')) return 'import_failed'
  return 'recording_failed'
}
```
Check `appLogger.error`'s parameter type in `src/utils/logger.ts` and match its required fields.

- [ ] **Step 4: Run** the test → PASS.

---

### Task 3: Editor-core placeholder plugin + slash item

**Files:**
- Create: `src/editor-core/plugins/voice-recording-placeholder.ts`, `src/editor-core/__tests__/voice-recording-placeholder.test.ts`
- Modify: `src/editor-core/state.ts`

**Interfaces:**
- Produces:
  ```ts
  export type VoiceRecordingPhase = 'recording' | 'saving'
  export interface VoiceRecordingPlaceholder { id: string, pos: number, phase: VoiceRecordingPhase }
  export interface VoiceRecordingPlaceholderOptions {
    t: (key: string) => string
    onStop: (id: string) => void
    onCancel: (id: string) => void
    getElapsedMs: (id: string) => number
  }
  export const voiceRecordingPlaceholderKey: PluginKey
  export function createVoiceRecordingPlaceholderPlugin(options: VoiceRecordingPlaceholderOptions): Plugin
  export function getVoiceRecordingPlaceholder(state: EditorState): VoiceRecordingPlaceholder | null
  export function showVoiceRecordingPlaceholder(view: EditorView, id: string): void
  export function setVoiceRecordingPlaceholderPhase(view: EditorView, id: string, phase: VoiceRecordingPhase): void
  export function removeVoiceRecordingPlaceholder(view: EditorView, id: string): void
  export function replaceVoiceRecordingPlaceholder(view: EditorView, id: string, node: PMNode): boolean
  ```
- `CreateNevoEditorStateOptions` gains:
  ```ts
  onVoiceRecordingRequest?: () => void
  voiceRecordingPlaceholder?: VoiceRecordingPlaceholderOptions
  ```

- [ ] **Step 1: Write failing tests**

Look at an existing editor-core test (e.g. `src/editor-core/__tests__/slash.test.ts`) for how the schema and an `EditorView` are built in jsdom, and reuse its helpers. Tests:
```ts
import { describe, expect, it, vi } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createNevoSchema } from '../schema' // use the same schema factory other tests use
import {
  createVoiceRecordingPlaceholderPlugin,
  getVoiceRecordingPlaceholder,
  removeVoiceRecordingPlaceholder,
  replaceVoiceRecordingPlaceholder,
  setVoiceRecordingPlaceholderPhase,
  showVoiceRecordingPlaceholder,
} from '../plugins/voice-recording-placeholder'

const schema = createNevoSchema()

function makeView(paragraphs: string[], cursorInParagraph = 0) {
  const doc = schema.node('doc', null, paragraphs.map(text =>
    schema.node('paragraph', null, text ? [schema.text(text)] : [])))
  const options = { t: (k: string) => k, onStop: vi.fn(), onCancel: vi.fn(), getElapsedMs: () => 65_000 }
  let state = EditorState.create({ doc, plugins: [createVoiceRecordingPlaceholderPlugin(options)] })
  let offset = 1
  for (let i = 0; i < cursorInParagraph; i++) offset += doc.child(i).nodeSize
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, offset)))
  const view = new EditorView(document.createElement('div'), { state })
  return { view, options }
}

function audioNode() {
  return schema.nodes.media_block.create({ kind: 'audio', src: '.nevo/assets/a.wav', name: 'R.wav', mime: 'audio/wav', size: 3, duration: 1.2, poster: '' })
}

describe('voice recording placeholder', () => {
  it('shows a widget before the cursor block and renders timer and buttons', () => {
    const { view, options } = makeView(['first', ''], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    const placeholder = getVoiceRecordingPlaceholder(view.state)!
    expect(placeholder).toMatchObject({ id: 'r1', phase: 'recording', pos: view.state.doc.child(0).nodeSize })
    const widget = view.dom.querySelector('[data-voice-recording-placeholder]')!
    expect(widget.textContent).toContain('01:05')
    ;(widget.querySelector('[data-action="stop"]') as HTMLButtonElement).click()
    expect(options.onStop).toHaveBeenCalledWith('r1')
    ;(widget.querySelector('[data-action="cancel"]') as HTMLButtonElement).click()
    expect(options.onCancel).toHaveBeenCalledWith('r1')
  })

  it('maps its position when text is inserted before it', () => {
    const { view } = makeView(['first', ''], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    const before = getVoiceRecordingPlaceholder(view.state)!.pos
    view.dispatch(view.state.tr.insertText('abc', 1))
    expect(getVoiceRecordingPlaceholder(view.state)!.pos).toBe(before + 3)
  })

  it('disables buttons in the saving phase', () => {
    const { view } = makeView([''], 0)
    showVoiceRecordingPlaceholder(view, 'r1')
    setVoiceRecordingPlaceholderPhase(view, 'r1', 'saving')
    const stop = view.dom.querySelector('[data-action="stop"]') as HTMLButtonElement
    expect(stop.disabled).toBe(true)
  })

  it('replaces the empty paragraph it sits before with the audio block', () => {
    const { view } = makeView(['first', ''], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    expect(replaceVoiceRecordingPlaceholder(view, 'r1', audioNode())).toBe(true)
    expect(view.state.doc.childCount).toBe(2)
    expect(view.state.doc.child(1).type.name).toBe('media_block')
    expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
  })

  it('inserts before a non-empty paragraph without replacing it', () => {
    const { view } = makeView(['first', 'typed later'], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    replaceVoiceRecordingPlaceholder(view, 'r1', audioNode())
    expect(view.state.doc.child(1).type.name).toBe('media_block')
    expect(view.state.doc.child(2).textContent).toBe('typed later')
  })

  it('still inserts when the anchor paragraph is deleted', () => {
    const { view } = makeView(['first', 'second'], 1)
    showVoiceRecordingPlaceholder(view, 'r1')
    view.dispatch(view.state.tr.delete(0, view.state.doc.content.size))
    expect(replaceVoiceRecordingPlaceholder(view, 'r1', audioNode())).toBe(true)
    let found = false
    view.state.doc.descendants(node => { if (node.type.name === 'media_block') found = true })
    expect(found).toBe(true)
  })

  it('ignores actions for another id and removes cleanly', () => {
    const { view } = makeView([''], 0)
    showVoiceRecordingPlaceholder(view, 'r1')
    removeVoiceRecordingPlaceholder(view, 'other')
    expect(getVoiceRecordingPlaceholder(view.state)).not.toBeNull()
    removeVoiceRecordingPlaceholder(view, 'r1')
    expect(getVoiceRecordingPlaceholder(view.state)).toBeNull()
    expect(replaceVoiceRecordingPlaceholder(view, 'r1', audioNode())).toBe(false)
  })

  it('never changes the document when shown', () => {
    const { view } = makeView(['a'], 0)
    const before = view.state.doc.toJSON()
    showVoiceRecordingPlaceholder(view, 'r1')
    expect(view.state.doc.toJSON()).toEqual(before)
  })

  it('treats Escape inside the widget as cancel', () => {
    const { view, options } = makeView([''], 0)
    showVoiceRecordingPlaceholder(view, 'r1')
    const widget = view.dom.querySelector('[data-voice-recording-placeholder]')!
    widget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(options.onCancel).toHaveBeenCalledWith('r1')
  })
})
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/editor-core/__tests__/voice-recording-placeholder.test.ts` → FAIL.

- [ ] **Step 3: Implement the plugin**

```ts
import type { Node as PMNode } from 'prosemirror-model'
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'

export type VoiceRecordingPhase = 'recording' | 'saving'

export interface VoiceRecordingPlaceholder {
  id: string
  pos: number
  phase: VoiceRecordingPhase
}

export interface VoiceRecordingPlaceholderOptions {
  t: (key: string) => string
  onStop: (id: string) => void
  onCancel: (id: string) => void
  getElapsedMs: (id: string) => number
}

type Meta =
  | { type: 'show', id: string, pos: number }
  | { type: 'phase', id: string, phase: VoiceRecordingPhase }
  | { type: 'remove', id: string }

export const voiceRecordingPlaceholderKey = new PluginKey<VoiceRecordingPlaceholder | null>('voice-recording-placeholder')

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function renderWidget(placeholder: VoiceRecordingPlaceholder, options: VoiceRecordingPlaceholderOptions): HTMLElement {
  const { id, phase } = placeholder
  const root = document.createElement('div')
  root.className = 'nv-voice-recording'
  root.dataset.voiceRecordingPlaceholder = id
  root.dataset.phase = phase
  root.contentEditable = 'false'
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', options.t('voiceRecording.recording'))

  const dot = document.createElement('span')
  dot.className = 'nv-voice-recording-dot'
  dot.setAttribute('aria-hidden', 'true')

  const label = document.createElement('span')
  label.className = 'nv-voice-recording-label'
  label.textContent = options.t(phase === 'saving' ? 'voiceRecording.saving' : 'voiceRecording.recording')

  const timer = document.createElement('span')
  timer.className = 'nv-voice-recording-timer'
  timer.setAttribute('role', 'timer')
  timer.textContent = formatElapsed(options.getElapsedMs(id))

  const makeButton = (action: 'stop' | 'cancel') => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `nv-voice-recording-btn nv-voice-recording-btn--${action}`
    button.dataset.action = action
    button.textContent = options.t(`voiceRecording.${action}`)
    button.setAttribute('aria-label', options.t(`voiceRecording.${action}`))
    button.disabled = phase === 'saving'
    button.addEventListener('mousedown', event => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      if (action === 'stop') options.onStop(id)
      else options.onCancel(id)
    })
    return button
  }

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && phase === 'recording') {
      event.preventDefault()
      event.stopPropagation()
      options.onCancel(id)
    }
  })

  root.append(dot, label, timer, makeButton('stop'), makeButton('cancel'))

  if (phase === 'recording') {
    const interval = setInterval(() => {
      if (!root.isConnected) { clearInterval(interval); return }
      timer.textContent = formatElapsed(options.getElapsedMs(id))
    }, 500)
    ;(root as HTMLElement & { _nvStopTimer?: () => void })._nvStopTimer = () => clearInterval(interval)
  }
  return root
}

export function createVoiceRecordingPlaceholderPlugin(options: VoiceRecordingPlaceholderOptions): Plugin {
  return new Plugin<VoiceRecordingPlaceholder | null>({
    key: voiceRecordingPlaceholderKey,
    state: {
      init: () => null,
      apply(tr, value) {
        let next = value ? { ...value, pos: tr.mapping.map(value.pos, -1) } : null
        const meta = tr.getMeta(voiceRecordingPlaceholderKey) as Meta | undefined
        if (!meta) return next
        if (meta.type === 'show') return { id: meta.id, pos: meta.pos, phase: 'recording' }
        if (!next || next.id !== meta.id) return next
        if (meta.type === 'phase') next = { ...next, phase: meta.phase }
        if (meta.type === 'remove') next = null
        return next
      },
    },
    props: {
      decorations(state) {
        const placeholder = voiceRecordingPlaceholderKey.getState(state)
        if (!placeholder) return null
        const widget = Decoration.widget(placeholder.pos, () => renderWidget(placeholder, options), {
          side: -1,
          key: `voice-recording-${placeholder.id}-${placeholder.phase}`,
          ignoreSelection: true,
          stopEvent: () => true,
          destroy: node => (node as HTMLElement & { _nvStopTimer?: () => void })._nvStopTimer?.(),
        })
        return DecorationSet.create(state.doc, [widget])
      },
    },
  })
}

export function getVoiceRecordingPlaceholder(state: EditorState): VoiceRecordingPlaceholder | null {
  return voiceRecordingPlaceholderKey.getState(state) ?? null
}

/** Anchors the placeholder at the start of the block containing the cursor. */
export function showVoiceRecordingPlaceholder(view: EditorView, id: string): void {
  const { $from } = view.state.selection
  const pos = $from.depth > 0 ? $from.before($from.depth) : $from.pos
  view.dispatch(view.state.tr.setMeta(voiceRecordingPlaceholderKey, { type: 'show', id, pos } satisfies Meta))
  requestAnimationFrame(() => {
    const stop = view.dom.querySelector<HTMLButtonElement>(`[data-voice-recording-placeholder="${id}"] [data-action="stop"]`)
    stop?.focus()
  })
}

export function setVoiceRecordingPlaceholderPhase(view: EditorView, id: string, phase: VoiceRecordingPhase): void {
  view.dispatch(view.state.tr.setMeta(voiceRecordingPlaceholderKey, { type: 'phase', id, phase } satisfies Meta))
}

export function removeVoiceRecordingPlaceholder(view: EditorView, id: string): void {
  view.dispatch(view.state.tr.setMeta(voiceRecordingPlaceholderKey, { type: 'remove', id } satisfies Meta))
}

/** Inserts `node` where the placeholder is (replacing an empty paragraph right
 *  after it), falling back to the end of the document when that position
 *  cannot hold a block. Returns false when no placeholder with `id` exists. */
export function replaceVoiceRecordingPlaceholder(view: EditorView, id: string, node: PMNode): boolean {
  const placeholder = getVoiceRecordingPlaceholder(view.state)
  if (!placeholder || placeholder.id !== id) return false
  const { state } = view
  const tr = state.tr.setMeta(voiceRecordingPlaceholderKey, { type: 'remove', id } satisfies Meta)
  const pos = Math.min(placeholder.pos, state.doc.content.size)
  const $pos = state.doc.resolve(pos)
  const index = $pos.index()
  const after = $pos.parent.maybeChild(index)
  if (after && after.type.name === 'paragraph' && after.content.size === 0
    && $pos.parent.canReplaceWith(index, index + 1, node.type)) {
    tr.replaceWith(pos, pos + after.nodeSize, node)
  } else if ($pos.parent.canReplaceWith(index, index, node.type)) {
    tr.insert(pos, node)
  } else {
    tr.insert(state.doc.content.size, node)
  }
  view.dispatch(tr.scrollIntoView())
  return true
}
```
If jsdom lacks `requestAnimationFrame`, guard it: `(globalThis.requestAnimationFrame ?? setTimeout)(...)`.

- [ ] **Step 4: Register in `state.ts`**

Add to `CreateNevoEditorStateOptions`:
```ts
  /** Adds the `voice-recording` slash item; the host owns the session. */
  onVoiceRecordingRequest?: () => void
  voiceRecordingPlaceholder?: VoiceRecordingPlaceholderOptions
```
After the `core.template.insert` block:
```ts
  if (options.onVoiceRecordingRequest) {
    commandRegistry.set('core.voiceRecording.start', () => {
      options.onVoiceRecordingRequest?.()
      return true
    })
  }
```
After the `insert-template` slash push:
```ts
  if (commandRegistry.has('core.voiceRecording.start')) {
    const audioIdx = slashItems.findIndex(item => item.id === 'audio')
    slashItems.splice(audioIdx === -1 ? slashItems.length : audioIdx + 1, 0, {
      id: 'voice-recording',
      title: 'Voice recording',
      category: 'media',
      keywords: ['record', 'microphone', 'mic', 'voice', 'dictaphone'],
      run: ({ state, dispatch }) => {
        commandRegistry.get('core.voiceRecording.start')?.(state, dispatch)
      },
    })
  }
```
Next to `plugins.push(createAiStreamingPlugin())`:
```ts
  if (options.voiceRecordingPlaceholder) {
    plugins.push(createVoiceRecordingPlaceholderPlugin(options.voiceRecordingPlaceholder))
  }
```

- [ ] **Step 5: Add a state-level test** in the same test file:
```ts
it('adds the voice-recording slash item only when a request handler is given', () => {
  // build with createNevoEditorState({ schema, content: <empty doc JSON used by other state tests>, onVoiceRecordingRequest: vi.fn() })
  // expect(setup.slashItems.some(i => i.id === 'voice-recording')).toBe(true)
  // and without the option: false
})
```
Fill it in using the exact `createNevoEditorState` return shape (`NevoEditorStateSetup`) and the empty-content fixture from `src/editor-core/__tests__/slash.test.ts`.

- [ ] **Step 6: Run** the test file plus `src/editor-core/__tests__/slash.test.ts`, `serialization.test.ts`, `regression.test.ts` → PASS.

---

### Task 4: Active recording registry

**Files:**
- Create: `src/core/voice-recording/activeRecording.ts`, `src/core/voice-recording/activeRecording.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function setActiveRecording(id: string, finalize: () => Promise<void>): void
  export function clearActiveRecording(id: string): void
  export function hasActiveRecording(): boolean
  export function finalizeActiveRecording(): Promise<void>
  ```

- [ ] **Step 1: Failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearActiveRecording, finalizeActiveRecording, hasActiveRecording, setActiveRecording } from './activeRecording'

afterEach(() => clearActiveRecording('a'))

describe('activeRecording', () => {
  it('is a no-op when nothing is recording', async () => {
    expect(hasActiveRecording()).toBe(false)
    await expect(finalizeActiveRecording()).resolves.toBeUndefined()
  })

  it('awaits the active finalizer once, even with concurrent callers', async () => {
    let resolve!: () => void
    const finalize = vi.fn(() => new Promise<void>(r => { resolve = r }))
    setActiveRecording('a', finalize)
    const p1 = finalizeActiveRecording()
    const p2 = finalizeActiveRecording()
    resolve()
    await Promise.all([p1, p2])
    expect(finalize).toHaveBeenCalledTimes(1)
  })

  it('clear only removes its own id', () => {
    setActiveRecording('a', async () => {})
    clearActiveRecording('b')
    expect(hasActiveRecording()).toBe(true)
  })

  it('swallows finalizer errors so navigation is never blocked', async () => {
    setActiveRecording('a', async () => { throw new Error('x') })
    await expect(finalizeActiveRecording()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

```ts
// Framework-agnostic handle on the single in-progress voice recording, so
// navigation and app-close code can finalize it while the editor is still
// mounted without importing editor or Vue internals.

interface ActiveRecording {
  id: string
  finalize: () => Promise<void>
  inflight: Promise<void> | null
}

let active: ActiveRecording | null = null

export function setActiveRecording(id: string, finalize: () => Promise<void>): void {
  active = { id, finalize, inflight: null }
}

export function clearActiveRecording(id: string): void {
  if (active?.id === id) active = null
}

export function hasActiveRecording(): boolean {
  return active !== null
}

export async function finalizeActiveRecording(): Promise<void> {
  const current = active
  if (!current) return
  current.inflight ??= current.finalize().catch(() => {})
  await current.inflight
}
```

- [ ] **Step 4: Run** → PASS.

---

### Task 5: `useVoiceRecording` composable

**Files:**
- Create: `src/app/composables/editor/useVoiceRecording.ts`, `src/app/composables/editor/useVoiceRecording.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 4; `useToast` (`src/ui/composables/useToast.ts`); `i18n.global.t`.
- Produces:
  ```ts
  export interface VoiceRecordingEditorBindings {
    request: () => void
    placeholder: Omit<VoiceRecordingPlaceholderOptions, 't'>
    onEditorDestroy: () => void
  }
  export function useVoiceRecording(core: EditorCore, getWorkspacePath: () => string | null, onOverlaysUpdate?: () => void): {
    bindings: VoiceRecordingEditorBindings
    start: () => Promise<void>
    stop: (id: string) => Promise<void>
    cancel: (id: string) => Promise<void>
  }
  ```

- [ ] **Step 1: Failing tests**

Mock `../../../tauri/voiceRecording` (keep the real `voiceRecordingErrorCode` via `vi.importActual`), mock `../../../ui/composables/useToast` to capture `showToast`, and build a real `EditorView` with the placeholder plugin (reuse the helper from Task 3's test; extract it to `src/editor-core/__tests__/helpers/voiceRecordingView.ts` if useful). Cases:
```ts
it('start shows placeholder, registers active recording, calls start')
it('stop replaces placeholder with media_block {kind:"audio", duration: durationMs/1000} and clears active')
it('double stop only calls stopVoiceRecording once')              // Review Focus 3
it('permission_denied on start removes placeholder and shows the permission toast')
it('import_failed on stop removes placeholder and shows saveFailed toast') // Review Focus 4
it('cancel calls cancelVoiceRecording and removes placeholder')
it('second start while active shows alreadyRecording toast and does not call start')
it('onEditorDestroy while recording stops, imports and shows savedNotInserted') // Review Focus 5
it('finalizeActiveRecording() inserts the block while the view is alive')
```
Example body for the first two:
```ts
it('stop replaces placeholder with an audio media_block', async () => {
  voice.startVoiceRecording.mockResolvedValue(undefined)
  voice.stopVoiceRecording.mockResolvedValue({ src: '.nevo/assets/h-r.wav', name: 'R.wav', mime: 'audio/wav', size: 10, durationMs: 2500 })
  const { core, view } = makeCore([''])
  const rec = useVoiceRecording(core, () => '/ws')
  await rec.start()
  const id = getVoiceRecordingPlaceholder(view.state)!.id
  await rec.stop(id)
  expect(voice.stopVoiceRecording).toHaveBeenCalledWith('/ws', 'voiceRecording.fileLabel')
  const media = view.state.doc.firstChild!
  expect(media.type.name).toBe('media_block')
  expect(media.attrs).toMatchObject({ kind: 'audio', src: '.nevo/assets/h-r.wav', mime: 'audio/wav', size: 10, duration: 2.5 })
  expect(hasActiveRecording()).toBe(false)
})
```
`makeCore` returns `{ core: { editorView: view } as unknown as EditorCore, view }`. Mock `i18n` so `t` returns the key.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

```ts
import { i18n } from '../../../i18n'
import {
  getVoiceRecordingPlaceholder,
  removeVoiceRecordingPlaceholder,
  replaceVoiceRecordingPlaceholder,
  setVoiceRecordingPlaceholderPhase,
  showVoiceRecordingPlaceholder,
  type VoiceRecordingPlaceholderOptions,
} from '../../../editor-core/plugins/voice-recording-placeholder'
import { clearActiveRecording, hasActiveRecording, setActiveRecording } from '../../../core/voice-recording/activeRecording'
import {
  cancelVoiceRecording,
  startVoiceRecording,
  stopVoiceRecording,
  voiceRecordingErrorCode,
  type RecordedAudioAsset,
} from '../../../tauri/voiceRecording'
import { useToast } from '../../../ui/composables/useToast'
import type { EditorCore } from './useEditorCore'

export interface VoiceRecordingEditorBindings {
  request: () => void
  placeholder: Omit<VoiceRecordingPlaceholderOptions, 't'>
  onEditorDestroy: () => void
}

const START_ERROR_KEYS: Record<string, string> = {
  permission_denied: 'voiceRecording.errors.permissionDenied',
  no_device: 'voiceRecording.errors.noDevice',
  already_recording: 'voiceRecording.errors.alreadyRecording',
}

export function useVoiceRecording(
  core: EditorCore,
  getWorkspacePath: () => string | null,
  onOverlaysUpdate: () => void = () => {},
) {
  const { showToast } = useToast()
  const t = (key: string) => i18n.global.t(key)
  let session: { id: string, startedAt: number, stopping: boolean } | null = null

  function toastError(key: string) {
    showToast({ message: t(key), variant: 'error' })
  }

  function mediaAttrs(asset: RecordedAudioAsset) {
    return {
      kind: 'audio',
      src: asset.src,
      name: asset.name,
      mime: asset.mime,
      size: asset.size,
      duration: asset.durationMs > 0 ? asset.durationMs / 1000 : null,
      poster: '',
    }
  }

  async function start() {
    const view = core.editorView
    if (!view) return
    if (hasActiveRecording() || session) {
      toastError('voiceRecording.errors.alreadyRecording')
      return
    }
    const id = crypto.randomUUID()
    session = { id, startedAt: Date.now(), stopping: false }
    showVoiceRecordingPlaceholder(view, id)
    setActiveRecording(id, () => stop(id))
    try {
      await startVoiceRecording()
      if (session?.id === id) session.startedAt = Date.now()
    } catch (error) {
      clearActiveRecording(id)
      session = null
      if (core.editorView) removeVoiceRecordingPlaceholder(core.editorView, id)
      toastError(START_ERROR_KEYS[voiceRecordingErrorCode(error)] ?? 'voiceRecording.errors.startFailed')
    }
  }

  async function stop(id: string) {
    if (!session || session.id !== id || session.stopping) return
    session.stopping = true
    const workspacePath = getWorkspacePath()
    if (core.editorView) setVoiceRecordingPlaceholderPhase(core.editorView, id, 'saving')
    try {
      if (!workspacePath) {
        await cancelVoiceRecording()
        if (core.editorView) removeVoiceRecordingPlaceholder(core.editorView, id)
        return
      }
      const asset = await stopVoiceRecording(workspacePath, t('voiceRecording.fileLabel'))
      const view = core.editorView
      const mediaType = view?.state.schema.nodes.media_block
      const inserted = view && mediaType
        ? replaceVoiceRecordingPlaceholder(view, id, mediaType.create(mediaAttrs(asset)))
        : false
      if (inserted) onOverlaysUpdate()
      else showToast({ message: t('voiceRecording.savedNotInserted'), variant: 'info' })
    } catch (error) {
      if (core.editorView) removeVoiceRecordingPlaceholder(core.editorView, id)
      toastError(voiceRecordingErrorCode(error) === 'import_failed'
        ? 'voiceRecording.errors.saveFailed'
        : 'voiceRecording.errors.stopFailed')
    } finally {
      clearActiveRecording(id)
      if (session?.id === id) session = null
    }
  }

  async function cancel(id: string) {
    if (!session || session.id !== id || session.stopping) return
    session.stopping = true
    try {
      await cancelVoiceRecording()
    } catch {
      // The temp file is left in the cache dir; nothing references it.
    } finally {
      if (core.editorView) removeVoiceRecordingPlaceholder(core.editorView, id)
      clearActiveRecording(id)
      if (session?.id === id) session = null
    }
  }

  const bindings: VoiceRecordingEditorBindings = {
    request: () => { void start() },
    placeholder: {
      onStop: id => { void stop(id) },
      onCancel: id => { void cancel(id) },
      getElapsedMs: id => (session?.id === id ? Date.now() - session.startedAt : 0),
    },
    // Safety net only: navigation/app-close hooks finalize earlier via
    // finalizeActiveRecording(). Here the view is going away, so the block
    // cannot be inserted — stop() reports "saved to assets, not inserted".
    onEditorDestroy: () => {
      if (!session || session.stopping) return
      const id = session.id
      const view = core.editorView
      if (view && getVoiceRecordingPlaceholder(view.state)?.id === id) removeVoiceRecordingPlaceholder(view, id)
      void stop(id)
    },
  }

  return { bindings, start, stop, cancel }
}
```
Adjust the `i18n` import path to the actual export of `src/i18n.ts`. Note `onEditorDestroy` removes the placeholder first so `replaceVoiceRecordingPlaceholder` returns false and the "not inserted" toast fires even if the view still exists at that instant.

- [ ] **Step 4: Run** → PASS.

---

### Task 6: Wiring — editor hosts, finalize hooks, slash UI, styles, i18n

**Files:**
- Modify: `src/app/composables/editor/useEditorCore.ts`, `src/app/composables/editor/useWorkspaceEditorCore.ts`, `src/app/components/WorkspaceEditorPane.vue`, `src/app/components/editor/EditorSurface.vue`, `src/app/WorkspaceShell.vue`, `src/router/index.ts`, `src/composables/useAppCloseGuard.ts`, `src/app/composables/editor/useSlashMenuGroups.ts`, `src/utils/slashBlockPreview.ts`, `src/styles/editor-prose/prose-links-embeds.css`, `src/locales/{en,ru,fr,es,de}.json`
- Tests: extend `src/app/components/editor/EditorSlashMenu.test.ts` or `src/utils/slashBlockPreview.test.ts`; add `src/composables/useAppCloseGuard.test.ts` case if that file exists (else a focused new test); router guard test in `src/router/index.test.ts` (create).

**Interfaces:**
- Consumes: `VoiceRecordingEditorBindings` (Task 5), `finalizeActiveRecording` (Task 4), state options (Task 3).

- [ ] **Step 1: `useEditorCore.ts`**

Add to the callbacks interface (next to `onTemplateInsertRequest`):
```ts
  voiceRecording?: VoiceRecordingEditorBindings
```
In `createNevoEditorState({...})` options (the host passes `voiceRecording` only when `isVoiceRecordingSupported()`; see Step 2):
```ts
      onVoiceRecordingRequest: callbacks.voiceRecording?.request,
      voiceRecordingPlaceholder: callbacks.voiceRecording
        ? { ...callbacks.voiceRecording.placeholder, t: (key: string) => i18n.global.t(key) }
        : undefined,
```
In `destroyEditorView()`, first line (before `flushPendingContentUpdate()`):
```ts
    callbacks.voiceRecording?.onEditorDestroy()
```
Do NOT touch `flushPendingContentUpdate` / `registerEditorPersistence` (autosave path — Review Focus 1).

- [ ] **Step 2: Hosts**

`useWorkspaceEditorCore.ts`: add option `voiceRecording?: VoiceRecordingEditorBindings` and pass `voiceRecording: options.voiceRecording` into the callbacks object.
`WorkspaceEditorPane.vue` (after `useMediaUpload` at line ~365):
```ts
const voiceRecording = useVoiceRecording(core, () => props.workspacePath, overlays.updateOverlays)
```
and pass `voiceRecording: isVoiceRecordingSupported() ? voiceRecording.bindings : undefined` in the `useWorkspaceEditorCore({...})` options (near `requestMediaPicker`).
`EditorSurface.vue` (after `useMediaUpload` at line ~132): same composable call, and `voiceRecording: isVoiceRecordingSupported() ? voiceRecording.bindings : undefined` in its callbacks object (near `onMediaPickerRequest`).

- [ ] **Step 3: Finalize hooks (write tests first)**

`src/router/index.ts`, after `createRouter`:
```ts
// Finalize an in-progress voice recording while the editor is still mounted,
// so the recorded block is inserted and saved before the view unmounts.
router.beforeEach(async () => {
  await finalizeActiveRecording()
})
```
`WorkspaceShell.vue` `watch(activeNoteId, ...)`: first line inside the callback:
```ts
  await finalizeActiveRecording()
```
`useAppCloseGuard.ts` `flushAndClose()`: right after `closing = true`:
```ts
    await finalizeActiveRecording()
```
Tests:
- router: `setActiveRecording('x', finalize)`, `await router.push('/workspace/settings')` (use `createMemoryHistory` variant if the module's router can't be driven in jsdom — then test the guard function by exporting it as `finalizeRecordingBeforeNavigation` and asserting it calls `finalizeActiveRecording`).
- close guard: with a mocked `noteStore.flushDurably`, assert `finalize` resolves before `flushDurably` is called (record call order in an array).
- autosave (Review Focus 1): in `useVoiceRecording.test.ts`, assert that after `start()` a `persistActiveNote`-style flush does not stop the recording — concretely: call the registered editor persistence `flushContent()` via `getEditorSession(noteId)` in an `useEditorCore` test if one exists; otherwise assert by grep in review that `flushContent` has no reference to voice recording (note this in the task report).

- [ ] **Step 4: Slash UI**

`useSlashMenuGroups.ts`: import `Mic` from `lucide-vue-next`, add `'voice-recording': Mic,` to `slashIconById`.
`slashBlockPreview.ts`: add `'voice-recording': 'audio',` to `kinds`. Add a test case in `slashBlockPreview.test.ts`: `expect(slashPreviewKind('voice-recording')).toBe('audio')`.

- [ ] **Step 5: Styles** — append to `src/styles/editor-prose/prose-links-embeds.css` using existing tokens (check `src/styles/tokens.css` for exact names; mirror `.nv-media-block` spacing/radius):
```css
.doc-editor .nv-prosemirror .nv-voice-recording {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  margin: var(--space-2) 0;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-primary);
  user-select: none;
}
.doc-editor .nv-prosemirror .nv-voice-recording-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--danger);
  animation: nv-voice-pulse 1.2s ease-in-out infinite;
}
.doc-editor .nv-prosemirror .nv-voice-recording[data-phase='saving'] .nv-voice-recording-dot {
  animation: none;
  opacity: 0.5;
}
.doc-editor .nv-prosemirror .nv-voice-recording-timer {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  margin-right: auto;
}
.doc-editor .nv-prosemirror .nv-voice-recording-btn {
  min-height: 32px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
}
.doc-editor .nv-prosemirror .nv-voice-recording-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
@keyframes nv-voice-pulse {
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .doc-editor .nv-prosemirror .nv-voice-recording-dot { animation: none; }
}
```
Replace every token with the real names from `tokens.css`; reuse the button class used by the audio player (`nv-media-*`) if one exists instead of new button styling.

- [ ] **Step 6: i18n (use the `nevo-i18n-key` skill)**

Add to each locale, appending as text:
- `slashMenu.items.voice_recording`
- `voiceRecording.recording`, `.saving`, `.stop`, `.cancel`, `.fileLabel`, `.savedNotInserted`
- `voiceRecording.errors.permissionDenied`, `.noDevice`, `.alreadyRecording`, `.startFailed`, `.stopFailed`, `.saveFailed`

| key | en | ru |
| --- | --- | --- |
| slashMenu.items.voice_recording | Voice recording | Запись голоса |
| voiceRecording.recording | Recording | Запись |
| voiceRecording.saving | Saving… | Сохранение… |
| voiceRecording.stop | Stop | Стоп |
| voiceRecording.cancel | Cancel | Отмена |
| voiceRecording.fileLabel | Recording | Запись |
| voiceRecording.savedNotInserted | The recording was saved to workspace assets but could not be inserted into the note. | Запись сохранена в ассеты рабочего пространства, но не вставлена в заметку. |
| errors.permissionDenied | Microphone access denied. Allow it in system settings and try again. | Нет доступа к микрофону. Разрешите его в системных настройках и попробуйте снова. |
| errors.noDevice | No microphone found. | Микрофон не найден. |
| errors.alreadyRecording | A recording is already in progress. | Запись уже идёт. |
| errors.startFailed | Could not start recording. | Не удалось начать запись. |
| errors.stopFailed | Could not stop recording. | Не удалось остановить запись. |
| errors.saveFailed | The recording could not be saved. The audio file was kept in the app cache. | Не удалось сохранить запись. Аудиофайл оставлен в кеше приложения. |

fr/es/de: translate the en column.

- [ ] **Step 7: Run focused checks**

```
pnpm exec vitest run src/tauri/voiceRecording.test.ts src/editor-core/__tests__/voice-recording-placeholder.test.ts src/core/voice-recording src/app/composables/editor/useVoiceRecording.test.ts src/utils/slashBlockPreview.test.ts src/app/components/editor/EditorSlashMenu.test.ts src/editor-core/__tests__/slash.test.ts src/editor-core/__tests__/serialization.test.ts src/editor-core/__tests__/regression.test.ts src/locales/locales.test.ts src/i18n.test.ts
pnpm exec eslint <changed ts/vue files>
pnpm build
```
Expected: all PASS.

---

### Task 7: Docs, full verification, visual QA, changelog

**Files:**
- Modify: `ARCHITECTURE.md`, `docs/data-model.md`, `changes.md`

- [ ] **Step 1: Docs**

`ARCHITECTURE.md`: in the Tauri/backend section add a short paragraph: voice capture is in-house (`commands/voice_recording`: cpal capture thread + hound WAV, desktop-only; commands return `unsupported` on mobile); recordings go to `<app_cache>/voice-recordings/` and are imported into assets on stop; `src/core/voice-recording/activeRecording.ts` is finalized by the router guard, the `activeNoteId` watcher and the app-close guard.
`docs/data-model.md`: one line under media assets: voice recordings are ordinary `media_block` (`kind: 'audio'`) assets (`audio/wav` desktop, `audio/mp4` mobile); no schema change.

- [ ] **Step 2: Full checks**

```
git diff --check
pnpm lint
pnpm test:run
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 3: Visual QA** (`nevo-visual-qa` skill, `pnpm qa`): open a note, type `/voice`, select the item; screenshot placeholder in light and dark; Tab to Stop/Cancel for focus ring; press Stop. If headless GNOME has no capture device, the expected result is the `noDevice` toast with no leftover placeholder — record that and state real capture was not verified. Mobile is out of scope for v1 (feature hidden) — state it.

- [ ] **Step 4: `changes.md`** (after checks pass), top of `## 🆕 Added`:
```markdown
### Voice Recording Block
* **Record in the editor**: Added a `/Voice recording` slash command that records from the microphone into an inline placeholder and inserts an audio block on Stop.
* **Native capture**: In-house desktop capture (cpal + hound, mono 16-bit WAV); files are imported into workspace assets after recording. Hidden on mobile for now.
* **Safe navigation**: An in-progress recording is finalized and inserted before switching notes, leaving the workspace route, or closing the app.
```

- [ ] **Step 5:** `graphify update .`
