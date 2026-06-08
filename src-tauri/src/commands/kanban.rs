use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use uuid::Uuid;

use super::path_utils::normalize_workspace_path;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KanbanBoard {
    pub id: String,
    pub title: String,
    pub icon: String,
    pub folder_id: Option<String>,
    pub status_property_id: String,
    pub property_definitions: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wip: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub automations: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub templates: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view_settings: Option<Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KanbanCard {
    pub id: String,
    pub board_id: String,
    pub title: String,
    pub icon: Option<String>,
    pub content: Value,
    pub properties: Value,
    #[serde(default = "empty_fields")]
    pub fields: Value,
    pub column_order: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn boards_dir(workspace_path: &str) -> std::path::PathBuf {
    Path::new(workspace_path).join(".nevo").join("boards")
}

fn board_path(workspace_path: &str, board_id: &str) -> std::path::PathBuf {
    boards_dir(workspace_path).join(format!("{}.json", board_id))
}

fn cards_dir(workspace_path: &str, board_id: &str) -> std::path::PathBuf {
    boards_dir(workspace_path).join(board_id)
}

fn card_path(workspace_path: &str, board_id: &str, card_id: &str) -> std::path::PathBuf {
    cards_dir(workspace_path, board_id).join(format!("{}.json", card_id))
}

fn empty_doc() -> Value {
    serde_json::json!({ "type": "doc", "content": [] })
}

fn empty_fields() -> Value {
    Value::Array(Vec::new())
}

#[tauri::command]
pub fn kanban_list_boards(workspace_path: String) -> Result<Vec<KanbanBoard>, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let dir = boards_dir(&workspace_path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut boards = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if let Ok(board) = serde_json::from_str::<KanbanBoard>(&content) {
            boards.push(board);
        }
    }
    boards.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(boards)
}

#[tauri::command]
pub fn kanban_create_board(
    workspace_path: String,
    title: String,
    icon: String,
    folder_id: Option<String>,
) -> Result<KanbanBoard, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let dir = boards_dir(&workspace_path);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let now = Utc::now().to_rfc3339();
    let board_id = Uuid::new_v4().to_string();
    let status_id = Uuid::new_v4().to_string();
    let opt1_id = Uuid::new_v4().to_string();
    let opt2_id = Uuid::new_v4().to_string();
    let opt3_id = Uuid::new_v4().to_string();

    let property_definitions = serde_json::json!([{
        "id": status_id,
        "name": "Status",
        "type": "select",
        "options": [
            { "id": opt1_id, "name": "To Do", "color": "#6b7280" },
            { "id": opt2_id, "name": "In Progress", "color": "#3b82f6" },
            { "id": opt3_id, "name": "Done", "color": "#22c55e" }
        ],
        "order": 0
    }]);

    let board = KanbanBoard {
        id: board_id.clone(),
        title,
        icon,
        folder_id,
        status_property_id: status_id,
        property_definitions,
        wip: None,
        automations: None,
        templates: None,
        view_settings: Some(serde_json::json!({
            "board": {
                "showCardPreview": true,
                "cardDensity": "comfortable"
            }
        })),
        created_at: now.clone(),
        updated_at: now,
    };

    let content = serde_json::to_string_pretty(&board).map_err(|e| e.to_string())?;
    std::fs::write(board_path(&workspace_path, &board_id), content).map_err(|e| e.to_string())?;
    Ok(board)
}

#[tauri::command]
pub fn kanban_update_board(
    workspace_path: String,
    board_id: String,
    title: Option<String>,
    icon: Option<String>,
    status_property_id: Option<String>,
    property_definitions: Option<Value>,
    view_settings: Option<Value>,
) -> Result<KanbanBoard, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let path = board_path(&workspace_path, &board_id);
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut board: KanbanBoard = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    if let Some(t) = title {
        board.title = t;
    }
    if let Some(i) = icon {
        board.icon = i;
    }
    if let Some(spid) = status_property_id {
        board.status_property_id = spid;
    }
    if let Some(pd) = property_definitions {
        board.property_definitions = pd;
    }
    if let Some(vs) = view_settings {
        board.view_settings = Some(vs);
    }
    board.updated_at = Utc::now().to_rfc3339();

    let new_content = serde_json::to_string_pretty(&board).map_err(|e| e.to_string())?;
    std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
    Ok(board)
}

#[tauri::command]
pub fn kanban_delete_board(workspace_path: String, board_id: String) -> Result<(), String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let path = board_path(&workspace_path, &board_id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    let dir = cards_dir(&workspace_path, &board_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn kanban_list_cards(
    workspace_path: String,
    board_id: String,
) -> Result<Vec<KanbanCard>, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let dir = cards_dir(&workspace_path, &board_id);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut cards = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if let Ok(card) = serde_json::from_str::<KanbanCard>(&content) {
            cards.push(card);
        }
    }
    cards.sort_by(|a, b| a.column_order.cmp(&b.column_order));
    Ok(cards)
}

#[tauri::command]
pub fn kanban_create_card(
    workspace_path: String,
    board_id: String,
    title: String,
    column_value: String,
    status_property_id: String,
    column_order: i64,
) -> Result<KanbanCard, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let dir = cards_dir(&workspace_path, &board_id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let now = Utc::now().to_rfc3339();
    let card_id = Uuid::new_v4().to_string();

    let mut properties = serde_json::Map::new();
    properties.insert(status_property_id, Value::String(column_value));

    let card = KanbanCard {
        id: card_id.clone(),
        board_id: board_id.clone(),
        title,
        icon: None,
        content: empty_doc(),
        properties: Value::Object(properties),
        fields: empty_fields(),
        column_order,
        progress: None,
        priority: None,
        created_at: now.clone(),
        updated_at: now,
    };

    let content = serde_json::to_string_pretty(&card).map_err(|e| e.to_string())?;
    std::fs::write(card_path(&workspace_path, &board_id, &card_id), content)
        .map_err(|e| e.to_string())?;
    Ok(card)
}

#[tauri::command]
pub fn kanban_update_card(
    workspace_path: String,
    board_id: String,
    card_id: String,
    title: Option<String>,
    icon: Option<String>,
    content: Option<Value>,
    properties: Option<Value>,
    fields: Option<Value>,
    column_order: Option<i64>,
    progress: Option<f64>,
    priority: Option<String>,
) -> Result<KanbanCard, String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let path = card_path(&workspace_path, &board_id, &card_id);
    let file_content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut card: KanbanCard = serde_json::from_str(&file_content).map_err(|e| e.to_string())?;

    if let Some(t) = title {
        card.title = t;
    }
    if let Some(i) = icon {
        card.icon = Some(i);
    }
    if let Some(c) = content {
        card.content = c;
    }
    if let Some(p) = properties {
        card.properties = p;
    }
    if let Some(f) = fields {
        card.fields = f;
    }
    if let Some(o) = column_order {
        card.column_order = o;
    }
    if let Some(p) = progress {
        card.progress = Some(p);
    }
    if let Some(pr) = priority {
        card.priority = Some(pr);
    }
    card.updated_at = Utc::now().to_rfc3339();

    let new_content = serde_json::to_string_pretty(&card).map_err(|e| e.to_string())?;
    std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
    Ok(card)
}

#[tauri::command]
pub fn kanban_delete_card(
    workspace_path: String,
    board_id: String,
    card_id: String,
) -> Result<(), String> {
    let workspace_path = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace_path.to_string_lossy().into_owned();
    let path = card_path(&workspace_path, &board_id, &card_id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
