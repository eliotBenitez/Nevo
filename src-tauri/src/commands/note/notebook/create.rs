use chrono::Utc;
use serde_json::json;
use uuid::Uuid;

use crate::commands::folder::{load_manifest, manifest_lock};
use crate::commands::note::{
    empty_doc, insert_note_in_folder, note_path, NoteDocument, NoteProperties,
};
use crate::commands::note_index as note_index_module;
use crate::commands::path_utils::{normalize_workspace_path, write_atomic};
use crate::commands::workspace::{
    FolderMeta, NoteMeta, WorkspaceManifest, CURRENT_WORKSPACE_SCHEMA_VERSION,
};

#[tauri::command]
pub async fn create_notebook(
    workspace_path: String,
    folder_id: Option<String>,
    title: String,
    icon: String,
    paper: String,
) -> Result<NoteDocument, String> {
    tauri::async_runtime::spawn_blocking(move || {
        create_notebook_impl(workspace_path, folder_id, title, icon, paper)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(crate) fn create_notebook_impl(
    workspace_path: String,
    folder_id: Option<String>,
    title: String,
    icon: String,
    paper: String,
) -> Result<NoteDocument, String> {
    create_notebook_impl_with_manifest_writer(
        workspace_path,
        folder_id,
        title,
        icon,
        paper,
        crate::commands::folder::save_manifest,
    )
}

pub(crate) fn create_notebook_impl_with_manifest_writer<F>(
    workspace_path: String,
    folder_id: Option<String>,
    title: String,
    icon: String,
    paper: String,
    mut write_manifest: F,
) -> Result<NoteDocument, String>
where
    F: FnMut(&str, &WorkspaceManifest) -> Result<(), String>,
{
    if !matches!(paper.as_str(), "plain" | "grid" | "ruled") {
        return Err("Unsupported notebook paper kind".to_string());
    }
    let workspace_path = normalize_workspace_path(&workspace_path)?
        .to_string_lossy()
        .into_owned();
    let lock = manifest_lock(&workspace_path);
    let _manifest_guard = lock.lock().map_err(|error| error.to_string())?;
    let mut manifest = load_manifest(&workspace_path)?;
    if manifest.schema_version > CURRENT_WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "workspace-schema-too-new:{}:{}",
            manifest.schema_version, CURRENT_WORKSPACE_SCHEMA_VERSION
        ));
    }
    if let Some(folder_id) = &folder_id {
        if !manifest
            .tree
            .iter()
            .any(|folder| folder_exists(folder, folder_id))
        {
            return Err("Target folder not found".to_string());
        }
    }

    // Persist the compatibility gate before creating any notebook payload.
    if manifest.schema_version < 2 {
        manifest.schema_version = 2;
        write_manifest(&workspace_path, &manifest)?;
    }

    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let page_id = Uuid::new_v4().to_string();
    let mut extra = serde_json::Map::new();
    extra.insert("documentKind".to_string(), json!("notebook"));
    extra.insert(
        "notebook".to_string(),
        json!({
            "version": 1,
            "pages": [{
                "id": page_id,
                "width": 595.28,
                "height": 841.89,
                "paper": { "kind": paper },
                "objects": []
            }]
        }),
    );
    let note = NoteDocument {
        id: id.clone(),
        title: title.clone(),
        icon: icon.clone(),
        cover: None,
        folder_id: folder_id.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
        properties: Some(NoteProperties::empty()),
        content: empty_doc(),
        canvas: None,
        extra,
    };
    let path = note_path(&workspace_path, &note.id)?;
    if path.exists() {
        return Err("Notebook file already exists".to_string());
    }
    let payload = serde_json::to_vec_pretty(&note).map_err(|error| error.to_string())?;
    write_atomic(&path, &payload).map_err(|error| error.to_string())?;

    let meta = NoteMeta {
        id: id.clone(),
        title,
        icon,
        folder_id: folder_id.clone(),
        updated_at: now,
        extra: Default::default(),
    };
    if let Some(folder_id) = &folder_id {
        if !insert_note_in_folder(&mut manifest.tree, folder_id, meta) {
            let _ = std::fs::remove_file(&path);
            return Err("Target folder not found".to_string());
        }
    } else {
        manifest.root_order.push(id);
        manifest.root_notes.push(meta);
    }
    // If the atomic manifest write fails, its commit state is uncertain on
    // some filesystems. Keep the already-written notebook as a diagnosable
    // orphan instead of risking deletion after a manifest commit succeeded.
    write_manifest(&workspace_path, &manifest)?;
    let folder_path = note_index_module::folder_path_for_id(&manifest.tree, folder_id.as_deref());
    let _ = note_index_module::upsert_note_document(&workspace_path, &note, &folder_path);
    Ok(note)
}

fn folder_exists(folder: &FolderMeta, id: &str) -> bool {
    folder.id == id || folder.children.iter().any(|child| folder_exists(child, id))
}
