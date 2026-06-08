use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use uuid::Uuid;

use super::folder::{load_manifest, save_manifest};
use super::note::NoteDocument;
use super::path_utils::normalize_workspace_path;
use super::workspace::{FolderMeta, NoteMeta};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TemplateField {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub required: bool,
    #[serde(default)]
    pub default_value: Option<Value>,
    #[serde(default)]
    pub options: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDocument {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub content: Value,
    #[serde(default)]
    pub fields: Vec<TemplateField>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub built_in: bool,
}

fn text(value: &str) -> Value {
    serde_json::json!({ "type": "text", "text": value })
}

fn paragraph(value: &str) -> Value {
    if value.is_empty() {
        serde_json::json!({ "type": "paragraph" })
    } else {
        serde_json::json!({ "type": "paragraph", "content": [text(value)] })
    }
}

fn heading(level: u8, value: &str) -> Value {
    serde_json::json!({ "type": "heading", "attrs": { "level": level }, "content": [text(value)] })
}

fn doc(content: Vec<Value>) -> Value {
    serde_json::json!({ "type": "doc", "content": content })
}

fn field(
    id: &str,
    label: &str,
    field_type: &str,
    required: bool,
    default_value: Option<Value>,
) -> TemplateField {
    TemplateField {
        id: id.to_string(),
        label: label.to_string(),
        field_type: field_type.to_string(),
        required,
        default_value,
        options: None,
    }
}

#[derive(Clone, Copy)]
struct BuiltinTemplateText {
    name: &'static str,
    description: &'static str,
    topic: &'static str,
    date: &'static str,
    attendees: &'static str,
    source: &'static str,
    meeting_agenda: &'static str,
    meeting_notes: &'static str,
    action_items: &'static str,
    daily_focus: &'static str,
    daily_tasks: &'static str,
    daily_notes: &'static str,
    research_question: &'static str,
    research_findings: &'static str,
    research_follow_ups: &'static str,
    date_prefix: &'static str,
    attendees_prefix: &'static str,
    source_prefix: &'static str,
}

fn normalize_locale(locale: Option<&str>) -> &'static str {
    match locale
        .unwrap_or("en")
        .split(['-', '_'])
        .next()
        .unwrap_or("en")
    {
        "ru" => "ru",
        _ => "en",
    }
}

fn builtin_text(locale: Option<&str>, template_id: &str) -> BuiltinTemplateText {
    let locale = normalize_locale(locale);
    match (locale, template_id) {
        ("ru", "blank") => BuiltinTemplateText {
            name: "Пустая заметка",
            description: "Пустая заметка без заготовок.",
            ..builtin_text(Some("ru"), "shared")
        },
        ("ru", "meeting") => BuiltinTemplateText {
            name: "Встреча",
            description: "Повестка, участники, заметки и задачи.",
            ..builtin_text(Some("ru"), "shared")
        },
        ("ru", "daily") => BuiltinTemplateText {
            name: "Дневная заметка",
            description: "Ежедневная страница с фокусом, задачами и заметками.",
            ..builtin_text(Some("ru"), "shared")
        },
        ("ru", "research") => BuiltinTemplateText {
            name: "Исследование",
            description: "Вопрос исследования, источник, выводы и следующие шаги.",
            ..builtin_text(Some("ru"), "shared")
        },
        ("ru", _) => BuiltinTemplateText {
            name: "",
            description: "",
            topic: "Тема",
            date: "Дата",
            attendees: "Участники",
            source: "Источник",
            meeting_agenda: "Повестка",
            meeting_notes: "Заметки",
            action_items: "Задачи",
            daily_focus: "Фокус",
            daily_tasks: "Задачи",
            daily_notes: "Заметки",
            research_question: "Вопрос",
            research_findings: "Выводы",
            research_follow_ups: "Следующие шаги",
            date_prefix: "Дата",
            attendees_prefix: "Участники",
            source_prefix: "Источник",
        },
        (_, "blank") => BuiltinTemplateText {
            name: "Blank note",
            description: "An empty note.",
            ..builtin_text(Some("en"), "shared")
        },
        (_, "meeting") => BuiltinTemplateText {
            name: "Meeting",
            description: "Agenda, attendees, notes, and action items.",
            ..builtin_text(Some("en"), "shared")
        },
        (_, "daily") => BuiltinTemplateText {
            name: "Daily note",
            description: "A daily page with priorities and notes.",
            ..builtin_text(Some("en"), "shared")
        },
        (_, "research") => BuiltinTemplateText {
            name: "Research note",
            description: "Research question, source, findings, and follow-ups.",
            ..builtin_text(Some("en"), "shared")
        },
        _ => BuiltinTemplateText {
            name: "",
            description: "",
            topic: "Topic",
            date: "Date",
            attendees: "Attendees",
            source: "Source",
            meeting_agenda: "Agenda",
            meeting_notes: "Notes",
            action_items: "Action items",
            daily_focus: "Focus",
            daily_tasks: "Tasks",
            daily_notes: "Notes",
            research_question: "Question",
            research_findings: "Findings",
            research_follow_ups: "Follow-ups",
            date_prefix: "Date",
            attendees_prefix: "Attendees",
            source_prefix: "Source",
        },
    }
}

