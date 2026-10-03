//! Copies every note file from an extracted archive into the current
//! workspace under its freshly allocated id, rewriting id references inside
//! via `idmap::remap_content`.

use std::path::{Path, PathBuf};

use crate::commands::note::notebook::{
    validate_note_for_write, validate_serialized_size, DocumentFormat,
};
use crate::commands::note::NoteDocument;
use crate::commands::path_utils::write_atomic;
use crate::commands::workspace::{FolderMeta, WorkspaceManifest};

use super::idmap::{remap_content, IdMaps};
use super::TransferProgress;

fn note_file_path(root: &Path, note_id: &str) -> PathBuf {
    root.join("notes").join(format!("note-{}.nevo", note_id))
}

fn collect_folder_note_ids(folder: &FolderMeta, ids: &mut Vec<String>) {
    for note in &folder.notes {
        ids.push(note.id.clone());
    }
    for child in &folder.children {
        collect_folder_note_ids(child, ids);
    }
}

/// Every note id in the imported manifest: `rootNotes` plus every
/// `FolderMeta.notes` entry recursively. `trash` is deliberately excluded —
/// trashed notes are never imported.
fn all_old_note_ids(manifest: &WorkspaceManifest) -> Vec<String> {
    let mut ids: Vec<String> = manifest
        .root_notes
        .iter()
        .map(|note| note.id.clone())
        .collect();
    for folder in &manifest.tree {
        collect_folder_note_ids(folder, &mut ids);
    }
    ids
}

/// Copies every note file from `temp_dir` into `current_root` under its new
/// id, rewriting `id`, `folderId`, and any id reference inside `content`
/// (internal links, note embeds, V2 database blocks) via `maps`. Returns the
/// number of notes copied.
pub(super) fn copy_and_remap_notes(
    temp_dir: &Path,
    current_root: &Path,
    imported_manifest: &WorkspaceManifest,
    maps: &mut IdMaps,
    on_event: &tauri::ipc::Channel<TransferProgress>,
) -> Result<u64, String> {
    let old_ids = all_old_note_ids(imported_manifest);
    let total = old_ids.len() as u64;
    let _ = on_event.send(TransferProgress::Started { total });

    for (index, old_id) in old_ids.iter().enumerate() {
        let source_path = note_file_path(temp_dir, old_id);
        let raw = std::fs::read_to_string(&source_path)
            .map_err(|error| format!("Unable to read imported note {old_id}: {error}"))?;
        let mut doc: NoteDocument = serde_json::from_str(&raw)
            .map_err(|error| format!("Imported note {old_id} is not valid JSON: {error}"))?;
        let raw_value: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|error| format!("Imported note {old_id} is not valid JSON: {error}"))?;
        if validate_note_for_write(&doc)? == DocumentFormat::Notebook {
            validate_serialized_size(&raw_value)?;
        }

        let new_id = maps
            .notes
            .get(old_id)
            .cloned()
            .ok_or_else(|| format!("Imported note {old_id} is missing from the id map"))?;
        doc.id = new_id.clone();
        doc.folder_id = doc
            .folder_id
            .as_ref()
            .and_then(|folder_id| maps.folders.get(folder_id))
            .cloned();
        remap_content(&mut doc.content, maps);

        let dest_path = note_file_path(current_root, &new_id);
        let serialized = serde_json::to_vec_pretty(&doc).map_err(|error| error.to_string())?;
        write_atomic(&dest_path, &serialized).map_err(|error| error.to_string())?;

        let _ = on_event.send(TransferProgress::File {
            done: index as u64 + 1,
            total,
        });
    }

    Ok(total)
}
