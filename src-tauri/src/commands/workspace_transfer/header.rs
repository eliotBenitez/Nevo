use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::commands::workspace::{WorkspaceManifest, CURRENT_WORKSPACE_SCHEMA_VERSION};

/// Name of the manifest entry written at the root of every `.nevoz` archive.
pub(super) const NEVO_EXPORT_HEADER: &str = "nevo-export.json";

/// Bumped whenever the archive layout changes in a way older readers cannot
/// handle. `validate_header` rejects any other value with a clear error.
pub(super) const EXPORT_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWorkspaceMeta {
    pub id: String,
    pub name: String,
    pub glyph: String,
    pub gradient: String,
    pub schema_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportHeader {
    pub format_version: u32,
    pub app_version: String,
    pub exported_at: String,
    pub encrypted: bool,
    pub workspace: ExportWorkspaceMeta,
}

/// Builds the archive header from the workspace manifest at `root`. Called
/// before collecting files so a missing/corrupt manifest fails fast.
pub(super) fn build_header(root: &Path, encrypted: bool) -> Result<ExportHeader, String> {
    let manifest_path = root.join(".nevo/workspace.json");
    let content = std::fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Unable to read workspace manifest: {error}"))?;
    let manifest: WorkspaceManifest = serde_json::from_str(&content)
        .map_err(|error| format!("Workspace manifest is not valid JSON: {error}"))?;

    Ok(ExportHeader {
        format_version: EXPORT_FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        encrypted,
        workspace: ExportWorkspaceMeta {
            id: manifest.id,
            name: manifest.name,
            glyph: manifest.glyph,
            gradient: manifest.gradient,
            schema_version: manifest.schema_version,
        },
    })
}

pub(super) fn header_json_bytes(header: &ExportHeader) -> Result<Vec<u8>, String> {
    serde_json::to_vec_pretty(header).map_err(|error| error.to_string())
}

/// Parses and sanity-checks the `nevo-export.json` entry. Used both right
/// after picking an archive (before any extraction happens) and by the
/// extractor itself.
pub(super) fn validate_header(bytes: &[u8]) -> Result<ExportHeader, String> {
    let header: ExportHeader = serde_json::from_slice(bytes)
        .map_err(|_| "The selected file is not a valid Nevo workspace archive".to_string())?;
    if header.format_version != EXPORT_FORMAT_VERSION {
        return Err(format!(
            "This Nevo archive was created by an incompatible app version (format {}, expected {})",
            header.format_version, EXPORT_FORMAT_VERSION
        ));
    }
    // Refuse an archive whose workspace was created by a newer Nevo build
    // rather than half-importing it — same gate as `open_workspace` (see
    // `commands/workspace/manifest.rs`), using the same machine-readable
    // error prefix so the frontend can match either path identically.
    if header.workspace.schema_version > CURRENT_WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "workspace-schema-too-new:{}:{}",
            header.workspace.schema_version, CURRENT_WORKSPACE_SCHEMA_VERSION
        ));
    }
    Ok(header)
}
