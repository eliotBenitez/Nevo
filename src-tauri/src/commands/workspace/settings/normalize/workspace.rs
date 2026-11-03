use serde_json::{Map, Value};

use crate::commands::workspace::types::WorkspaceSettings;

pub(super) fn apply_workspace(settings: &mut WorkspaceSettings, object: &Map<String, Value>) {
    let workspace = object
        .get("workspace")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    settings.workspace.show_backlinks_by_default = workspace
        .get("showBacklinksByDefault")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.show_graph_labels = workspace
        .get("showGraphLabels")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    settings.workspace.folder_create_behavior = "current-folder".to_string();
    settings.workspace.root_notes_visible = workspace
        .get("rootNotesVisible")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.default_sort = "updated-desc".to_string();
    settings.workspace.description = workspace
        .get("description")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    settings.workspace.workspace_type = workspace
        .get("workspaceType")
        .and_then(|value| value.as_str())
        .filter(|value| {
            matches!(
                *value,
                "general" | "research" | "writing" | "product" | "knowledge-base"
            )
        })
        .unwrap_or("general")
        .to_string();
    settings.workspace.status = workspace
        .get("status")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "active" | "archived" | "draft"))
        .unwrap_or("active")
        .to_string();
    settings.workspace.tags = workspace
        .get("tags")
        .and_then(|value| value.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    settings.workspace.open_last_visited_system_view = workspace
        .get("openLastVisitedSystemView")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.remember_expanded_folders = workspace
        .get("rememberExpandedFolders")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.sidebar_default_state = workspace
        .get("sidebarDefaultState")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "expanded" | "collapsed"))
        .unwrap_or("expanded")
        .to_string();
    settings.workspace.new_note_placement = workspace
        .get("newNotePlacement")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "current-folder" | "root"))
        .unwrap_or("current-folder")
        .to_string();
    settings.workspace.new_folder_placement = workspace
        .get("newFolderPlacement")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "current-folder" | "root"))
        .unwrap_or("current-folder")
        .to_string();
    settings.workspace.default_child_sort = workspace
        .get("defaultChildSort")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "manual" | "title-asc" | "updated-desc"))
        .unwrap_or("manual")
        .to_string();
    settings.workspace.show_empty_folders = workspace
        .get("showEmptyFolders")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.default_note_icon = workspace
        .get("defaultNoteIcon")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("📄")
        .to_string();
    settings.workspace.default_note_title_pattern = workspace
        .get("defaultNoteTitlePattern")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "untitled" | "date" | "date-time"))
        .unwrap_or("untitled")
        .to_string();
    settings.workspace.default_folder_icon = workspace
        .get("defaultFolderIcon")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("📁")
        .to_string();
    settings.workspace.new_note_template = workspace
        .get("newNoteTemplate")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("blank")
        .to_string();
    settings.workspace.new_workspace_home_note = workspace
        .get("newWorkspaceHomeNote")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    settings.workspace.auto_create_starter_structure = workspace
        .get("autoCreateStarterStructure")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "off" | "light" | "structured"))
        .unwrap_or("light")
        .to_string();
    settings.workspace.sidebar_content_mode = workspace
        .get("sidebarContentMode")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "tree" | "tag-preview"))
        .unwrap_or("tree")
        .to_string();
    settings.workspace.sidebar_layout = workspace
        .get("sidebarLayout")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "docked" | "floating"))
        .unwrap_or("docked")
        .to_string();
    settings.workspace.graph_entry_mode = workspace
        .get("graphEntryMode")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "global" | "from-current-note"))
        .unwrap_or("global")
        .to_string();
    settings.workspace.graph_scope_default = workspace
        .get("graphScopeDefault")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "workspace" | "current-folder"))
        .unwrap_or("workspace")
        .to_string();
    settings.workspace.search_start_scope = workspace
        .get("searchStartScope")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "workspace" | "current-folder"))
        .unwrap_or("workspace")
        .to_string();
    settings.workspace.history_default_range = workspace
        .get("historyDefaultRange")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "7d" | "30d" | "all"))
        .unwrap_or("30d")
        .to_string();
    settings.workspace.sidebar_sort_mode = workspace
        .get("sidebarSortMode")
        .and_then(|value| value.as_str())
        .filter(|value| matches!(*value, "manual" | "name-asc" | "name-desc" | "updated"))
        .unwrap_or("manual")
        .to_string();
}
