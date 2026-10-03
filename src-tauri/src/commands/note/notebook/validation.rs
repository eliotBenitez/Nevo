use serde_json::Value;
use std::collections::HashSet;

use super::super::NoteDocument;

pub(crate) const NOTEBOOK_WIDTH: f64 = 595.28;
pub(crate) const NOTEBOOK_HEIGHT: f64 = 841.89;
pub(crate) const MAX_NOTEBOOK_PAGES: usize = 1_000;
pub(crate) const MAX_NOTEBOOK_OBJECTS: usize = 100_000;
pub(crate) const MAX_NOTEBOOK_POINTS: usize = 2_000_000;
pub(crate) const MAX_NOTEBOOK_SEGMENT_POINTS: usize = 4_096;
pub(crate) const MAX_NOTEBOOK_BYTES: usize = 100 * 1024 * 1024;
const MAX_NOTEBOOK_COORDINATE: f64 = 9_007_199_254_740_991.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DocumentFormat {
    Document,
    Notebook,
}

/// Classifies raw format markers without normalizing or dropping unknown data.
/// A malformed or future marker remains readable but cannot pass a write gate.
pub(crate) fn validate_note_for_write(note: &NoteDocument) -> Result<DocumentFormat, String> {
    let has_notebook = note.extra.contains_key("notebook");
    match note.extra.get("documentKind") {
        None if !has_notebook => Ok(DocumentFormat::Document),
        Some(Value::String(kind)) if kind == "document" && !has_notebook => {
            Ok(DocumentFormat::Document)
        }
        Some(Value::String(kind)) if kind == "notebook" && has_notebook => {
            let notebook = note.extra.get("notebook").expect("checked above");
            validate_notebook_snapshot(notebook)?;
            if note.canvas.is_some() || !is_empty_doc(&note.content) {
                return Err("Notebook has inconsistent document content".to_string());
            }
            Ok(DocumentFormat::Notebook)
        }
        Some(Value::String(kind)) if kind == "document" || kind == "notebook" => {
            Err("Note has inconsistent document format fields".to_string())
        }
        Some(_) => Err("Unsupported document format; the note is read-only".to_string()),
        None => Err("Note has inconsistent document format fields".to_string()),
    }
}

pub(crate) fn validate_notebook_snapshot(value: &Value) -> Result<(), String> {
    let root = value
        .as_object()
        .ok_or_else(|| "Notebook data is not an object".to_string())?;
    if root.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("Unsupported notebook version; the note is read-only".to_string());
    }
    let pages = root
        .get("pages")
        .and_then(Value::as_array)
        .ok_or_else(|| "Notebook pages are missing or malformed".to_string())?;
    if pages.is_empty() || pages.len() > MAX_NOTEBOOK_PAGES {
        return Err("Notebook page count is outside the supported range".to_string());
    }

    let mut ids = HashSet::new();
    let mut object_count = 0usize;
    let mut point_count = 0usize;
    for page in pages {
        let page = page
            .as_object()
            .ok_or_else(|| "Notebook page is malformed".to_string())?;
        insert_id(&mut ids, page.get("id"), "page")?;
        let width = validate_finite_number(page.get("width"), "page width")?;
        let height = validate_finite_number(page.get("height"), "page height")?;
        if width != NOTEBOOK_WIDTH || height != NOTEBOOK_HEIGHT {
            return Err("Notebook page dimensions must be A4 portrait".to_string());
        }

        let paper = page
            .get("paper")
            .and_then(Value::as_object)
            .ok_or_else(|| "Notebook paper is malformed".to_string())?;
        if !matches!(
            paper.get("kind").and_then(Value::as_str),
            Some("plain" | "grid" | "ruled")
        ) {
            return Err("Unsupported notebook paper kind".to_string());
        }

        let objects = page
            .get("objects")
            .and_then(Value::as_array)
            .ok_or_else(|| "Notebook objects are malformed".to_string())?;
        object_count = object_count.saturating_add(objects.len());
        if object_count > MAX_NOTEBOOK_OBJECTS {
            return Err("Notebook object count exceeds the supported limit".to_string());
        }
        for object in objects {
            let object = object
                .as_object()
                .ok_or_else(|| "Notebook object is malformed".to_string())?;
            insert_id(&mut ids, object.get("id"), "object")?;
            validate_nonempty_string(object.get("actionId"), "action id")?;
            let kind = object
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if !matches!(kind, "stroke" | "highlighter" | "image") {
                return Err("Unsupported notebook object kind".to_string());
            }
            if kind == "image" {
                validate_image_object(object, &mut point_count)?;
                continue;
            }
            validate_color(object.get("color"))?;
            validate_unit_interval(object.get("opacity"), "object opacity")?;
            let width = validate_positive_number(object.get("width"), "stroke width")?;
            let allowed = if kind == "highlighter" {
                (2.0..=24.0).contains(&width)
            } else {
                (0.25..=8.0).contains(&width)
            };
            if !allowed {
                return Err("Notebook stroke width is outside the supported range".to_string());
            }

            let points = object
                .get("points")
                .and_then(Value::as_array)
                .ok_or_else(|| "Notebook stroke points are malformed".to_string())?;
            if points.is_empty() || points.len() > MAX_NOTEBOOK_SEGMENT_POINTS {
                return Err(
                    "Notebook stroke segment point count is outside the supported range"
                        .to_string(),
                );
            }
            point_count = point_count.saturating_add(points.len());
            if point_count > MAX_NOTEBOOK_POINTS {
                return Err("Notebook point count exceeds the supported limit".to_string());
            }
            for point in points {
                let point = point
                    .as_object()
                    .ok_or_else(|| "Notebook point is malformed".to_string())?;
                validate_finite_number(point.get("x"), "point x")?;
                validate_finite_number(point.get("y"), "point y")?;
                if let Some(pressure) = point.get("pressure") {
                    validate_unit_interval(Some(pressure), "point pressure")?;
                }
            }
        }
    }
    Ok(())
}

