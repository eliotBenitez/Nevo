use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::Datelike;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;

use super::path_utils::{normalize_workspace_path, validate_id};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbRecord {
    id: String,
    cells: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbField {
    id: String,
    #[serde(rename = "type")]
    field_type: String,
    #[serde(default)]
    options: Vec<DbFieldOption>,
}

#[derive(Clone, Debug, Deserialize)]
struct DbFieldOption {
    id: String,
    name: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbFilterRule {
    field_id: String,
    operator: String,
    value: Value,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbSortRule {
    field_id: String,
    direction: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseQuery {
    offset: usize,
    limit: usize,
    #[serde(default)]
    fields: Vec<DbField>,
    #[serde(default)]
    filters: Vec<DbFilterRule>,
    #[serde(default)]
    sorts: Vec<DbSortRule>,
}

#[derive(Clone, Debug, Serialize)]
pub struct DatabaseQueryResult {
    records: Vec<DbRecord>,
    total: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DatabaseOperation {
    Insert {
        record: DbRecord,
        index: Option<usize>,
    },
    UpdateCell {
        record_id: String,
        field_id: String,
        value: Value,
    },
    Delete {
        record_id: String,
    },
    Replace {
        records: Vec<DbRecord>,
    },
    DeleteField {
        field_id: String,
    },
}

fn database_path(workspace: &Path) -> PathBuf {
    workspace.join(".nevo").join("databases.sqlite")
}

fn open_database(workspace: &Path) -> Result<Connection, String> {
    std::fs::create_dir_all(workspace.join(".nevo")).map_err(|error| error.to_string())?;
    let connection =
        Connection::open(database_path(workspace)).map_err(|error| error.to_string())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    connection.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS database_records (
           database_id TEXT NOT NULL,
           record_id TEXT NOT NULL,
           ordinal INTEGER NOT NULL,
           cells_json TEXT NOT NULL,
           PRIMARY KEY (database_id, record_id)
         );
         CREATE INDEX IF NOT EXISTS database_records_order ON database_records(database_id, ordinal);",
    ).map_err(|error| error.to_string())?;
    Ok(connection)
}

/// Folds the write-ahead log back into the main `databases.sqlite` file so a
/// file-level copy (e.g. GitHub sync) captures the latest committed rows. No-op
/// when the database file does not exist yet. Best-effort: never creates the
/// file and reports failures to the caller without side effects.
pub(crate) fn checkpoint_database(workspace: &Path) -> Result<(), String> {
    let path = database_path(workspace);
    if !path.is_file() {
        return Ok(());
    }
    let connection = Connection::open(&path).map_err(|error| error.to_string())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|error| error.to_string())
}

fn read_records(connection: &Connection, database_id: &str) -> Result<Vec<DbRecord>, String> {
    let mut statement = connection.prepare(
        "SELECT record_id, cells_json FROM database_records WHERE database_id = ?1 ORDER BY ordinal, record_id",
    ).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([database_id], |row| {
            let cells: String = row.get(1)?;
            Ok((row.get::<_, String>(0)?, cells))
        })
        .map_err(|error| error.to_string())?;
    rows.map(|row| {
        let (id, cells) = row.map_err(|error| error.to_string())?;
        Ok(DbRecord {
            id,
            cells: serde_json::from_str(&cells).map_err(|error| error.to_string())?,
        })
    })
    .collect()
}

fn replace_records(
    connection: &mut Connection,
    database_id: &str,
    records: &[DbRecord],
) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "DELETE FROM database_records WHERE database_id = ?1",
            [database_id],
        )
        .map_err(|error| error.to_string())?;
    for (ordinal, record) in records.iter().enumerate() {
        transaction.execute(
            "INSERT INTO database_records(database_id, record_id, ordinal, cells_json) VALUES (?1, ?2, ?3, ?4)",
            params![database_id, record.id, ordinal as i64, serde_json::to_string(&record.cells).map_err(|error| error.to_string())?],
        ).map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

fn workspace_and_id(
    workspace_path: String,
    database_id: String,
) -> Result<(PathBuf, String), String> {
    validate_id(&database_id)?;
    Ok((normalize_workspace_path(&workspace_path)?, database_id))
}

fn raw_value<'a>(record: &'a DbRecord, field: &DbField) -> &'a Value {
    record.cells.get(&field.id).unwrap_or(&Value::Null)
}

fn value_string(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        Value::Bool(value) => value.to_string(),
        _ => String::new(),
    }
}

