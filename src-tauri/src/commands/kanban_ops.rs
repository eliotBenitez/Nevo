use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;

use super::kanban::{KanbanBoard, KanbanCard};
use super::path_utils::normalize_workspace_path;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct PropOption {
    id: String,
    name: String,
    #[serde(default)]
    color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PropDef {
    id: String,
    name: String,
    #[serde(rename = "type")]
    type_: String,
    #[serde(default)]
    options: Option<Vec<PropOption>>,
    order: i64,
}

fn boards_dir(wp: &str) -> std::path::PathBuf {
    Path::new(wp).join(".nevo").join("boards")
}
fn board_file(wp: &str, board_id: &str) -> std::path::PathBuf {
    boards_dir(wp).join(format!("{}.json", board_id))
}
fn cards_dir(wp: &str, board_id: &str) -> std::path::PathBuf {
    boards_dir(wp).join(board_id)
}
fn card_file(wp: &str, board_id: &str, card_id: &str) -> std::path::PathBuf {
    cards_dir(wp, board_id).join(format!("{}.json", card_id))
}

fn col_value(card: &KanbanCard, status_id: &str) -> String {
    card.properties
        .get(status_id)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_owned()
}

fn read_cards(wp: &str, board_id: &str) -> Result<Vec<KanbanCard>, String> {
    let dir = cards_dir(wp, board_id);
    let mut out = Vec::new();
    if !dir.exists() {
        return Ok(out);
    }
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let p = entry.path();
        if p.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        if let Ok(s) = std::fs::read_to_string(&p) {
            if let Ok(c) = serde_json::from_str::<KanbanCard>(&s) {
                out.push(c);
            }
        }
    }
    Ok(out)
}

fn save_card(wp: &str, board_id: &str, card: &KanbanCard) -> Result<(), String> {
    let content = serde_json::to_string_pretty(card).map_err(|e| e.to_string())?;
    std::fs::write(card_file(wp, board_id, &card.id), content).map_err(|e| e.to_string())
}

fn parse_defs(v: &Value) -> Vec<PropDef> {
    serde_json::from_value(v.clone()).unwrap_or_default()
}

