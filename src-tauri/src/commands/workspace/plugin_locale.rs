use super::paths::plugins_dir_path;
use super::plugin_readme::decode_text;
use super::plugins::{validate_plugin_id, validate_plugin_locale};
use crate::commands::path_utils::normalize_workspace_path;
use serde::Serialize;
use std::collections::BTreeMap;

pub(crate) const MAX_PLUGIN_CATALOG_BYTES: usize = 128 * 1024;
pub(crate) const MAX_PLUGIN_CATALOG_KEYS: usize = 2000;
pub(crate) const MAX_PLUGIN_MESSAGE_BYTES: usize = 4 * 1024;
const MAX_PLUGIN_MESSAGE_KEY_BYTES: usize = 128;

/// A plugin catalog resolved for one app locale, merged across the fallback chain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMessages {
    pub locale: String,
    pub messages: BTreeMap<String, String>,
}

/// `locale`, its base language when it has a region, then `default_locale`; duplicates dropped.
pub(crate) fn locale_chain(locale: &str, default_locale: &str) -> Result<Vec<String>, String> {
    validate_plugin_locale(locale)?;
    validate_plugin_locale(default_locale)?;
    let mut chain = vec![locale.to_string()];
    if let Some((base, _)) = locale.split_once('-') {
        chain.push(base.to_string());
    }
    chain.push(default_locale.to_string());
    let mut seen = std::collections::BTreeSet::new();
    chain.retain(|entry| seen.insert(entry.clone()));
    Ok(chain)
}

fn valid_message_key(key: &str) -> bool {
    (1..=MAX_PLUGIN_MESSAGE_KEY_BYTES).contains(&key.len())
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
}

pub(crate) fn parse_catalog(bytes: Vec<u8>) -> Result<BTreeMap<String, String>, String> {
    let text = decode_text(bytes, MAX_PLUGIN_CATALOG_BYTES, "Catalog")?;
    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("Catalog is not valid JSON: {error}"))?;
    let serde_json::Value::Object(object) = value else {
        return Err("Catalog must be a JSON object".to_string());
    };
    if object.len() > MAX_PLUGIN_CATALOG_KEYS {
        return Err("Catalog has too many keys".to_string());
    }
    let mut messages = BTreeMap::new();
    for (key, value) in object {
        if !valid_message_key(&key) {
            return Err(format!("Catalog key is invalid: {key}"));
        }
        let serde_json::Value::String(message) = value else {
            return Err(format!("Catalog value must be a string: {key}"));
        };
        if message.len() > MAX_PLUGIN_MESSAGE_BYTES {
            return Err(format!("Catalog message exceeds the size limit: {key}"));
        }
        messages.insert(key, message);
    }
    Ok(messages)
}

/// Input is in chain order (most specific first); more specific entries win.
pub(crate) fn merge_chain(
    catalogs: Vec<(String, BTreeMap<String, String>)>,
) -> Option<PluginMessages> {
    let locale = catalogs.first()?.0.clone();
    let mut messages = BTreeMap::new();
    for (_, catalog) in catalogs.into_iter().rev() {
        messages.extend(catalog);
    }
    Some(PluginMessages { locale, messages })
}