const IMAGE_ASSET_PREFIX: &str = ".nevo/assets/";

/// Raster-only: SVG assets are untrusted active content and unsupported by Typst.
pub(crate) fn is_notebook_image_extension(name: &str) -> bool {
    name.rsplit_once('.').is_some_and(|(_, extension)| {
        matches!(
            extension.to_ascii_lowercase().as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "gif"
        )
    })
}

fn validate_image_src(value: Option<&Value>) -> Result<(), String> {
    let src = value
        .and_then(Value::as_str)
        .ok_or_else(|| "Notebook image src is missing or malformed".to_string())?;
    let name = src
        .strip_prefix(IMAGE_ASSET_PREFIX)
        .filter(|name| {
            !name.is_empty()
                && !name.contains(['/', char::from(0x5c), char::from(0)])
                && *name != "."
                && *name != ".."
        })
        .ok_or_else(|| "Notebook image src must be a workspace asset".to_string())?;
    if !is_notebook_image_extension(name) {
        return Err("Notebook image format is not supported".to_string());
    }
    Ok(())
}

fn validate_image_object(
    object: &serde_json::Map<String, Value>,
    point_count: &mut usize,
) -> Result<(), String> {
    validate_image_src(object.get("src"))?;
    validate_unit_interval(object.get("opacity"), "object opacity")?;
    let points = object
        .get("points")
        .and_then(Value::as_array)
        .filter(|points| points.len() == 4)
        .ok_or_else(|| "Notebook image must have exactly four corner points".to_string())?;
    *point_count = point_count.saturating_add(points.len());
    if *point_count > MAX_NOTEBOOK_POINTS {
        return Err("Notebook point count exceeds the supported limit".to_string());
    }
    let mut corners = [(0.0f64, 0.0f64); 4];
    for (index, point) in points.iter().enumerate() {
        let point = point
            .as_object()
            .ok_or_else(|| "Notebook point is malformed".to_string())?;
        corners[index] = (
            validate_finite_number(point.get("x"), "point x")?,
            validate_finite_number(point.get("y"), "point y")?,
        );
        if let Some(pressure) = point.get("pressure") {
            validate_unit_interval(Some(pressure), "point pressure")?;
        }
    }
    let mut twice_area = 0.0f64;
    for index in 0..4 {
        let (x1, y1) = corners[index];
        let (x2, y2) = corners[(index + 1) % 4];
        twice_area += x1 * y2 - x2 * y1;
    }
    if !(twice_area.abs() / 2.0 > 1e-6) {
        return Err("Notebook image must have a non-zero area".to_string());
    }
    Ok(())
}

fn is_empty_doc(value: &Value) -> bool {
    if value.get("type").and_then(Value::as_str) != Some("doc") {
        return false;
    }
    match value.get("content") {
        None => true,
        Some(Value::Array(content)) => content.iter().all(|node| {
            node.get("type").and_then(Value::as_str) == Some("paragraph")
                && match node.get("content") {
                    None => true,
                    Some(Value::Array(children)) => children.is_empty(),
                    _ => false,
                }
        }),
        _ => false,
    }
}

