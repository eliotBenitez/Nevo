use tauri::ipc::{InvokeBody, Request};

use super::{validate_note_for_write, DocumentFormat};
use crate::commands::note::{crud::save_note_impl, NoteDocument};

#[tauri::command]
pub async fn save_notebook_note(request: Request<'_>) -> Result<(), String> {
    let header = request
        .headers()
        .get("nv-workspace-path")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "Missing notebook workspace path".to_string())?;
    let workspace_path = percent_encoding::percent_decode_str(header)
        .decode_utf8()
        .map_err(|_| "Invalid notebook workspace path encoding".to_string())?
        .into_owned();
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) if bytes.len() <= super::validation::MAX_NOTEBOOK_BYTES => {
            bytes.clone()
        }
        InvokeBody::Raw(_) => return Err("Notebook serialized data limit exceeded".to_string()),
        _ => return Err("Notebook save requires a raw UTF-8 body".to_string()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let note = decode_notebook_note(&bytes)?;
        save_note_impl(workspace_path, note)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn decode_notebook_note(bytes: &[u8]) -> Result<NoteDocument, String> {
    let note: NoteDocument = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    if validate_note_for_write(&note)? != DocumentFormat::Notebook {
        return Err("Raw notebook save cannot write a document".to_string());
    }
    Ok(note)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_malformed_and_document_bodies() {
        assert!(decode_notebook_note(b"{\"id\":").is_err());
        let document = serde_json::json!({
            "id": "n", "title": "N", "icon": "", "folderId": null,
            "createdAt": "2026-10-01", "updatedAt": "2026-10-01", "content": {"type": "doc"}
        });
        assert!(decode_notebook_note(&serde_json::to_vec(&document).unwrap()).is_err());
    }

    #[test]
    fn preserves_unknown_notebook_fields_in_raw_transport() {
        let value = serde_json::json!({
            "id": "n", "title": "N", "icon": "", "folderId": null,
            "createdAt": "2026-10-01", "updatedAt": "2026-10-01", "content": {"type": "doc"},
            "documentKind": "notebook", "futureNote": {"keep": true},
            "notebook": {"version": 1, "future": "keep", "pages": [{
                "id": "p", "width": 595.28, "height": 841.89, "paper": {"kind": "plain"}, "objects": []
            }]}
        });
        let note = decode_notebook_note(&serde_json::to_vec(&value).unwrap()).unwrap();
        assert_eq!(note.extra["futureNote"], value["futureNote"]);
        assert_eq!(note.extra["notebook"], value["notebook"]);
    }
}