#[tauri::command]
pub async fn plugin_messages_read(
    workspace_path: String,
    plugin_id: String,
    locale: String,
    default_locale: String,
) -> Result<Option<PluginMessages>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        plugin_messages_read_sync(workspace_path, plugin_id, locale, default_locale)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub fn plugin_messages_read_sync(
    workspace_path: String,
    plugin_id: String,
    locale: String,
    default_locale: String,
) -> Result<Option<PluginMessages>, String> {
    validate_plugin_id(&plugin_id)?;
    let chain = locale_chain(&locale, &default_locale)?;
    let workspace = normalize_workspace_path(&workspace_path)?;
    let locales_dir = plugins_dir_path(&workspace.to_string_lossy())
        .join(&plugin_id)
        .join("locales");
    let mut catalogs = Vec::new();
    for loc in chain {
        let path = locales_dir.join(format!("{loc}.json"));
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        if !metadata.is_file() {
            continue;
        }
        if metadata.len() > MAX_PLUGIN_CATALOG_BYTES as u64 {
            return Err(format!("Catalog {loc}.json exceeds the size limit"));
        }
        let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
        let catalog = parse_catalog(bytes).map_err(|error| format!("{loc}.json: {error}"))?;
        catalogs.push((loc, catalog));
    }
    Ok(merge_chain(catalogs))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "nevo-plugin-locale-{}-{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&path).expect("create temp workspace");
        path
    }

    fn locales_dir(workspace: &PathBuf, id: &str) -> PathBuf {
        let dir = plugins_dir_path(&workspace.to_string_lossy())
            .join(id)
            .join("locales");
        std::fs::create_dir_all(&dir).expect("create locales dir");
        dir
    }

    fn read(workspace: &PathBuf, locale: &str) -> Result<Option<PluginMessages>, String> {
        plugin_messages_read_sync(
            workspace.to_string_lossy().into_owned(),
            "p".to_string(),
            locale.to_string(),
            "en".to_string(),
        )
    }

    fn catalog(entries: &[(&str, &str)]) -> BTreeMap<String, String> {
        entries
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn chain_orders_and_dedupes() {
        assert_eq!(locale_chain("ru", "en").unwrap(), ["ru", "en"]);
        assert_eq!(locale_chain("pt-BR", "en").unwrap(), ["pt-BR", "pt", "en"]);
        assert_eq!(locale_chain("en", "en").unwrap(), ["en"]);
        assert_eq!(locale_chain("pt-BR", "pt").unwrap(), ["pt-BR", "pt"]);
        assert!(locale_chain("RU", "en").is_err());
        assert!(locale_chain("ru", "../x").is_err());
    }

    #[test]
    fn parse_accepts_valid_and_strips_bom() {
        let parsed = parse_catalog("\u{feff}{\"a.b-c_1\": \"x\"}".as_bytes().to_vec()).unwrap();
        assert_eq!(parsed, catalog(&[("a.b-c_1", "x")]));
    }

    #[test]
    fn parse_rejects_invalid_catalogs() {
        let long = format!(r#"{{"a": "{}"}}"#, "x".repeat(MAX_PLUGIN_MESSAGE_BYTES + 1));
        let bad: Vec<Vec<u8>> = vec![
            b"[]".to_vec(),
            b"not json".to_vec(),
            br#"{"a": 1}"#.to_vec(),
            br#"{"bad key": "x"}"#.to_vec(),
            br#"{"": "x"}"#.to_vec(),
            long.into_bytes(),
            vec![b' '; MAX_PLUGIN_CATALOG_BYTES + 1],
            vec![0xff, 0xfe],
        ];
        for bytes in bad {
            assert!(parse_catalog(bytes.clone()).is_err());
        }
        let many = (0..=MAX_PLUGIN_CATALOG_KEYS)
            .map(|i| format!("\"k{i}\":\"\""))
            .collect::<Vec<_>>()
            .join(",");
        assert!(parse_catalog(format!("{{{many}}}").into_bytes()).is_err());
    }

    #[test]
    fn merge_prefers_specific_and_reports_first_locale() {
        let merged = merge_chain(vec![
            ("pt-BR".into(), catalog(&[("a", "br")])),
            ("pt".into(), catalog(&[("a", "pt"), ("b", "pt")])),
            (
                "en".into(),
                catalog(&[("a", "en"), ("b", "en"), ("c", "en")]),
            ),
        ])
        .unwrap();
        assert_eq!(merged.locale, "pt-BR");
        assert_eq!(
            merged.messages,
            catalog(&[("a", "br"), ("b", "pt"), ("c", "en")])
        );
        assert!(merge_chain(vec![]).is_none());
    }

    #[test]
    fn read_merges_locale_over_default() {
        let ws = temp_workspace("merge");
        let dir = locales_dir(&ws, "p");
        std::fs::write(dir.join("en.json"), r#"{"a":"A","b":"B"}"#).unwrap();
        std::fs::write(dir.join("ru.json"), r#"{"a":"Я"}"#).unwrap();
        let result = read(&ws, "ru").unwrap().unwrap();
        assert_eq!(result.locale, "ru");
        assert_eq!(result.messages, catalog(&[("a", "Я"), ("b", "B")]));
    }

    #[test]
    fn read_falls_back_to_default_only() {
        let ws = temp_workspace("default");
        std::fs::write(locales_dir(&ws, "p").join("en.json"), r#"{"a":"A"}"#).unwrap();
        let result = read(&ws, "ru").unwrap().unwrap();
        assert_eq!(result.locale, "en");
        assert_eq!(result.messages, catalog(&[("a", "A")]));
    }

    #[test]
    fn read_without_catalogs_is_none() {
        let ws = temp_workspace("none");
        assert_eq!(read(&ws, "ru"), Ok(None));
        locales_dir(&ws, "p");
        assert_eq!(read(&ws, "ru"), Ok(None));
    }

    #[test]
    fn read_ignores_directories() {
        let ws = temp_workspace("dir");
        std::fs::create_dir_all(locales_dir(&ws, "p").join("ru.json")).unwrap();
        assert_eq!(read(&ws, "ru"), Ok(None));
    }

    #[cfg(unix)]
    #[test]
    fn read_ignores_symlinks() {
        let ws = temp_workspace("symlink");
        let dir = locales_dir(&ws, "p");
        let target = ws.join("outside.json");
        std::fs::write(&target, r#"{"a":"x"}"#).unwrap();
        std::os::unix::fs::symlink(&target, dir.join("ru.json")).unwrap();
        assert_eq!(read(&ws, "ru"), Ok(None));
    }

    #[test]
    fn read_rejects_invalid_catalog() {
        let ws = temp_workspace("invalid");
        let dir = locales_dir(&ws, "p");
        std::fs::write(dir.join("en.json"), r#"{"a":"A"}"#).unwrap();
        std::fs::write(dir.join("ru.json"), r#"{"a":1}"#).unwrap();
        assert!(read(&ws, "ru").is_err());
    }

    #[test]
    fn read_rejects_invalid_arguments() {
        let ws = temp_workspace("args");
        assert!(read(&ws, "../x").is_err());
        assert!(plugin_messages_read_sync(
            ws.to_string_lossy().into_owned(),
            "../x".to_string(),
            "ru".to_string(),
            "en".to_string()
        )
        .is_err());
    }
}