fn insert_id(ids: &mut HashSet<String>, value: Option<&Value>, kind: &str) -> Result<(), String> {
    let id = validate_nonempty_string(value, &format!("{kind} id"))?;
    if !ids.insert(id.to_string()) {
        return Err(format!("Notebook contains a duplicate {kind} id"));
    }
    Ok(())
}

fn validate_nonempty_string<'a>(value: Option<&'a Value>, label: &str) -> Result<&'a str, String> {
    value
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| format!("Notebook {label} is missing or malformed"))
}

fn validate_finite_number(value: Option<&Value>, label: &str) -> Result<f64, String> {
    let number = value
        .and_then(Value::as_f64)
        .filter(|number| number.is_finite())
        .ok_or_else(|| format!("Notebook {label} must be a finite number"))?;
    if matches!(label, "point x" | "point y") && number.abs() > MAX_NOTEBOOK_COORDINATE {
        return Err(format!(
            "Notebook {label} is outside the safe numeric range"
        ));
    }
    Ok(number)
}

fn validate_positive_number(value: Option<&Value>, label: &str) -> Result<f64, String> {
    let number = validate_finite_number(value, label)?;
    if number <= 0.0 {
        return Err(format!("Notebook {label} must be positive"));
    }
    Ok(number)
}

fn validate_unit_interval(value: Option<&Value>, label: &str) -> Result<(), String> {
    let number = validate_finite_number(value, label)?;
    if !(0.0..=1.0).contains(&number) {
        return Err(format!("Notebook {label} must be between 0 and 1"));
    }
    Ok(())
}

fn validate_color(value: Option<&Value>) -> Result<(), String> {
    let color = value
        .and_then(Value::as_str)
        .ok_or_else(|| "Notebook stroke color is malformed".to_string())?;
    let bytes = color.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' || !bytes[1..].iter().all(u8::is_ascii_hexdigit) {
        return Err("Notebook stroke color must be a six-digit hex value".to_string());
    }
    Ok(())
}

