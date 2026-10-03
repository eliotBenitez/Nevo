use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CanvasLayout {
    pub block_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub z_index: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
}

/// A note's canvas source of truth, persisted in `note.json`.
///
/// Elements and connectors remain `Value` at this filesystem boundary so a
/// newer frontend can preserve known v1 payloads without coupling Rust note IO
/// to every visual subtype. Frontend normalization validates them before use.
///
/// A note's canvas is a single document frame (`frame`) rather than one
/// layout per top-level block. `layouts` is kept only so notes written before
/// this change keep deserializing; the frontend migrates it into `frame` and
/// no longer serializes it back out, so `skip_serializing_if` drops it once a
/// note has been migrated.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CanvasSnapshotV1 {
    pub version: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame: Option<Value>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub layouts: HashMap<String, CanvasLayout>,
    #[serde(default)]
    pub elements: HashMap<String, Value>,
    #[serde(default)]
    pub connectors: HashMap<String, Value>,
    #[serde(default)]
    pub order: Vec<String>,
}

#[cfg(test)]
mod tests {
    use crate::commands::note::NoteDocument;

    #[test]
    fn legacy_note_without_canvas_remains_readable() {
        let note: NoteDocument = serde_json::from_value(serde_json::json!({
            "id": "note-1",
            "title": "Legacy",
            "icon": "📄",
            "folderId": null,
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z",
            "content": { "type": "doc", "content": [] }
        }))
        .expect("deserialize legacy note");
        assert!(note.canvas.is_none());
    }

    #[test]
    fn canvas_json_mirror_round_trips_with_note() {
        let value = serde_json::json!({
            "id": "note-1",
            "title": "Canvas",
            "icon": "📄",
            "folderId": null,
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z",
            "content": { "type": "doc", "content": [] },
            "canvas": {
                "version": 1,
                "layouts": {
                    "block-1": {
                        "blockId": "block-1",
                        "x": 10.0,
                        "y": 20.0,
                        "width": 300.0,
                        "height": 120.0,
                        "zIndex": 0.0
                    }
                },
                "elements": {},
                "connectors": {},
                "order": ["block-1"]
            }
        });
        let note: NoteDocument =
            serde_json::from_value(value).expect("deserialize note with canvas");
        let serialized = serde_json::to_value(note).expect("serialize note with canvas");
        assert_eq!(serialized["canvas"]["version"], 1);
        assert_eq!(
            serialized["canvas"]["layouts"]["block-1"]["blockId"],
            "block-1"
        );
    }

    #[test]
    fn canvas_frame_round_trips_with_note() {
        let value = serde_json::json!({
            "id": "note-2",
            "title": "Canvas Frame",
            "icon": "📄",
            "folderId": null,
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z",
            "content": { "type": "doc", "content": [] },
            "canvas": {
                "version": 1,
                "frame": {
                    "x": 0.0,
                    "y": 0.0,
                    "width": 900.0,
                    "height": 1200.0,
                    "zIndex": 0.0,
                    "autoHeight": true
                },
                "elements": {},
                "connectors": {},
                "order": []
            }
        });
        let note: NoteDocument =
            serde_json::from_value(value).expect("deserialize note with canvas frame");
        let serialized = serde_json::to_value(note).expect("serialize note with canvas frame");
        assert_eq!(serialized["canvas"]["frame"]["width"], 900.0);
        // A migrated note has no legacy layouts, so the field is dropped rather
        // than round-tripped as an empty object.
        assert!(serialized["canvas"].get("layouts").is_none());
    }

    #[test]
    fn collapsed_frame_flag_round_trips_with_note() {
        // `frame` is untyped `Value` at this boundary (see the struct doc
        // comment above), so `collapsed` should pass through untouched with
        // no dedicated Rust field required.
        let value = serde_json::json!({
            "id": "note-4",
            "title": "Collapsed Canvas Frame",
            "icon": "📄",
            "folderId": null,
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z",
            "content": { "type": "doc", "content": [] },
            "canvas": {
                "version": 1,
                "frame": {
                    "x": 0.0,
                    "y": 0.0,
                    "width": 900.0,
                    "height": 1200.0,
                    "zIndex": 0.0,
                    "autoHeight": true,
                    "collapsed": true
                },
                "elements": {},
                "connectors": {},
                "order": []
            }
        });
        let note: NoteDocument =
            serde_json::from_value(value).expect("deserialize note with collapsed canvas frame");
        let serialized =
            serde_json::to_value(note).expect("serialize note with collapsed canvas frame");
        assert_eq!(serialized["canvas"]["frame"]["collapsed"], true);
        assert_eq!(serialized["canvas"]["frame"]["width"], 900.0);
    }

    #[test]
    fn legacy_canvas_snapshot_without_frame_still_deserializes() {
        let value = serde_json::json!({
            "id": "note-3",
            "title": "Legacy Canvas",
            "icon": "📄",
            "folderId": null,
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z",
            "content": { "type": "doc", "content": [] },
            "canvas": {
                "version": 1,
                "layouts": {
                    "block-1": {
                        "blockId": "block-1",
                        "x": 10.0,
                        "y": 20.0,
                        "width": 300.0,
                        "height": 120.0,
                        "zIndex": 0.0
                    }
                },
                "elements": {},
                "connectors": {},
                "order": ["block-1"]
            }
        });
        let note: NoteDocument =
            serde_json::from_value(value).expect("deserialize legacy canvas snapshot");
        let canvas = note.canvas.expect("canvas present");
        assert!(canvas.frame.is_none());
        assert_eq!(canvas.layouts.len(), 1);
    }
}
