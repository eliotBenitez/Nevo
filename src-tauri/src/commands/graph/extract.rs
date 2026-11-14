//! Link edges of a ProseMirror note body.

use super::{EdgeKind, GraphEdge};
use crate::commands::path_utils::validate_id;

/// Internal-link edges of a note body: only text nodes reached through
/// `content` count, never marks on inline atoms or JSON inside node attrs.
/// Unresolved links (empty or invalid `noteId`) are skipped, not rejected, so
/// one broken `[[Title]]` cannot drop the note's other edges.
pub(super) fn extract_link_edges(note_id: &str, content: &serde_json::Value) -> Vec<GraphEdge> {
    fn walk(note_id: &str, node: &serde_json::Value, edges: &mut Vec<GraphEdge>) {
        if node.get("type").and_then(|t| t.as_str()) == Some("text") {
            let attrs = node
                .get("marks")
                .and_then(|marks| marks.as_array())
                .and_then(|marks| {
                    marks.iter().find(|mark| {
                        mark.get("type").and_then(|t| t.as_str()) == Some("internal_link")
                    })
                })
                .and_then(|mark| mark.get("attrs"));
            if let Some(attrs) = attrs {
                let target = attrs.get("noteId").and_then(|id| id.as_str());
                if let Some(target) = target.filter(|id| validate_id(id).is_ok()) {
                    edges.push(GraphEdge {
                        source: note_id.to_string(),
                        target: target.to_string(),
                        kind: EdgeKind::Link,
                        anchor: attrs
                            .get("anchor")
                            .and_then(|a| a.as_str())
                            .map(str::to_string),
                    });
                }
            }
        }
        if let Some(children) = node.get("content").and_then(|c| c.as_array()) {
            children
                .iter()
                .for_each(|child| walk(note_id, child, edges));
        }
    }
    let mut edges = Vec::new();
    walk(note_id, content, &mut edges);
    edges
}