pub(crate) fn validate_serialized_size(value: &Value) -> Result<(), String> {
    let size = serde_json::to_vec(value)
        .map_err(|error| error.to_string())?
        .len();
    if size > MAX_NOTEBOOK_BYTES {
        return Err("Notebook document exceeds the supported size limit".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn snapshot() -> Value {
        json!({
            "version": 1,
            "futureNotebookField": { "kept": true },
            "pages": [{
                "id": "page-1",
                "width": 595.28,
                "height": 841.89,
                "paper": { "kind": "ruled", "futurePaperField": 42 },
                "objects": [
                    {
                        "id": "object-1",
                        "actionId": "stroke-group",
                        "kind": "stroke",
                        "color": "#123abc",
                        "width": 1.5,
                        "opacity": 1.0,
                        "points": [
                            { "x": 10.0, "y": 12.0, "pressure": 0.0, "futurePointField": "kept" }
                        ],
                        "futureObjectField": [1, 2]
                    },
                    {
                        "id": "object-2",
                        "actionId": "stroke-group",
                        "kind": "stroke",
                        "color": "#123abc",
                        "width": 1.5,
                        "opacity": 1.0,
                        "points": [{ "x": 11.0, "y": 13.0 }]
                    }
                ]
            }]
        })
    }

    #[test]
    fn accepts_zero_pressure_repeat_action_ids_and_unknown_fields_losslessly() {
        let value = snapshot();
        validate_notebook_snapshot(&value).expect("valid notebook");
        let note_json = json!({
            "id": "n1",
            "title": "Notebook",
            "icon": "N",
            "folderId": null,
            "createdAt": "today",
            "updatedAt": "today",
            "properties": null,
            "content": { "type": "doc", "content": [] },
            "documentKind": "notebook",
            "notebook": value
        });
        let note: NoteDocument = serde_json::from_value(note_json.clone()).expect("decode");
        let encoded = serde_json::to_value(note).expect("encode");
        assert_eq!(encoded, note_json);
    }

    #[test]
    fn rejects_unknown_versions_duplicate_ids_and_invalid_geometry() {
        let mut future = snapshot();
        future["version"] = json!(2);
        assert!(validate_notebook_snapshot(&future).is_err());

        let mut duplicate = snapshot();
        duplicate["pages"][0]["objects"][1]["id"] = json!("object-1");
        assert!(validate_notebook_snapshot(&duplicate).is_err());

        let mut invalid_pressure = snapshot();
        invalid_pressure["pages"][0]["objects"][0]["points"][0]["pressure"] = json!(1.1);
        assert!(validate_notebook_snapshot(&invalid_pressure).is_err());

        let mut unsafe_coordinate = snapshot();
        unsafe_coordinate["pages"][0]["objects"][0]["points"][0]["x"] =
            json!(9_007_199_254_740_992u64);
        assert!(validate_notebook_snapshot(&unsafe_coordinate).is_err());
    }

    fn with_image(mutate: impl FnOnce(&mut Value)) -> Value {
        let mut value = snapshot();
        let mut image = json!({
            "id": "image-1",
            "actionId": "image-action",
            "kind": "image",
            "src": ".nevo/assets/abc-photo.PNG",
            "opacity": 1,
            "points": [
                { "x": 10.0, "y": 10.0 }, { "x": 110.0, "y": 10.0 },
                { "x": 110.0, "y": 60.0 }, { "x": 10.0, "y": 60.0 }
            ],
            "futureImageField": true
        });
        mutate(&mut image);
        value["pages"][0]["objects"]
            .as_array_mut()
            .unwrap()
            .push(image);
        value
    }

    #[test]
    fn accepts_valid_image_objects() {
        validate_notebook_snapshot(&with_image(|_| {})).expect("valid image");
    }

    #[test]
    fn rejects_malformed_image_objects() {
        let bad_srcs = [
            ".nevo/assets/../secret.png",
            ".nevo/assets/a\\b.png",
            "/etc/passwd.png",
            "C:/a.png",
            ".nevo/assets/pic.svg",
            ".nevo/plugins/pic.png",
            ".nevo/assets/",
            ".nevo/assets/sub/pic.png",
            ".nevo/assets/..",
            "other/pic.png",
        ];
        for src in bad_srcs {
            let value = with_image(|image| image["src"] = json!(src));
            assert!(validate_notebook_snapshot(&value).is_err(), "{src}");
        }

        let three = with_image(|image| {
            image["points"].as_array_mut().unwrap().pop();
        });
        assert!(validate_notebook_snapshot(&three).is_err());

        let flat = with_image(|image| {
            for point in image["points"].as_array_mut().unwrap() {
                point["y"] = json!(5.0);
            }
        });
        assert!(validate_notebook_snapshot(&flat).is_err());

        let opacity = with_image(|image| image["opacity"] = json!(1.5));
        assert!(validate_notebook_snapshot(&opacity).is_err());

        let unknown = with_image(|image| image["kind"] = json!("pdf"));
        assert!(validate_notebook_snapshot(&unknown).is_err());
    }

    #[test]
    fn accepts_semantically_empty_paragraphs_with_unknown_fields() {
        let mut note_json = json!({
            "id": "n1", "title": "Notebook", "icon": "N", "folderId": null,
            "createdAt": "today", "updatedAt": "today", "properties": null,
            "content": { "type": "doc", "attrs": { "future": true }, "content": [
                { "type": "paragraph", "attrs": { "align": "left" } },
                { "type": "paragraph", "content": [] }
            ] },
            "documentKind": "notebook", "notebook": snapshot()
        });
        let note: NoteDocument = serde_json::from_value(note_json.clone()).expect("decode");
        assert_eq!(validate_note_for_write(&note), Ok(DocumentFormat::Notebook));
        note_json["content"]["content"][1]["content"] = json!([{ "type": "text", "text": "x" }]);
        let note: NoteDocument = serde_json::from_value(note_json).expect("decode");
        assert!(validate_note_for_write(&note).is_err());
    }

    #[test]
    fn rejects_malformed_and_future_format_markers() {
        let note = NoteDocument {
            id: "n1".to_string(),
            title: "Notebook".to_string(),
            icon: "N".to_string(),
            cover: None,
            folder_id: None,
            created_at: "today".to_string(),
            updated_at: "today".to_string(),
            properties: None,
            content: json!({ "type": "doc", "content": [] }),
            canvas: None,
            extra: serde_json::Map::from_iter([("documentKind".to_string(), Value::Null)]),
        };
        assert!(validate_note_for_write(&note).is_err());

        let mut future = note;
        future
            .extra
            .insert("documentKind".to_string(), json!("future"));
        assert!(validate_note_for_write(&future).is_err());
    }
}