fn value_array(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn value_number(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|value| value.parse().ok()))
}

fn is_empty(value: &Value) -> bool {
    value.is_null()
        || value.as_str().is_some_and(|value| value.trim().is_empty())
        || value.as_array().is_some_and(Vec::is_empty)
}

fn rule_is_active(rule: &DbFilterRule) -> bool {
    if matches!(rule.operator.as_str(), "is_empty" | "is_not_empty") {
        return true;
    }
    rule.value
        .as_array()
        .map(|value| !value.is_empty())
        .unwrap_or_else(|| {
            rule.value
                .as_str()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
        })
}

fn date_stamp(value: &str) -> Option<i32> {
    chrono::NaiveDate::parse_from_str(value.get(..10).unwrap_or(value), "%Y-%m-%d")
        .ok()
        .map(|date| date.num_days_from_ce())
}

fn matches_filter(
    record: &DbRecord,
    rule: &DbFilterRule,
    fields: &BTreeMap<String, DbField>,
) -> bool {
    let Some(field) = fields.get(&rule.field_id) else {
        return true;
    };
    let raw = raw_value(record, field);
    if rule.operator == "is_empty" {
        return is_empty(raw);
    }
    if rule.operator == "is_not_empty" {
        return !is_empty(raw);
    }
    match field.field_type.as_str() {
        "text" | "url" => {
            let current = value_string(raw).to_lowercase();
            let target = value_string(&rule.value).to_lowercase();
            match rule.operator.as_str() {
                "contains" => current.contains(&target),
                "not_contains" => !current.contains(&target),
                "is" => current == target,
                "is_not" => current != target,
                _ => true,
            }
        }
        "select" => match rule.operator.as_str() {
            "is" => value_string(raw) == value_string(&rule.value),
            "is_not" => value_string(raw) != value_string(&rule.value),
            _ => true,
        },
        "multi_select" => {
            let current = value_array(raw);
            let target = value_array(&rule.value);
            match rule.operator.as_str() {
                "has_any" => target.is_empty() || target.iter().any(|item| current.contains(item)),
                "has_all" => target.iter().all(|item| current.contains(item)),
                "has_none" => !target.iter().any(|item| current.contains(item)),
                _ => true,
            }
        }
        "number" => {
            let (Some(current), Some(target)) = (value_number(raw), value_number(&rule.value))
            else {
                return false;
            };
            match rule.operator.as_str() {
                "eq" => current == target,
                "neq" => current != target,
                "gt" => current > target,
                "lt" => current < target,
                "gte" => current >= target,
                "lte" => current <= target,
                _ => true,
            }
        }
        "date" => {
            let (Some(current), Some(target)) = (
                date_stamp(&value_string(raw)),
                date_stamp(&value_string(&rule.value)),
            ) else {
                return false;
            };
            match rule.operator.as_str() {
                "is" => current == target,
                "before" => current < target,
                "after" => current > target,
                _ => true,
            }
        }
        "checkbox" => raw.as_bool().unwrap_or(false) == (value_string(&rule.value) == "true"),
        _ => true,
    }
}

fn sort_key(record: &DbRecord, field: &DbField) -> (bool, Value) {
    let raw = raw_value(record, field);
    match field.field_type.as_str() {
        "number" => value_number(raw)
            .map(|value| (false, Value::from(value)))
            .unwrap_or((true, Value::Null)),
        "date" => date_stamp(&value_string(raw))
            .map(|value| (false, Value::from(value)))
            .unwrap_or((true, Value::Null)),
        "checkbox" => (false, Value::from(raw.as_bool().unwrap_or(false))),
        "multi_select" => {
            let value = value_array(raw).join(", ").to_lowercase();
            (value.is_empty(), Value::String(value))
        }
        "select" => {
            let value = value_string(raw);
            let label = field
                .options
                .iter()
                .find(|option| option.id == value)
                .map(|option| option.name.clone())
                .unwrap_or(value)
                .to_lowercase();
            (label.is_empty(), Value::String(label))
        }
        _ => {
            let value = value_string(raw).to_lowercase();
            (value.trim().is_empty(), Value::String(value))
        }
    }
}