// ── kanban_move_card ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn kanban_move_card(
    workspace_path: String,
    board_id: String,
    card_id: String,
    to_column_option_id: String,
    target_index: i64,
) -> Result<Vec<KanbanCard>, String> {
    let wp = normalize_workspace_path(&workspace_path)?
        .to_string_lossy()
        .into_owned();

    let board: KanbanBoard = serde_json::from_str(
        &std::fs::read_to_string(board_file(&wp, &board_id)).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let sid = &board.status_property_id;

    let mut all = read_cards(&wp, &board_id)?;
    let pos = all
        .iter()
        .position(|c| c.id == card_id)
        .ok_or_else(|| format!("Card {} not found", card_id))?;

    let from_col = col_value(&all[pos], sid);
    let mut moved = all.remove(pos);

    if let Value::Object(ref mut m) = moved.properties {
        m.insert(sid.clone(), Value::String(to_column_option_id.clone()));
    }
    let now = Utc::now().to_rfc3339();
    moved.updated_at = now.clone();

    // Build dest column cards (excl. moved), insert at target, renumber
    let mut dest: Vec<KanbanCard> = all
        .iter()
        .filter(|c| col_value(c, sid) == to_column_option_id)
        .cloned()
        .collect();
    dest.sort_by_key(|c| c.column_order);
    let idx = (target_index.max(0) as usize).min(dest.len());
    dest.insert(idx, moved);
    for (i, c) in dest.iter_mut().enumerate() {
        c.column_order = i as i64;
        c.updated_at = now.clone();
    }

    let mut to_write = dest.clone();

    // If cross-column, renumber source column too
    if from_col != to_column_option_id {
        let mut src: Vec<KanbanCard> = all
            .iter()
            .filter(|c| col_value(c, sid) == from_col)
            .cloned()
            .collect();
        src.sort_by_key(|c| c.column_order);
        for (i, c) in src.iter_mut().enumerate() {
            c.column_order = i as i64;
            c.updated_at = now.clone();
        }
        to_write.extend(src);
    }

    for c in &to_write {
        save_card(&wp, &board_id, c)?;
    }

    let changed: HashSet<&str> = to_write.iter().map(|c| c.id.as_str()).collect();
    let mut result: Vec<KanbanCard> = all
        .into_iter()
        .filter(|c| !changed.contains(c.id.as_str()))
        .collect();
    result.extend(to_write);
    result.sort_by_key(|c| c.column_order);
    Ok(result)
}

// ── kanban_save_board_schema ─────────────────────────────────────────────────

#[tauri::command]
pub fn kanban_save_board_schema(
    workspace_path: String,
    board_id: String,
    property_definitions: Value,
    column_remap: Option<Value>,
) -> Result<KanbanBoard, String> {
    let wp = normalize_workspace_path(&workspace_path)?
        .to_string_lossy()
        .into_owned();

    let mut board: KanbanBoard = serde_json::from_str(
        &std::fs::read_to_string(board_file(&wp, &board_id)).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    let new_defs = parse_defs(&property_definitions);

    // Validate schema
    let new_status = new_defs
        .iter()
        .find(|p| p.id == board.status_property_id)
        .ok_or("statusPropertyId missing from new definitions")?;
    if new_status.type_ != "select" {
        return Err("Status property must remain 'select'".into());
    }
    if new_status.options.as_ref().map_or(true, |o| o.is_empty()) {
        return Err("Status property must have at least one option".into());
    }
    let mut seen = HashSet::new();
    for p in &new_defs {
        if !seen.insert(&p.id) {
            return Err(format!("Duplicate property id: {}", p.id));
        }
    }

    // Compute diff
    let old_defs = parse_defs(&board.property_definitions);
    let old_map: HashMap<&str, &PropDef> = old_defs.iter().map(|p| (p.id.as_str(), p)).collect();
    let new_map: HashMap<&str, &PropDef> = new_defs.iter().map(|p| (p.id.as_str(), p)).collect();

    let deleted_props: Vec<&str> = old_defs
        .iter()
        .filter(|p| !new_map.contains_key(p.id.as_str()))
        .map(|p| p.id.as_str())
        .collect();

    let type_changed: Vec<&str> = old_defs
        .iter()
        .filter(|p| p.id != board.status_property_id)
        .filter(|p| {
            new_map
                .get(p.id.as_str())
                .map_or(false, |n| n.type_ != p.type_)
        })
        .map(|p| p.id.as_str())
        .collect();

    let mut deleted_opts: HashMap<&str, HashSet<String>> = HashMap::new();
    for op in &old_defs {
        if let Some(np) = new_map.get(op.id.as_str()) {
            if op.type_ == "select" || op.type_ == "multi_select" {
                let old_ids: HashSet<String> = op
                    .options
                    .as_deref()
                    .unwrap_or_default()
                    .iter()
                    .map(|o| o.id.clone())
                    .collect();
                let new_ids: HashSet<String> = np
                    .options
                    .as_deref()
                    .unwrap_or_default()
                    .iter()
                    .map(|o| o.id.clone())
                    .collect();
                let del: HashSet<String> = old_ids.difference(&new_ids).cloned().collect();
                if !del.is_empty() {
                    deleted_opts.insert(op.id.as_str(), del);
                }
            }
        }
    }

    let old_cols: HashSet<String> = old_defs
        .iter()
        .find(|p| p.id == board.status_property_id)
        .and_then(|p| p.options.as_deref())
        .unwrap_or_default()
        .iter()
        .map(|o| o.id.clone())
        .collect();
    let new_cols: HashSet<String> = new_status
        .options
        .as_deref()
        .unwrap_or_default()
        .iter()
        .map(|o| o.id.clone())
        .collect();
    let deleted_cols: HashSet<String> = old_cols.difference(&new_cols).cloned().collect();

    let remap: HashMap<String, String> = column_remap
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let fallback = new_status
        .options
        .as_ref()
        .and_then(|o| o.first())
        .map(|o| o.id.clone())
        .unwrap_or_default();
    let sid = board.status_property_id.clone();
    let now = Utc::now().to_rfc3339();

    // Migrate cards
    let mut cards = read_cards(&wp, &board_id)?;
    let mut dirty_ids: HashSet<String> = HashSet::new();

    for card in &mut cards {
        let mut changed = false;
        if let Value::Object(ref mut props) = card.properties {
            if !deleted_cols.is_empty() {
                if let Some(Value::String(col)) = props.get(&sid).cloned() {
                    if deleted_cols.contains(&col) {
                        let dst = remap.get(&col).cloned().unwrap_or_else(|| fallback.clone());
                        props.insert(sid.clone(), Value::String(dst));
                        changed = true;
                    }
                }
            }
            for pid in &deleted_props {
                if props.remove(*pid).is_some() {
                    changed = true;
                }
            }
            for pid in &type_changed {
                if props.contains_key(*pid) {
                    props.insert(pid.to_string(), Value::Null);
                    changed = true;
                }
            }
            for (pid, del) in &deleted_opts {
                if *pid == sid.as_str() {
                    continue;
                }
                if let Some(op) = old_map.get(pid) {
                    if op.type_ == "select" {
                        if let Some(Value::String(v)) = props.get(*pid).cloned() {
                            if del.contains(&v) {
                                props.insert(pid.to_string(), Value::Null);
                                changed = true;
                            }
                        }
                    } else if op.type_ == "multi_select" {
                        if let Some(arr) = props.get(*pid).and_then(|v| v.as_array()).cloned() {
                            let filtered: Vec<Value> = arr
                                .into_iter()
                                .filter(|v| v.as_str().map_or(true, |s| !del.contains(s)))
                                .collect();
                            props.insert(pid.to_string(), Value::Array(filtered));
                            changed = true;
                        }
                    }
                }
            }
        }
        if changed {
            card.updated_at = now.clone();
            dirty_ids.insert(card.id.clone());
        }
    }

    for card in cards.iter().filter(|c| dirty_ids.contains(&c.id)) {
        save_card(&wp, &board_id, card)?;
    }

    board.property_definitions = property_definitions;
    board.updated_at = now;
    let content = serde_json::to_string_pretty(&board).map_err(|e| e.to_string())?;
    std::fs::write(board_file(&wp, &board_id), content).map_err(|e| e.to_string())?;

    Ok(board)
}