fn builtin_templates(locale: Option<&str>) -> Vec<TemplateDocument> {
    let now = "built-in".to_string();
    let blank = builtin_text(locale, "blank");
    let meeting = builtin_text(locale, "meeting");
    let daily = builtin_text(locale, "daily");
    let research = builtin_text(locale, "research");
    vec![
        TemplateDocument {
            id: "blank".to_string(),
            name: blank.name.to_string(),
            icon: "📄".to_string(),
            description: blank.description.to_string(),
            content: doc(vec![paragraph("")]),
            fields: vec![],
            created_at: now.clone(),
            updated_at: now.clone(),
            built_in: true,
        },
        TemplateDocument {
            id: "meeting".to_string(),
            name: meeting.name.to_string(),
            icon: "🗓️".to_string(),
            description: meeting.description.to_string(),
            content: doc(vec![
                heading(1, "{{field.topic}}"),
                paragraph(&format!("{}: {{{{field.date}}}}", meeting.date_prefix)),
                paragraph(&format!(
                    "{}: {{{{field.attendees}}}}",
                    meeting.attendees_prefix
                )),
                heading(2, meeting.meeting_agenda),
                paragraph("{{cursor}}"),
                heading(2, meeting.meeting_notes),
                paragraph(""),
                heading(2, meeting.action_items),
                serde_json::json!({ "type": "checklist_item", "attrs": { "checked": false } }),
            ]),
            fields: vec![
                field("topic", meeting.topic, "text", true, None),
                field(
                    "date",
                    meeting.date,
                    "date",
                    true,
                    Some(Value::String("{{date}}".to_string())),
                ),
                field("attendees", meeting.attendees, "text", false, None),
            ],
            created_at: now.clone(),
            updated_at: now.clone(),
            built_in: true,
        },
        TemplateDocument {
            id: "daily".to_string(),
            name: daily.name.to_string(),
            icon: "☀️".to_string(),
            description: daily.description.to_string(),
            content: doc(vec![
                heading(1, "{{field.date}}"),
                heading(2, daily.daily_focus),
                paragraph("{{cursor}}"),
                heading(2, daily.daily_tasks),
                serde_json::json!({ "type": "checklist_item", "attrs": { "checked": false } }),
                heading(2, daily.daily_notes),
                paragraph(""),
            ]),
            fields: vec![field(
                "date",
                daily.date,
                "date",
                true,
                Some(Value::String("{{date}}".to_string())),
            )],
            created_at: now.clone(),
            updated_at: now.clone(),
            built_in: true,
        },
        TemplateDocument {
            id: "research".to_string(),
            name: research.name.to_string(),
            icon: "🔎".to_string(),
            description: research.description.to_string(),
            content: doc(vec![
                heading(1, "{{field.topic}}"),
                paragraph(&format!("{}: {{{{field.source}}}}", research.source_prefix)),
                heading(2, research.research_question),
                paragraph("{{cursor}}"),
                heading(2, research.research_findings),
                paragraph(""),
                heading(2, research.research_follow_ups),
                paragraph(""),
            ]),
            fields: vec![
                field("topic", research.topic, "text", true, None),
                field("source", research.source, "text", false, None),
            ],
            created_at: now.clone(),
            updated_at: now,
            built_in: true,
        },
    ]
}