fn compare_values(left: &Value, right: &Value) -> Ordering {
    match (left.as_f64(), right.as_f64()) {
        (Some(left), Some(right)) => left.partial_cmp(&right).unwrap_or(Ordering::Equal),
        _ => value_string(left).cmp(&value_string(right)),
    }
}

fn apply_query(mut records: Vec<DbRecord>, query: &DatabaseQuery) -> Vec<DbRecord> {
    let fields: BTreeMap<String, DbField> = query
        .fields
        .iter()
        .cloned()
        .map(|field| (field.id.clone(), field))
        .collect();
    let filters: Vec<&DbFilterRule> = query
        .filters
        .iter()
        .filter(|rule| rule_is_active(rule))
        .collect();
    if !filters.is_empty() {
        records.retain(|record| {
            filters
                .iter()
                .all(|rule| matches_filter(record, rule, &fields))
        });
    }
    let sorts: Vec<&DbSortRule> = query
        .sorts
        .iter()
        .filter(|rule| fields.contains_key(&rule.field_id))
        .collect();
    if !sorts.is_empty() {
        records.sort_by(|left, right| {
            for rule in &sorts {
                let field = &fields[&rule.field_id];
                let (left_empty, left_value) = sort_key(left, field);
                let (right_empty, right_value) = sort_key(right, field);
                let ordering = match (left_empty, right_empty) {
                    (true, true) => Ordering::Equal,
                    (true, false) => Ordering::Greater,
                    (false, true) => Ordering::Less,
                    (false, false) => compare_values(&left_value, &right_value),
                };
                if ordering != Ordering::Equal {
                    return if rule.direction == "desc" {
                        ordering.reverse()
                    } else {
                        ordering
                    };
                }
            }
            Ordering::Equal
        });
    }
    records
}

