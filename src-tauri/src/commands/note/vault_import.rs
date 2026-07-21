use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

use super::assets::store_workspace_asset;
use super::ImportedImageAsset;
use crate::commands::path_utils::normalize_workspace_path;

/// Mirrors `MAX_LOCAL_ASSET_BYTES` in `assets/import.rs` — attachments larger
/// than this are rejected rather than read fully into memory.
const MAX_VAULT_ASSET_BYTES: u64 = 100 * 1024 * 1024;

/// Notes larger than this go to `skipped` instead of being read into the
/// manifest, so a single huge file can't balloon the IPC payload.
const MAX_NOTE_BYTES: u64 = 5 * 1024 * 1024;

/// Guardrails against runaway imports on unexpectedly large directory trees.
const MAX_ENTRIES_VISITED: usize = 50_000;
const MAX_COLLECTED_ITEMS: usize = 20_000;
const MAX_WALK_DEPTH: u32 = 32;

const NOTE_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd"];
const ATTACHMENT_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "pdf", "mp3", "wav", "m4a", "ogg",
    "flac", "mp4", "webm", "mov",
];

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultNote {
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultAsset {
    pub relative_path: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultSkipped {
    pub relative_path: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultManifest {
    pub root_name: String,
    pub notes: Vec<VaultNote>,
    pub assets: Vec<VaultAsset>,
    pub skipped: Vec<VaultSkipped>,
}

/// Heavy filesystem walk — offloaded to the blocking pool so a large vault
/// never stalls the WebKitGTK main thread (see AGENTS.md "Platform Gotchas").
#[tauri::command]
pub async fn read_obsidian_vault(vault_path: String) -> Result<VaultManifest, String> {
    tauri::async_runtime::spawn_blocking(move || read_obsidian_vault_inner(vault_path))
        .await
        .map_err(|error| error.to_string())?
}

fn read_obsidian_vault_inner(vault_path: String) -> Result<VaultManifest, String> {
    let normalized = normalize_workspace_path(&vault_path)?;
    let canonical_root = normalized
        .canonicalize()
        .map_err(|error| format!("Vault path does not exist: {error}"))?;
    if !canonical_root.is_dir() {
        return Err("Vault path is not a directory".to_string());
    }

    let root_name = canonical_root
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| canonical_root.to_string_lossy().into_owned());

    let mut state = WalkState::default();
    let mut notes = Vec::new();
    let mut assets = Vec::new();
    let mut skipped = Vec::new();

    walk_vault(
        &canonical_root,
        &canonical_root,
        0,
        &mut state,
        &mut notes,
        &mut assets,
        &mut skipped,
    );

    notes.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    assets.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    Ok(VaultManifest {
        root_name,
        notes,
        assets,
        skipped,
    })
}

#[derive(Default)]
struct WalkState {
    entries_visited: usize,
    collected: usize,
}

impl WalkState {
    fn should_stop(&self) -> bool {
        self.entries_visited >= MAX_ENTRIES_VISITED || self.collected >= MAX_COLLECTED_ITEMS
    }
}

fn to_posix_relative(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

/// Obsidian-internal and VCS directories are never descended into. Named
/// examples (`.obsidian`, `.trash`, `.git`, `.nevo`) are all covered by the
/// leading-dot rule, which also protects against any other hidden config dir.
fn is_skipped_dir_name(name: &str) -> bool {
    name.starts_with('.')
}

#[allow(clippy::too_many_arguments)]
fn walk_vault(
    root: &Path,
    dir: &Path,
    depth: u32,
    state: &mut WalkState,
    notes: &mut Vec<VaultNote>,
    assets: &mut Vec<VaultAsset>,
    skipped: &mut Vec<VaultSkipped>,
) {
    if depth > MAX_WALK_DEPTH || state.should_stop() {
        return;
    }

    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        if state.should_stop() {
            return;
        }
        state.entries_visited += 1;
        if state.should_stop() {
            return;
        }

        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() {
            let dir_name = entry.file_name();
            if is_skipped_dir_name(&dir_name.to_string_lossy()) {
                continue;
            }
            walk_vault(root, &path, depth + 1, state, notes, assets, skipped);
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        let relative_path = to_posix_relative(relative);

        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();

        if NOTE_EXTENSIONS.contains(&extension.as_str()) {
            collect_note(&path, relative_path, notes, skipped, state);
        } else if ATTACHMENT_EXTENSIONS.contains(&extension.as_str()) {
            collect_asset(&path, relative_path, assets, state);
        }
    }
}

fn collect_note(
    path: &Path,
    relative_path: String,
    notes: &mut Vec<VaultNote>,
    skipped: &mut Vec<VaultSkipped>,
    state: &mut WalkState,
) {
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.len() > MAX_NOTE_BYTES => {
            skipped.push(VaultSkipped {
                relative_path,
                reason: "note too large".to_string(),
            });
            return;
        }
        Ok(_) => {}
        Err(error) => {
            skipped.push(VaultSkipped {
                relative_path,
                reason: error.to_string(),
            });
            return;
        }
    }

    match std::fs::read(path) {
        Ok(bytes) => {
            let content = String::from_utf8_lossy(&bytes).into_owned();
            notes.push(VaultNote {
                relative_path,
                content,
            });
            state.collected += 1;
        }
        Err(error) => {
            skipped.push(VaultSkipped {
                relative_path,
                reason: error.to_string(),
            });
        }
    }
}

fn collect_asset(
    path: &Path,
    relative_path: String,
    assets: &mut Vec<VaultAsset>,
    state: &mut WalkState,
) {
    if let Ok(metadata) = std::fs::metadata(path) {
        assets.push(VaultAsset {
            relative_path,
            size: metadata.len(),
        });
        state.collected += 1;
    }
}

/// Reads a single attachment out of the vault (by workspace-relative,
/// vault-relative path) and stores it into the active workspace's asset
/// store, exactly like `import_image_asset`/`import_asset_from_url` do for
/// their sources. Offloaded to the blocking pool for the same reason as
/// `read_obsidian_vault`.
#[tauri::command]
pub async fn import_vault_asset(
    workspace_path: String,
    vault_path: String,
    relative_path: String,
) -> Result<ImportedImageAsset, String> {
    tauri::async_runtime::spawn_blocking(move || {
        import_vault_asset_inner(workspace_path, vault_path, relative_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn import_vault_asset_inner(
    workspace_path: String,
    vault_path: String,
    relative_path: String,
) -> Result<ImportedImageAsset, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();

    let vault_root = normalize_workspace_path(&vault_path)?;
    let canonical_root = vault_root
        .canonicalize()
        .map_err(|error| format!("Vault path does not exist: {error}"))?;

    let candidate = PathBuf::from(&relative_path);
    if candidate.is_absolute() {
        return Err("Attachment path must be relative to the vault root".to_string());
    }
    if candidate
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("Attachment path must not contain '..'".to_string());
    }

    let joined = canonical_root.join(&candidate);
    let canonical_target = joined
        .canonicalize()
        .map_err(|error| format!("Attachment file not found: {error}"))?;

    if !canonical_target.starts_with(&canonical_root) {
        return Err("Attachment path escapes the vault root".to_string());
    }
    if !canonical_target.is_file() {
        return Err("Attachment path is not a file".to_string());
    }

    let metadata = std::fs::metadata(&canonical_target).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_VAULT_ASSET_BYTES {
        return Err("Attachment exceeds the maximum import size".to_string());
    }

    let bytes = std::fs::read(&canonical_target).map_err(|error| error.to_string())?;
    let file_name = canonical_target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Attachment has no valid file name".to_string())?;

    store_workspace_asset(&workspace_path, file_name, &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::workspace::create_workspace;
    use std::fs;
    use uuid::Uuid;

    struct TempVault {
        path: PathBuf,
    }

    impl TempVault {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("nevo-vault-import-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).expect("create vault root");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }
    }

    impl Drop for TempVault {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    struct TempWorkspace {
        path: PathBuf,
    }

    impl TempWorkspace {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("nevo-vault-import-ws-{}", Uuid::new_v4()));
            create_workspace(
                path.to_string_lossy().into_owned(),
                "Vault".to_string(),
                "N".to_string(),
                "violet".to_string(),
            )
            .expect("create workspace");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }
    }

    impl Drop for TempWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn reads_vault_manifest_with_nested_notes_and_assets() {
        let vault = TempVault::new();
        fs::create_dir_all(vault.path.join("folder")).unwrap();
        fs::create_dir_all(vault.path.join(".obsidian")).unwrap();
        fs::write(vault.path.join("root.md"), "# Root").unwrap();
        fs::write(vault.path.join("folder/nested.md"), "# Nested").unwrap();
        fs::write(vault.path.join("folder/image.png"), [0u8; 8]).unwrap();
        fs::write(vault.path.join("folder/ignored.exe"), b"binary").unwrap();
        fs::write(vault.path.join(".obsidian/workspace.json"), "{}").unwrap();

        let manifest = read_obsidian_vault_inner(vault.path_string()).expect("read vault");

        assert_eq!(
            manifest.root_name,
            vault.path.file_name().unwrap().to_str().unwrap()
        );
        assert_eq!(manifest.notes.len(), 2);
        assert_eq!(manifest.assets.len(), 1);
        assert!(manifest.skipped.is_empty());
        // Deterministic, sorted, POSIX-style relative paths.
        assert_eq!(manifest.notes[0].relative_path, "folder/nested.md");
        assert_eq!(manifest.notes[0].content, "# Nested");
        assert_eq!(manifest.notes[1].relative_path, "root.md");
        assert_eq!(manifest.assets[0].relative_path, "folder/image.png");
        assert_eq!(manifest.assets[0].size, 8);
    }

    #[test]
    fn oversized_note_is_reported_as_skipped_not_dropped() {
        let vault = TempVault::new();
        let big_content = "a".repeat((MAX_NOTE_BYTES + 1) as usize);
        fs::write(vault.path.join("big.md"), big_content).unwrap();
        fs::write(vault.path.join("small.md"), "fine").unwrap();

        let manifest = read_obsidian_vault_inner(vault.path_string()).expect("read vault");

        assert_eq!(manifest.notes.len(), 1);
        assert_eq!(manifest.notes[0].relative_path, "small.md");
        assert_eq!(manifest.skipped.len(), 1);
        assert_eq!(manifest.skipped[0].relative_path, "big.md");
        assert_eq!(manifest.skipped[0].reason, "note too large");
    }

    #[test]
    fn import_vault_asset_rejects_parent_dir_traversal() {
        let vault = TempVault::new();
        let workspace = TempWorkspace::new();

        let result = import_vault_asset_inner(
            workspace.path_string(),
            vault.path_string(),
            "../escape.png".to_string(),
        );

        assert!(result.is_err());
    }

    #[test]
    fn import_vault_asset_rejects_absolute_path() {
        let vault = TempVault::new();
        let workspace = TempWorkspace::new();

        let result = import_vault_asset_inner(
            workspace.path_string(),
            vault.path_string(),
            "/etc/passwd".to_string(),
        );

        assert!(result.is_err());
    }

    #[cfg(unix)]
    #[test]
    fn import_vault_asset_rejects_symlink_escaping_root() {
        use std::os::unix::fs::symlink;

        let vault = TempVault::new();
        let workspace = TempWorkspace::new();
        let outside_file =
            std::env::temp_dir().join(format!("nevo-vault-outside-{}", Uuid::new_v4()));
        fs::write(&outside_file, b"secret").unwrap();
        symlink(&outside_file, vault.path.join("escape.png")).unwrap();

        let result = import_vault_asset_inner(
            workspace.path_string(),
            vault.path_string(),
            "escape.png".to_string(),
        );

        assert!(result.is_err());
        let _ = fs::remove_file(&outside_file);
    }

    #[test]
    fn import_vault_asset_accepts_valid_attachment() {
        let vault = TempVault::new();
        let workspace = TempWorkspace::new();
        fs::write(vault.path.join("image.png"), [1u8, 2, 3, 4]).unwrap();

        let imported = import_vault_asset_inner(
            workspace.path_string(),
            vault.path_string(),
            "image.png".to_string(),
        )
        .expect("import valid attachment");

        assert!(imported.src.starts_with(".nevo/assets/"));
        assert_eq!(imported.bytes, 4);
        assert!(!imported.deduplicated);
    }
}
