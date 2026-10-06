use serde_json::Value;
use tauri::ipc::{InvokeBody, Request};

use super::{validate_note_for_write, DocumentFormat};
use crate::commands::note::{crud::save_note_impl, NoteDocument};

enum NotebookSaveBody {
    Raw(Vec<u8>),
    JsonByteArray(Vec<serde_json::Number>),
}

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
    let body = prepare_notebook_save_body(request.body(), super::validation::MAX_NOTEBOOK_BYTES)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = notebook_save_body_bytes(body, super::validation::MAX_NOTEBOOK_BYTES)?;
        let note = decode_notebook_note(&bytes)?;
        save_note_impl(workspace_path, note)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn prepare_notebook_save_body(
    body: &InvokeBody,
    byte_limit: usize,
) -> Result<NotebookSaveBody, String> {
    match body {
        InvokeBody::Raw(bytes) if bytes.len() <= byte_limit => {
            Ok(NotebookSaveBody::Raw(bytes.clone()))
        }
        InvokeBody::Raw(_) => Err("Notebook serialized data limit exceeded".to_string()),
        InvokeBody::Json(Value::Array(values)) if values.len() <= byte_limit => {
            let mut numbers = Vec::new();
            numbers
                .try_reserve_exact(values.len())
                .map_err(|_| "Unable to allocate notebook data".to_string())?;
            for value in values {
                let Value::Number(number) = value else {
                    return Err(
                        "Notebook JSON byte array must contain integer bytes from 0 to 255"
                            .to_string(),
                    );
                };
                numbers.push(number.clone());
            }
            Ok(NotebookSaveBody::JsonByteArray(numbers))
        }
        InvokeBody::Json(Value::Array(_)) => {
            Err("Notebook serialized data limit exceeded".to_string())
        }
        InvokeBody::Json(_) => {
            Err("Notebook save requires raw bytes or a JSON byte array".to_string())
        }
    }
}

fn notebook_save_body_bytes(body: NotebookSaveBody, byte_limit: usize) -> Result<Vec<u8>, String> {
    match body {
        NotebookSaveBody::Raw(bytes) if bytes.len() <= byte_limit => Ok(bytes),
        NotebookSaveBody::Raw(_) => Err("Notebook serialized data limit exceeded".to_string()),
        NotebookSaveBody::JsonByteArray(values) => json_byte_array_to_bytes(&values, byte_limit),
    }
}

fn json_byte_array_to_bytes(
    values: &[serde_json::Number],
    byte_limit: usize,
) -> Result<Vec<u8>, String> {
    if values.len() > byte_limit {
        return Err("Notebook serialized data limit exceeded".to_string());
    }

    let mut bytes = Vec::new();
    bytes
        .try_reserve_exact(values.len())
        .map_err(|_| "Unable to allocate notebook data".to_string())?;
    for value in values {
        let byte = value
            .as_u64()
            .and_then(|value| u8::try_from(value).ok())
            .ok_or_else(|| {
                "Notebook JSON byte array must contain integers from 0 to 255".to_string()
            })?;
        bytes.push(byte);
    }
    Ok(bytes)
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
    use serde_json::json;

    fn notebook_value() -> Value {
        json!({
            "id": "n",
            "title": "ノート 🖋️",
            "icon": "",
            "cover": null,
            "folderId": null,
            "createdAt": "2026-10-01",
            "updatedAt": "2026-10-01",
            "properties": null,
            "content": {"type": "doc"},
            "documentKind": "notebook",
            "futureNote": {"keep": true, "nested": [1, "未対応"]},
            "notebook": {
                "version": 1,
                "future": "keep",
                "pages": [{
                    "id": "p",
                    "width": 595.28,
                    "height": 841.89,
                    "paper": {"kind": "plain", "futurePaper": 7},
                    "objects": []
                }]
            }
        })
    }

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
    fn android_json_byte_array_round_trips_utf8_and_unknown_fields_like_desktop_raw() {
        let value = notebook_value();
        let raw = serde_json::to_vec(&value).unwrap();
        let android_body = InvokeBody::Json(Value::Array(
            raw.iter().map(|byte| Value::from(*byte)).collect(),
        ));
        let android_body = prepare_notebook_save_body(&android_body, raw.len()).unwrap();
        let android_bytes = notebook_save_body_bytes(android_body, raw.len()).unwrap();
        let android_note = decode_notebook_note(&android_bytes).unwrap();
        let desktop_note = decode_notebook_note(&raw).unwrap();
        let android_note_value = serde_json::to_value(android_note).unwrap();

        assert_eq!(android_note_value, value);
        assert_eq!(
            android_note_value,
            serde_json::to_value(desktop_note).unwrap()
        );
    }

    #[test]
    fn rejects_unsupported_body_shapes_and_non_byte_array_values() {
        for body in [
            InvokeBody::Json(json!("[1,2,3]")),
            InvokeBody::Json(json!({"0": 1})),
            InvokeBody::Json(Value::Null),
            InvokeBody::Json(Value::Bool(true)),
            InvokeBody::Json(json!([{"large": "nested"}])),
            InvokeBody::Json(json!([[1, 2, 3]])),
            InvokeBody::Json(json!(["1"])),
            InvokeBody::Json(json!([true])),
            InvokeBody::Json(json!([null])),
        ] {
            assert!(prepare_notebook_save_body(&body, 8).is_err());
        }

        for value in [json!(-1), json!(256), json!(1.5)] {
            let number = value.as_number().unwrap().clone();
            assert!(json_byte_array_to_bytes(&[number], 1).is_err());
        }
    }

    #[test]
    fn enforces_exact_and_over_byte_limits_for_raw_and_json_bodies() {
        let exact_json = InvokeBody::Json(json!([0, 127, 255]));
        let exact_json = prepare_notebook_save_body(&exact_json, 3).unwrap();
        assert_eq!(
            notebook_save_body_bytes(exact_json, 3).unwrap(),
            [0, 127, 255]
        );

        let over_json = InvokeBody::Json(json!([0, 127, 255, 1]));
        assert!(prepare_notebook_save_body(&over_json, 3).is_err());
        let over_limit = [json!(0), json!(1)].map(|value| value.as_number().unwrap().clone());
        assert!(json_byte_array_to_bytes(&over_limit, 1).is_err());

        let exact_raw = InvokeBody::Raw(vec![0, 127, 255]);
        let exact_raw = prepare_notebook_save_body(&exact_raw, 3).unwrap();
        assert_eq!(
            notebook_save_body_bytes(exact_raw, 3).unwrap(),
            [0, 127, 255]
        );

        let over_raw = InvokeBody::Raw(vec![0, 127, 255, 1]);
        assert!(prepare_notebook_save_body(&over_raw, 3).is_err());
    }

    #[test]
    fn rejects_future_notebook_versions_without_rewriting_them() {
        let mut value = notebook_value();
        value["notebook"]["version"] = json!(2);
        let bytes = serde_json::to_vec(&value).unwrap();
        assert!(decode_notebook_note(&bytes).is_err());
    }
}