#[tauri::command]
pub async fn database_query_records(
    workspace_path: String,
    database_id: String,
    query: DatabaseQuery,
) -> Result<DatabaseQueryResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (workspace, database_id) = workspace_and_id(workspace_path, database_id)?;
        let connection = open_database(&workspace)?;
        if query.filters.iter().all(|rule| !rule_is_active(rule)) && query.sorts.is_empty() {
            let total = connection
                .query_row(
                    "SELECT COUNT(*) FROM database_records WHERE database_id = ?1",
                    [&database_id],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|error| error.to_string())? as usize;
            let mut statement = connection
                .prepare(
                    "SELECT record_id, cells_json FROM database_records \
                     WHERE database_id = ?1 ORDER BY ordinal, record_id LIMIT ?2 OFFSET ?3",
                )
                .map_err(|error| error.to_string())?;
            let rows = statement
                .query_map(
                    params![
                        database_id,
                        query.limit.min(500) as i64,
                        query.offset as i64
                    ],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .map_err(|error| error.to_string())?;
            let records = rows
                .map(|row| {
                    let (id, cells) = row.map_err(|error| error.to_string())?;
                    Ok(DbRecord {
                        id,
                        cells: serde_json::from_str(&cells).map_err(|error| error.to_string())?,
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;
            return Ok(DatabaseQueryResult { records, total });
        }
        let input_count = connection
            .query_row(
                "SELECT COUNT(*) FROM database_records WHERE database_id = ?1",
                [&database_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| error.to_string())?;
        if input_count > 100_000 {
            return Err("Filtered database queries are limited to 100,000 records".to_string());
        }
        let records = apply_query(read_records(&connection, &database_id)?, &query);
        let total = records.len();
        let records = records
            .into_iter()
            .skip(query.offset)
            .take(query.limit.min(500))
            .collect();
        Ok(DatabaseQueryResult { records, total })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn database_apply_operations(
    workspace_path: String,
    database_id: String,
    operations: Vec<DatabaseOperation>,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (workspace, database_id) = workspace_and_id(workspace_path, database_id)?;
        let mut connection = open_database(&workspace)?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        for operation in operations {
            match operation {
                DatabaseOperation::Insert { record, index } => {
                    let count = transaction
                        .query_row(
                            "SELECT COUNT(*) FROM database_records WHERE database_id = ?1",
                            [&database_id],
                            |row| row.get::<_, i64>(0),
                        )
                        .map_err(|error| error.to_string())?;
                    let ordinal = index.map(|value| (value as i64).min(count)).unwrap_or(count);
                    transaction
                        .execute(
                            "UPDATE database_records SET ordinal = ordinal + 1 \
                             WHERE database_id = ?1 AND ordinal >= ?2",
                            params![database_id, ordinal],
                        )
                        .map_err(|error| error.to_string())?;
                    transaction.execute(
                        "INSERT INTO database_records(database_id, record_id, ordinal, cells_json) \
                         VALUES (?1, ?2, ?3, ?4)",
                        params![database_id, record.id, ordinal, serde_json::to_string(&record.cells).map_err(|error| error.to_string())?],
                    ).map_err(|error| error.to_string())?;
                }
                DatabaseOperation::UpdateCell {
                    record_id,
                    field_id,
                    value,
                } => {
                    let cells = transaction.query_row(
                        "SELECT cells_json FROM database_records WHERE database_id = ?1 AND record_id = ?2",
                        params![database_id, record_id],
                        |row| row.get::<_, String>(0),
                    );
                    if let Ok(cells) = cells {
                        let mut cells: BTreeMap<String, Value> =
                            serde_json::from_str(&cells).map_err(|error| error.to_string())?;
                        cells.insert(field_id, value);
                        transaction.execute(
                            "UPDATE database_records SET cells_json = ?3 WHERE database_id = ?1 AND record_id = ?2",
                            params![database_id, record_id, serde_json::to_string(&cells).map_err(|error| error.to_string())?],
                        ).map_err(|error| error.to_string())?;
                    }
                }
                DatabaseOperation::Delete { record_id } => {
                    transaction
                        .execute(
                            "DELETE FROM database_records WHERE database_id = ?1 AND record_id = ?2",
                            params![database_id, record_id],
                        )
                        .map_err(|error| error.to_string())?;
                }
                DatabaseOperation::Replace { records } => {
                    transaction
                        .execute(
                            "DELETE FROM database_records WHERE database_id = ?1",
                            [&database_id],
                        )
                        .map_err(|error| error.to_string())?;
                    for (ordinal, record) in records.iter().enumerate() {
                        transaction.execute(
                            "INSERT INTO database_records(database_id, record_id, ordinal, cells_json) VALUES (?1, ?2, ?3, ?4)",
                            params![database_id, record.id, ordinal as i64, serde_json::to_string(&record.cells).map_err(|error| error.to_string())?],
                        ).map_err(|error| error.to_string())?;
                    }
                }
                DatabaseOperation::DeleteField { field_id } => {
                    let mut statement = transaction
                        .prepare(
                            "SELECT record_id, cells_json FROM database_records WHERE database_id = ?1",
                        )
                        .map_err(|error| error.to_string())?;
                    let rows = statement
                        .query_map([&database_id], |row| {
                            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                        })
                        .map_err(|error| error.to_string())?
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|error| error.to_string())?;
                    drop(statement);
                    for (record_id, cells) in rows {
                        let mut cells: BTreeMap<String, Value> =
                            serde_json::from_str(&cells).map_err(|error| error.to_string())?;
                        if cells.remove(&field_id).is_some() {
                            transaction.execute(
                                "UPDATE database_records SET cells_json = ?3 WHERE database_id = ?1 AND record_id = ?2",
                                params![database_id, record_id, serde_json::to_string(&cells).map_err(|error| error.to_string())?],
                            ).map_err(|error| error.to_string())?;
                        }
                    }
                }
            }
        }
        let count = transaction
            .query_row(
                "SELECT COUNT(*) FROM database_records WHERE database_id = ?1",
                [&database_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(count as usize)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn database_import_records(
    workspace_path: String,
    database_id: String,
    records: Vec<DbRecord>,
    mode: String,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (workspace, database_id) = workspace_and_id(workspace_path, database_id)?;
        let mut connection = open_database(&workspace)?;
        let mut next = if mode == "append" {
            read_records(&connection, &database_id)?
        } else {
            Vec::new()
        };
        next.extend(records);
        replace_records(&mut connection, &database_id, &next)?;
        Ok(next.len())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn database_read_all_records(
    workspace_path: String,
    database_id: String,
) -> Result<Vec<DbRecord>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (workspace, database_id) = workspace_and_id(workspace_path, database_id)?;
        read_records(&open_database(&workspace)?, &database_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn database_create_snapshot(
    workspace_path: String,
    database_id: String,
) -> Result<Vec<DbRecord>, String> {
    database_read_all_records(workspace_path, database_id).await
}

#[tauri::command]
pub async fn database_restore_snapshot(
    workspace_path: String,
    database_id: String,
    snapshot: Vec<DbRecord>,
) -> Result<usize, String> {
    database_import_records(workspace_path, database_id, snapshot, "replace".to_string()).await
}

#[tauri::command]
pub async fn database_delete(workspace_path: String, database_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (workspace, database_id) = workspace_and_id(workspace_path, database_id)?;
        let connection = open_database(&workspace)?;
        connection
            .execute(
                "DELETE FROM database_records WHERE database_id = ?1",
                [database_id],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_records_in_workspace_sqlite_file() {
        let workspace = std::env::temp_dir().join(format!("nevo-db-test-{}", uuid::Uuid::new_v4()));
        let mut connection = open_database(&workspace).expect("open sqlite database");
        let records = vec![DbRecord {
            id: "r1".to_string(),
            cells: BTreeMap::from([("name".to_string(), Value::String("Alice".to_string()))]),
        }];
        replace_records(&mut connection, "database_test", &records).expect("save records");
        assert_eq!(
            read_records(&connection, "database_test")
                .expect("read records")
                .len(),
            1
        );
        assert!(database_path(&workspace).is_file());
        let _ = std::fs::remove_dir_all(workspace);
    }

    #[test]
    fn checkpoint_folds_committed_rows_into_the_main_database_file() {
        let workspace = std::env::temp_dir().join(format!("nevo-db-ckpt-{}", uuid::Uuid::new_v4()));

        // No database file yet: checkpoint is a no-op and must not create one.
        checkpoint_database(&workspace).expect("checkpoint without a database file");
        assert!(!database_path(&workspace).is_file());

        let mut connection = open_database(&workspace).expect("open sqlite database");
        let records = vec![DbRecord {
            id: "r1".to_string(),
            cells: BTreeMap::from([("name".to_string(), Value::String("Alice".to_string()))]),
        }];
        replace_records(&mut connection, "database_test", &records).expect("save records");
        drop(connection);

        checkpoint_database(&workspace).expect("checkpoint existing database");

        // After TRUNCATE the row is durable in the main file and a fresh
        // connection (a stand-in for the sync reading the copied file) sees it.
        let reopened = Connection::open(database_path(&workspace)).expect("reopen database");
        assert_eq!(
            read_records(&reopened, "database_test")
                .expect("read records")
                .len(),
            1
        );
        let _ = std::fs::remove_dir_all(workspace);
    }

    #[test]
    fn query_filters_and_sorts_records_before_pagination() {
        let records = vec![
            DbRecord {
                id: "r1".to_string(),
                cells: BTreeMap::from([("age".to_string(), Value::from(20))]),
            },
            DbRecord {
                id: "r2".to_string(),
                cells: BTreeMap::from([("age".to_string(), Value::from(10))]),
            },
            DbRecord {
                id: "r3".to_string(),
                cells: BTreeMap::new(),
            },
        ];
        let query = DatabaseQuery {
            offset: 0,
            limit: 10,
            fields: vec![DbField {
                id: "age".to_string(),
                field_type: "number".to_string(),
                options: vec![],
            }],
            filters: vec![DbFilterRule {
                field_id: "age".to_string(),
                operator: "gte".to_string(),
                value: Value::String("10".to_string()),
            }],
            sorts: vec![DbSortRule {
                field_id: "age".to_string(),
                direction: "desc".to_string(),
            }],
        };
        let ids: Vec<String> = apply_query(records, &query)
            .into_iter()
            .map(|record| record.id)
            .collect();
        assert_eq!(ids, ["r1", "r2"]);
    }

    #[test]
    fn deserializes_frontend_operation_fields_as_camel_case() {
        let operation: DatabaseOperation = serde_json::from_value(serde_json::json!({
            "type": "updateCell",
            "recordId": "record_1",
            "fieldId": "amount",
            "value": 42,
        }))
        .expect("deserialize frontend update operation");

        assert!(matches!(operation, DatabaseOperation::UpdateCell {
            record_id,
            field_id,
            value: Value::Number(_),
        } if record_id == "record_1" && field_id == "amount"));
    }
}
