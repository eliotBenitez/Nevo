use std::net::IpAddr;

use chrono::Utc;
use serde_json::json;
use uuid::Uuid;

use super::draw::{read_draw_asset_inner, read_latest_draw_asset_inner, save_draw_asset_inner};
use super::gc::delete_unreferenced_asset_inner;
use super::remote::{
    content_type_matches_extension, derive_download_file_name, is_public_ip, sniff_image_extension,
    validate_remote_asset_url,
};
use crate::commands::note::{assets_dir_path, create_note_impl, save_note_impl};
use crate::commands::workspace::create_workspace;

#[test]
fn derive_download_file_name_uses_url_extension() {
    assert_eq!(
        derive_download_file_name("https://example.com/a/b/pic.PNG?token=1", None),
        "pic.PNG"
    );
}

#[test]
fn derive_download_file_name_falls_back_to_content_type() {
    assert_eq!(
        derive_download_file_name(
            "https://example.com/user-attachments/assets/uuid",
            Some("image/jpeg; charset=binary")
        ),
        "uuid.jpg"
    );
    assert_eq!(
        derive_download_file_name("https://example.com/download", None),
        "download.png"
    );
}

#[test]
fn remote_asset_url_rejects_local_and_userinfo_targets() {
    let local = reqwest::Url::parse("http://127.0.0.1/image.png").unwrap();
    let local_ip = local.host_str().unwrap().parse::<IpAddr>().unwrap();
    assert!(!is_public_ip(local_ip));
    let metadata = "169.254.169.254".parse::<IpAddr>().unwrap();
    assert!(!is_public_ip(metadata));
    let public = "93.184.216.34".parse::<IpAddr>().unwrap();
    assert!(is_public_ip(public));

    let userinfo = reqwest::Url::parse("https://localhost:secret@example.com/image.png").unwrap();
    assert!(validate_remote_asset_url(&userinfo).is_err());
}

#[test]
fn image_signature_must_match_declared_type() {
    let png = b"\x89PNG\r\n\x1a\nrest";
    assert_eq!(sniff_image_extension(png), Some("png"));
    assert!(content_type_matches_extension("image/png", "png"));
    assert!(!content_type_matches_extension("image/jpeg", "png"));
    assert_eq!(sniff_image_extension(b"<html>not an image</html>"), None);
}

struct TestWorkspace {
    path: std::path::PathBuf,
}

impl TestWorkspace {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("nevo-assets-{}", Uuid::new_v4()));
        create_workspace(
            path.to_string_lossy().into_owned(),
            "Assets".to_string(),
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

impl Drop for TestWorkspace {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn write_asset(workspace_path: &str, name: &str) -> std::path::PathBuf {
    let path = assets_dir_path(workspace_path).join(name);
    std::fs::create_dir_all(path.parent().expect("asset parent")).expect("create assets dir");
    std::fs::write(&path, b"image-bytes").expect("write asset");
    path
}

#[test]
fn delete_unreferenced_asset_ignores_old_snapshots_for_removed_cover() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let asset_path = write_asset(&workspace_path, "old-cover.jpg");

    let mut note = create_note_impl(
        workspace_path.clone(),
        None,
        "Cover note".to_string(),
        "📄".to_string(),
    )
    .expect("create note");
    note.cover = Some("image:.nevo/assets/old-cover.jpg".to_string());
    note.updated_at = Utc::now().to_rfc3339();
    save_note_impl(workspace_path.clone(), note.clone()).expect("save note with cover");

    note.cover = None;
    note.updated_at = Utc::now().to_rfc3339();
    save_note_impl(workspace_path.clone(), note).expect("save note without cover");

    let deleted =
        delete_unreferenced_asset_inner(workspace_path, ".nevo/assets/old-cover.jpg".to_string())
            .expect("delete asset");

    assert!(deleted);
    assert!(!asset_path.exists());
}

#[test]
fn delete_unreferenced_asset_keeps_current_note_references() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let asset_path = write_asset(&workspace_path, "shared-cover.jpg");

    let mut note = create_note_impl(
        workspace_path.clone(),
        None,
        "Current reference".to_string(),
        "📄".to_string(),
    )
    .expect("create note");
    note.content = json!({
        "type": "doc",
        "content": [{
            "type": "image_block",
            "attrs": { "src": ".nevo/assets/shared-cover.jpg" }
        }]
    });
    note.updated_at = Utc::now().to_rfc3339();
    save_note_impl(workspace_path.clone(), note).expect("save note");

    let deleted = delete_unreferenced_asset_inner(
        workspace_path,
        "image:.nevo/assets/shared-cover.jpg".to_string(),
    )
    .expect("delete asset");

    assert!(!deleted);
    assert!(asset_path.exists());
}

