//! MCP resources: read-only views of the workspace that clients can attach as
//! context. Each URI maps onto an existing bridge read method, so resources
//! obey the same access mode as the tools.

use rmcp::model::{Resource, ResourceTemplate};
use serde_json::{json, Value};

const WORKSPACE_URI: &str = "nevo://workspace";
const NOTES_URI: &str = "nevo://notes";
const FOLDERS_URI: &str = "nevo://folders";
const NOTE_PREFIX: &str = "nevo://note/";

pub fn listed() -> Vec<Resource> {
    [
        (
            WORKSPACE_URI,
            "workspace",
            "Name, path, and counts of the open workspace",
        ),
        (
            NOTES_URI,
            "notes",
            "Every note with its id, title, and folder path",
        ),
        (FOLDERS_URI, "folders", "Every folder with its id and path"),
    ]
    .into_iter()
    .map(|(uri, name, description)| {
        Resource::new(uri, name)
            .with_description(description)
            .with_mime_type("application/json")
    })
    .collect()
}

pub fn templates() -> Vec<ResourceTemplate> {
    vec![ResourceTemplate::new("nevo://note/{noteId}", "note")
        .with_title("Nevo note")
        .with_description("One note's metadata and saved ProseMirror content")
        .with_mime_type("application/json")]
}

/// Maps a resource URI onto the bridge method and params that serve it.
pub fn resolve(uri: &str) -> Option<(&'static str, Value)> {
    match uri {
        WORKSPACE_URI => Some(("workspace.info", json!({}))),
        NOTES_URI => Some(("notes.list", json!({ "limit": 500 }))),
        FOLDERS_URI => Some(("folders.list", json!({}))),
        _ => {
            let note_id = uri.strip_prefix(NOTE_PREFIX)?;
            // The bridge validates ids too; rejecting here keeps nested paths
            // or empty ids from ever being forwarded.
            if note_id.is_empty() || note_id.contains('/') {
                return None;
            }
            Some(("notes.read", json!({ "noteId": note_id })))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_uris_map_onto_read_methods() {
        assert_eq!(resolve("nevo://workspace").unwrap().0, "workspace.info");
        assert_eq!(resolve("nevo://notes").unwrap().0, "notes.list");
        assert_eq!(resolve("nevo://folders").unwrap().0, "folders.list");
        let (method, params) = resolve("nevo://note/note-1").unwrap();
        assert_eq!(method, "notes.read");
        assert_eq!(params["noteId"], "note-1");
    }

    #[test]
    fn malformed_resource_uris_are_rejected() {
        assert!(resolve("nevo://note/").is_none());
        assert!(resolve("nevo://note/a/b").is_none());
        assert!(resolve("file:///etc/passwd").is_none());
    }

    #[test]
    fn every_listed_resource_resolves() {
        for resource in listed() {
            assert!(resolve(&resource.uri).is_some(), "{}", resource.uri);
        }
    }
}