fn templates_dir(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo").join("templates")
}

fn template_path(workspace_path: &str, template_id: &str) -> PathBuf {
    templates_dir(workspace_path).join(format!("{}.json", template_id))
}

fn normalize_workspace(workspace_path: &str) -> Result<String, String> {
    Ok(normalize_workspace_path(workspace_path)?
        .to_string_lossy()
        .into_owned())
}

fn is_valid_template_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 96
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

fn validate_user_template(template: &TemplateDocument) -> Result<(), String> {
    if !is_valid_template_id(&template.id) {
        return Err("Invalid template id".to_string());
    }
    if template.name.trim().is_empty() {
        return Err("Template name is required".to_string());
    }
    if template
        .content
        .get("type")
        .and_then(|value| value.as_str())
        != Some("doc")
    {
        return Err("Template content must be a doc node".to_string());
    }
    Ok(())
}

fn read_user_templates(workspace_path: &str) -> Result<Vec<TemplateDocument>, String> {
    let dir = templates_dir(workspace_path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut templates = vec![];
    for entry in std::fs::read_dir(&dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry.path().extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let content = std::fs::read_to_string(entry.path()).map_err(|error| error.to_string())?;
        let mut template: TemplateDocument =
            serde_json::from_str(&content).map_err(|error| error.to_string())?;
        template.built_in = false;
        templates.push(template);
    }
    templates.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(templates)
}

fn get_template_document(
    workspace_path: &str,
    template_id: &str,
    locale: Option<&str>,
) -> Result<TemplateDocument, String> {
    if let Some(template) = builtin_templates(locale)
        .into_iter()
        .find(|template| template.id == template_id)
    {
        return Ok(template);
    }
    if !is_valid_template_id(template_id) {
        return Err("Invalid template id".to_string());
    }
    let path = template_path(workspace_path, template_id);
    let content = std::fs::read_to_string(path).map_err(|_| "Template not found".to_string())?;
    let mut template: TemplateDocument =
        serde_json::from_str(&content).map_err(|error| error.to_string())?;
    template.built_in = false;
    Ok(template)
}

fn write_template(workspace_path: &str, template: &TemplateDocument) -> Result<(), String> {
    std::fs::create_dir_all(templates_dir(workspace_path)).map_err(|error| error.to_string())?;
    let path = template_path(workspace_path, &template.id);
    let tmp = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(template).map_err(|error| error.to_string())?;
    std::fs::write(&tmp, content).map_err(|error| error.to_string())?;
    std::fs::rename(tmp, path).map_err(|error| error.to_string())
}

fn replace_placeholders(
    text: &str,
    field_values: &Map<String, Value>,
    title: &str,
    workspace_name: &str,
) -> (String, bool) {
    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let time = now.format("%H:%M").to_string();
    let datetime = format!("{} {}", date, time);
    let mut output = String::new();
    let mut rest = text;
    let mut cursor = false;

    while let Some(start) = rest.find("{{") {
        output.push_str(&rest[..start]);
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find("}}") else {
            output.push_str(&rest[start..]);
            return (output, cursor);
        };
        let token = after_start[..end].trim();
        let value = match token {
            "cursor" => {
                cursor = true;
                ""
            }
            "date" => &date,
            "time" => &time,
            "datetime" => &datetime,
            "note.title" => title,
            "workspace.name" => workspace_name,
            _ => {
                if let Some(field_id) = token.strip_prefix("field.") {
                    match field_values.get(field_id) {
                        Some(Value::String(value)) => value,
                        Some(Value::Bool(true)) => "true",
                        _ => "",
                    }
                } else {
                    ""
                }
            }
        };
        output.push_str(value);
        rest = &after_start[end + 2..];
    }

    output.push_str(rest);
    (output, cursor)
}

fn resolve_node(
    node: &mut Value,
    field_values: &Map<String, Value>,
    title: &str,
    workspace_name: &str,
    cursor: &mut bool,
) {
    match node {
        Value::Object(map) => {
            if map.get("type").and_then(|value| value.as_str()) == Some("text") {
                if let Some(value) = map.get("text").and_then(|value| value.as_str()) {
                    let (resolved, found_cursor) =
                        replace_placeholders(value, field_values, title, workspace_name);
                    if found_cursor {
                        *cursor = true;
                    }
                    map.insert("text".to_string(), Value::String(resolved));
                }
            }
            if let Some(Value::Array(children)) = map.get_mut("content") {
                for child in children {
                    resolve_node(child, field_values, title, workspace_name, cursor);
                }
            }
        }
        Value::Array(children) => {
            for child in children {
                resolve_node(child, field_values, title, workspace_name, cursor);
            }
        }
        _ => {}
    }
}

fn prune_empty_text_nodes(node: &mut Value) {
    match node {
        Value::Object(map) => {
            if let Some(Value::Array(children)) = map.get_mut("content") {
                for child in children.iter_mut() {
                    prune_empty_text_nodes(child);
                }
                children.retain(|child| {
                    child
                        .as_object()
                        .and_then(|map| {
                            let node_type = map.get("type").and_then(|value| value.as_str());
                            let text = map.get("text").and_then(|value| value.as_str());
                            Some(node_type != Some("text") || text != Some(""))
                        })
                        .unwrap_or(true)
                });
                if children.is_empty() {
                    map.remove("content");
                }
            }
        }
        Value::Array(children) => {
            for child in children {
                prune_empty_text_nodes(child);
            }
        }
        _ => {}
    }
}

fn resolve_default_value(
    value: Option<&Value>,
    field_values: &Map<String, Value>,
    title: &str,
    workspace_name: &str,
) -> Value {
    match value {
        Some(Value::String(text)) => {
            Value::String(replace_placeholders(text, field_values, title, workspace_name).0)
        }
        Some(value) => value.clone(),
        None => Value::Null,
    }
}

fn normalize_field_values(
    template: &TemplateDocument,
    input: Map<String, Value>,
    title: &str,
    workspace_name: &str,
) -> Result<Map<String, Value>, String> {
    let mut values = Map::new();

    for field in &template.fields {
        let raw = input.get(&field.id).cloned().unwrap_or_else(|| {
            resolve_default_value(field.default_value.as_ref(), &values, title, workspace_name)
        });

        let normalized = if field.field_type == "checkbox" {
            Value::Bool(raw.as_bool().unwrap_or(false))
        } else {
            Value::String(
                replace_placeholders(
                    raw.as_str().unwrap_or("").trim(),
                    &values,
                    title,
                    workspace_name,
                )
                .0,
            )
        };

        if field.required {
            let missing = match &normalized {
                Value::Bool(value) => !value,
                Value::String(value) => value.trim().is_empty(),
                _ => true,
            };
            if missing {
                return Err(format!("Required field '{}' is missing", field.id));
            }
        }

        values.insert(field.id.clone(), normalized);
    }

    Ok(values)
}

fn insert_note_in_folder(tree: &mut Vec<FolderMeta>, folder_id: &str, note: NoteMeta) -> bool {
    for node in tree.iter_mut() {
        if node.id == folder_id {
            node.notes.push(note);
            return true;
        }
        if insert_note_in_folder(&mut node.children, folder_id, note.clone()) {
            return true;
        }
    }
    false
}

#[tauri::command]
pub fn template_list(
    workspace_path: String,
    locale: Option<String>,
) -> Result<Vec<TemplateDocument>, String> {
    let workspace_path = normalize_workspace(&workspace_path)?;
    let mut templates = builtin_templates(locale.as_deref());
    templates.extend(read_user_templates(&workspace_path)?);
    Ok(templates)
}

#[tauri::command]
pub fn template_get(
    workspace_path: String,
    template_id: String,
    locale: Option<String>,
) -> Result<TemplateDocument, String> {
    let workspace_path = normalize_workspace(&workspace_path)?;
    get_template_document(&workspace_path, &template_id, locale.as_deref())
}

#[tauri::command]
pub fn template_create(
    workspace_path: String,
    mut template: TemplateDocument,
) -> Result<TemplateDocument, String> {
    let workspace_path = normalize_workspace(&workspace_path)?;
    if template.id.trim().is_empty() {
        template.id = Uuid::new_v4().to_string();
    }
    if builtin_templates(None)
        .iter()
        .any(|builtin| builtin.id == template.id)
    {
        return Err("Built-in template ids are reserved".to_string());
    }
    let now = Utc::now().to_rfc3339();
    template.created_at = now.clone();
    template.updated_at = now;
    template.built_in = false;
    validate_user_template(&template)?;
    write_template(&workspace_path, &template)?;
    Ok(template)
}

#[tauri::command]
pub fn template_update(
    workspace_path: String,
    template_id: String,
    mut template: TemplateDocument,
) -> Result<TemplateDocument, String> {
    let workspace_path = normalize_workspace(&workspace_path)?;
    if builtin_templates(None)
        .iter()
        .any(|builtin| builtin.id == template_id)
    {
        return Err("Built-in templates cannot be edited".to_string());
    }
    if !template_path(&workspace_path, &template_id).exists() {
        return Err("Template not found".to_string());
    }
    template.id = template_id;
    template.updated_at = Utc::now().to_rfc3339();
    template.built_in = false;
    validate_user_template(&template)?;
    write_template(&workspace_path, &template)?;
    Ok(template)
}

#[tauri::command]
pub fn template_delete(workspace_path: String, template_id: String) -> Result<(), String> {
    let workspace_path = normalize_workspace(&workspace_path)?;
    if builtin_templates(None)
        .iter()
        .any(|builtin| builtin.id == template_id)
    {
        return Err("Built-in templates cannot be deleted".to_string());
    }
    if !is_valid_template_id(&template_id) {
        return Err("Invalid template id".to_string());
    }
    std::fs::remove_file(template_path(&workspace_path, &template_id))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn template_create_note(
    workspace_path: String,
    template_id: String,
    folder_id: Option<String>,
    title: String,
    icon: String,
    field_values: Map<String, Value>,
    locale: Option<String>,
) -> Result<NoteDocument, String> {
    let workspace_path = normalize_workspace(&workspace_path)?;
    let mut manifest = load_manifest(&workspace_path)?;
    let template = get_template_document(&workspace_path, &template_id, locale.as_deref())?;
    let values = normalize_field_values(&template, field_values, &title, &manifest.name)?;
    let now = Utc::now().to_rfc3339();
    let note = NoteDocument {
        id: Uuid::new_v4().to_string(),
        title: title.clone(),
        icon,
        cover: None,
        folder_id: folder_id.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
        content: {
            let mut content = template.content.clone();
            let mut cursor = false;
            resolve_node(&mut content, &values, &title, &manifest.name, &mut cursor);
            prune_empty_text_nodes(&mut content);
            content
        },
    };

    std::fs::create_dir_all(Path::new(&workspace_path).join("notes"))
        .map_err(|error| error.to_string())?;
    let note_path = Path::new(&workspace_path)
        .join("notes")
        .join(format!("note-{}.nevo", note.id));
    let tmp_path = note_path.with_extension("nevo.tmp");
    let serialized = serde_json::to_string_pretty(&note).map_err(|error| error.to_string())?;
    std::fs::write(&tmp_path, serialized).map_err(|error| error.to_string())?;
    std::fs::rename(tmp_path, note_path).map_err(|error| error.to_string())?;

    let meta = NoteMeta {
        id: note.id.clone(),
        title: note.title.clone(),
        icon: note.icon.clone(),
        folder_id: folder_id.clone(),
        updated_at: now,
    };

    if let Some(folder_id) = &folder_id {
        if !insert_note_in_folder(&mut manifest.tree, folder_id, meta) {
            return Err("Target folder not found".to_string());
        }
    } else {
        manifest.root_order.push(note.id.clone());
        manifest.root_notes.push(meta);
    }
    save_manifest(&workspace_path, &manifest)?;

    Ok(note)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::workspace::create_workspace;
    use serde_json::json;

    struct TestWorkspace {
        path: std::path::PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("nevo-template-{}", Uuid::new_v4()));
            create_workspace(
                path.to_string_lossy().into_owned(),
                "Templates".to_string(),
                "T".to_string(),
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

    fn has_empty_text_node(node: &Value) -> bool {
        match node {
            Value::Object(map) => {
                if map.get("type").and_then(|value| value.as_str()) == Some("text")
                    && map.get("text").and_then(|value| value.as_str()) == Some("")
                {
                    return true;
                }
                map.get("content")
                    .and_then(|value| value.as_array())
                    .map(|children| children.iter().any(has_empty_text_node))
                    .unwrap_or(false)
            }
            Value::Array(children) => children.iter().any(has_empty_text_node),
            _ => false,
        }
    }

    fn flatten_text(node: &Value) -> String {
        match node {
            Value::Object(map) => {
                if map.get("type").and_then(|value| value.as_str()) == Some("text") {
                    return map
                        .get("text")
                        .and_then(|value| value.as_str())
                        .unwrap_or("")
                        .to_string();
                }
                map.get("content")
                    .and_then(|value| value.as_array())
                    .map(|children| {
                        children
                            .iter()
                            .map(flatten_text)
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .unwrap_or_default()
            }
            Value::Array(children) => children
                .iter()
                .map(flatten_text)
                .collect::<Vec<_>>()
                .join("\n"),
            _ => String::new(),
        }
    }

    fn create_from_builtin(
        workspace_path: &str,
        template_id: &str,
        fields: Map<String, Value>,
    ) -> NoteDocument {
        template_create_note(
            workspace_path.to_string(),
            template_id.to_string(),
            None,
            format!("{} note", template_id),
            "📄".to_string(),
            fields,
            Some("en".to_string()),
        )
        .expect("create note from template")
    }

    #[test]
    fn built_in_templates_localize_metadata_and_content() {
        let workspace = TestWorkspace::new();
        let templates =
            template_list(workspace.path_string(), Some("ru".to_string())).expect("list templates");
        let meeting = templates
            .iter()
            .find(|template| template.id == "meeting")
            .expect("meeting template");

        assert_eq!(meeting.name, "Встреча");
        assert_eq!(meeting.fields[0].label, "Тема");
        assert!(flatten_text(&meeting.content).contains("Повестка"));
    }

    #[test]
    fn creating_from_built_ins_writes_non_empty_content_without_empty_text_nodes() {
        let workspace = TestWorkspace::new();
        let workspace_path = workspace.path_string();
        let cases = [
            ("meeting", json!({ "topic": "Roadmap", "attendees": "" })),
            ("daily", json!({})),
            ("research", json!({ "topic": "Latency", "source": "" })),
        ];

        for (template_id, fields) in cases {
            let note = create_from_builtin(
                &workspace_path,
                template_id,
                fields.as_object().cloned().unwrap_or_default(),
            );
            let text = flatten_text(&note.content);
            assert!(
                !text.trim().is_empty(),
                "{template_id} content should not be empty"
            );
            assert!(
                !has_empty_text_node(&note.content),
                "{template_id} content should not contain empty text nodes"
            );

            let note_path = Path::new(&workspace_path)
                .join("notes")
                .join(format!("note-{}.nevo", note.id));
            let saved = std::fs::read_to_string(note_path).expect("read saved note");
            let saved_note: NoteDocument = serde_json::from_str(&saved).expect("parse saved note");
            assert_eq!(saved_note.id, note.id);
            assert!(!has_empty_text_node(&saved_note.content));
        }
    }

    #[test]
    fn required_fields_still_block_template_note_creation() {
        let workspace = TestWorkspace::new();
        let error = template_create_note(
            workspace.path_string(),
            "meeting".to_string(),
            None,
            "Missing topic".to_string(),
            "📄".to_string(),
            Map::new(),
            Some("en".to_string()),
        )
        .expect_err("missing required field should fail");

        assert_eq!(error, "Required field 'topic' is missing");
    }
}
