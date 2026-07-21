use std::collections::HashSet;

use serde_json::Value;

use super::super::types::WorkspaceHomeFavorite;

const MAX_HOME_FAVORITES: usize = 8;

pub(super) fn normalize_home_favorites(value: Option<&Value>) -> Vec<WorkspaceHomeFavorite> {
    let Some(entries) = value.and_then(Value::as_array) else {
        return Vec::new();
    };

    let mut normalized = Vec::new();
    let mut seen = HashSet::new();

    for entry in entries {
        let Some(favorite) = parse_home_favorite(entry) else {
            continue;
        };
        if !seen.insert(home_favorite_key(&favorite)) {
            continue;
        }

        normalized.push(favorite);
        if normalized.len() == MAX_HOME_FAVORITES {
            break;
        }
    }

    normalized
}

fn parse_home_favorite(value: &Value) -> Option<WorkspaceHomeFavorite> {
    let object = value.as_object()?;
    match object.get("kind").and_then(Value::as_str)? {
        "note" => Some(WorkspaceHomeFavorite::Note {
            id: normalized_id(object.get("id")?)?,
        }),
        "folder" => Some(WorkspaceHomeFavorite::Folder {
            id: normalized_id(object.get("id")?)?,
        }),
        "board" => Some(WorkspaceHomeFavorite::Board {
            id: normalized_id(object.get("id")?)?,
        }),
        "graph" => Some(WorkspaceHomeFavorite::Graph),
        "pluginView" => Some(WorkspaceHomeFavorite::PluginView {
            plugin_id: normalized_id(object.get("pluginId")?)?,
            contribution_id: normalized_id(object.get("contributionId")?)?,
        }),
        _ => None,
    }
}

fn normalized_id(value: &Value) -> Option<String> {
    let value = value.as_str()?.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn home_favorite_key(favorite: &WorkspaceHomeFavorite) -> String {
    match favorite {
        WorkspaceHomeFavorite::Note { id } => format!("note:{id}"),
        WorkspaceHomeFavorite::Folder { id } => format!("folder:{id}"),
        WorkspaceHomeFavorite::Board { id } => format!("board:{id}"),
        WorkspaceHomeFavorite::Graph => "graph".to_string(),
        WorkspaceHomeFavorite::PluginView {
            plugin_id,
            contribution_id,
        } => format!("pluginView:{plugin_id}:{contribution_id}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalizes_home_favorites_and_preserves_order() {
        let normalized = normalize_home_favorites(Some(&json!([
            { "kind": "note", "id": " note-1 " },
            { "kind": "graph" },
            { "kind": "note", "id": "note-1" },
            { "kind": "unknown", "id": "ignored" },
            { "kind": "pluginView", "pluginId": " plugin.alpha ", "contributionId": " view " },
            { "kind": "folder", "id": "" }
        ])));

        assert_eq!(
            normalized,
            vec![
                WorkspaceHomeFavorite::Note {
                    id: "note-1".to_string()
                },
                WorkspaceHomeFavorite::Graph,
                WorkspaceHomeFavorite::PluginView {
                    plugin_id: "plugin.alpha".to_string(),
                    contribution_id: "view".to_string(),
                },
            ]
        );
    }

    #[test]
    fn limits_home_favorites_to_eight() {
        let entries = (0..10)
            .map(|index| json!({ "kind": "board", "id": format!("board-{index}") }))
            .collect::<Vec<_>>();

        let normalized = normalize_home_favorites(Some(&Value::Array(entries)));

        assert_eq!(normalized.len(), MAX_HOME_FAVORITES);
        assert_eq!(
            normalized.last(),
            Some(&WorkspaceHomeFavorite::Board {
                id: "board-7".to_string()
            })
        );
    }
}