#[test]
fn delete_unreferenced_asset_keeps_images_referenced_by_a_drawing() {
    // Regression: an image inserted into a draw_block is referenced only from
    // inside the drawing's `.draw.json` payload (which lives in .nevo/assets).
    // The ref scanner must read those payloads, otherwise the image looks
    // orphaned and gets reaped while the drawing still uses it.
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    let image_path = write_asset(&workspace_path, "pasted-pic.png");

    // Persist a drawing whose payload references the image by assetSrc.
    let payload = br#"{"version":1,"strokes":[{"type":"image","points":[{"x":0,"y":0},{"x":10,"y":10}],"color":"transparent","size":1,"assetSrc":".nevo/assets/pasted-pic.png"}]}"#.to_vec();
    save_draw_asset_inner(workspace_path.clone(), "draw-img".to_string(), payload)
        .expect("save draw asset");

    let deleted =
        delete_unreferenced_asset_inner(workspace_path, ".nevo/assets/pasted-pic.png".to_string())
            .expect("delete asset");

    assert!(
        !deleted,
        "image referenced by a drawing must not be deleted"
    );
    assert!(image_path.exists());
}

#[test]
fn save_draw_asset_writes_and_returns_relative_src() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();

    let payload = br#"{"version":1,"strokes":[]}"#.to_vec();
    let src = save_draw_asset_inner(
        workspace_path.clone(),
        "draw-abc".to_string(),
        payload.clone(),
    )
    .expect("save draw asset");

    assert!(src.starts_with(".nevo/assets/draw-draw-abc-"));
    assert!(src.ends_with(".draw.json"));

    // The file must exist on disk under <workspace>/.nevo/assets/.
    let abs = std::path::Path::new(&workspace_path).join(&src);
    assert!(abs.exists(), "draw asset file should exist at {abs:?}");
}

#[test]
fn read_draw_asset_round_trips_saved_payload() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();

    let payload = br#"{"version":1,"strokes":[{"type":"line"}]}"#.to_vec();
    let src = save_draw_asset_inner(
        workspace_path.clone(),
        "draw-xyz".to_string(),
        payload.clone(),
    )
    .expect("save draw asset");

    let read = read_draw_asset_inner(workspace_path, src).expect("read draw asset");
    assert_eq!(read, payload);
}

#[test]
fn read_latest_draw_asset_recovers_by_id_when_src_is_stale() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();

    // First save → src #1. Then a second save with different content replaces
    // the file (new content-hash name), making src #1 stale on disk.
    let stale_src = save_draw_asset_inner(
        workspace_path.clone(),
        "draw-recover".to_string(),
        br#"{"version":1,"strokes":[{"type":"line"}]}"#.to_vec(),
    )
    .expect("first save");
    let current = br#"{"version":1,"strokes":[{"type":"rectangle"}]}"#.to_vec();
    save_draw_asset_inner(
        workspace_path.clone(),
        "draw-recover".to_string(),
        current.clone(),
    )
    .expect("second save");

    // Reading by the stale src now fails (the file was reaped)...
    assert!(read_draw_asset_inner(workspace_path.clone(), stale_src).is_err());
    // ...but reading by draw_id recovers the current payload.
    let read = read_latest_draw_asset_inner(workspace_path, "draw-recover".to_string())
        .expect("read latest by id");
    assert_eq!(read, current);
}

#[test]
fn read_latest_draw_asset_errors_when_no_payload_exists() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();
    assert!(read_latest_draw_asset_inner(workspace_path, "draw-missing".to_string()).is_err());
}

#[test]
fn save_draw_asset_replaces_previous_payload_for_same_id() {
    let workspace = TestWorkspace::new();
    let workspace_path = workspace.path_string();

    let first = save_draw_asset_inner(
        workspace_path.clone(),
        "draw-repl".to_string(),
        br#"{"v":1}"#.to_vec(),
    )
    .expect("save first");
    let second = save_draw_asset_inner(
        workspace_path.clone(),
        "draw-repl".to_string(),
        br#"{"v":2}"#.to_vec(),
    )
    .expect("save second");

    // Different content → different file name (hash suffix differs).
    assert_ne!(first, second);

    // Only one payload for this draw_id must remain on disk.
    let assets_dir = std::path::Path::new(&workspace_path)
        .join(".nevo")
        .join("assets");
    let remaining: Vec<_> = std::fs::read_dir(&assets_dir)
        .expect("read assets dir")
        .flatten()
        .filter(|e| {
            e.file_name()
                .to_str()
                .map(|n| n.starts_with("draw-draw-repl-") && n.ends_with(".draw.json"))
                .unwrap_or(false)
        })
        .collect();
    assert_eq!(remaining.len(), 1, "stale payload should have been removed");
}

#[test]
fn save_draw_asset_rejects_empty_payload() {
    let workspace = TestWorkspace::new();
    let result = save_draw_asset_inner(
        workspace.path_string(),
        "draw-empty".to_string(),
        Vec::new(),
    );
    assert!(result.is_err());
}

#[test]
fn read_draw_asset_rejects_non_asset_path() {
    let workspace = TestWorkspace::new();
    let result = read_draw_asset_inner(workspace.path_string(), "/etc/passwd".to_string());
    assert!(result.is_err());
}
