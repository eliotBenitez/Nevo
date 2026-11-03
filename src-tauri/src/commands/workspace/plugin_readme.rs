use super::paths::plugins_dir_path;
use super::plugin_locale::locale_chain;
use super::plugins::validate_plugin_id;
use crate::commands::path_utils::normalize_workspace_path;

pub(crate) const MAX_PLUGIN_README_BYTES: usize = 256 * 1024;

/// Enforces the size limit, decodes strict UTF-8 and strips a leading BOM.
pub(crate) fn decode_text(bytes: Vec<u8>, limit: usize, what: &str) -> Result<String, String> {
    if bytes.len() > limit {
        return Err(format!("{what} exceeds the size limit"));
    }
    let text = String::from_utf8(bytes).map_err(|_| format!("{what} is not valid UTF-8"))?;
    Ok(match text.strip_prefix('\u{feff}') {
        Some(stripped) => stripped.to_string(),
        None => text,
    })
}

pub(crate) fn decode_readme(bytes: Vec<u8>) -> Result<String, String> {
    decode_text(bytes, MAX_PLUGIN_README_BYTES, "README")
}

#[tauri::command]
pub async fn plugin_readme_read(
    workspace_path: String,
    plugin_id: String,
    locale: String,
    default_locale: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        plugin_readme_read_sync(workspace_path, plugin_id, locale, default_locale)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub fn plugin_readme_read_sync(
    workspace_path: String,
    plugin_id: String,
    locale: String,
    default_locale: String,
) -> Result<Option<String>, String> {
    validate_plugin_id(&plugin_id)?;
    let chain = locale_chain(&locale, &default_locale)?;
    let workspace = normalize_workspace_path(&workspace_path)?;
    let plugin_dir = plugins_dir_path(&workspace.to_string_lossy()).join(&plugin_id);
    let entries = match std::fs::read_dir(&plugin_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        let metadata =
            std::fs::symlink_metadata(entry.path()).map_err(|error| error.to_string())?;
        if metadata.is_file() {
            files.push((name, entry.path(), metadata.len()));
        }
    }
    let candidates = chain
        .iter()
        .map(|loc| format!("readme.{}.md", loc.to_ascii_lowercase()))
        .chain(std::iter::once("readme.md".to_string()));
    for candidate in candidates {
        let Some((_, path, len)) = files.iter().find(|(name, _, _)| *name == candidate) else {
            continue;
        };
        if *len > MAX_PLUGIN_README_BYTES as u64 {
            return Err("README exceeds the size limit".to_string());
        }
        let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
        return decode_readme(bytes).map(Some);
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_workspace(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "nevo-plugin-readme-{}-{}",
            name,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&path).expect("create temp workspace");
        path
    }

    fn plugin_dir(workspace: &PathBuf, id: &str) -> PathBuf {
        let dir = plugins_dir_path(&workspace.to_string_lossy()).join(id);
        std::fs::create_dir_all(&dir).expect("create plugin dir");
        dir
    }

    fn read_locale(
        workspace: &PathBuf,
        id: &str,
        locale: &str,
        default_locale: &str,
    ) -> Result<Option<String>, String> {
        plugin_readme_read_sync(
            workspace.to_string_lossy().into_owned(),
            id.to_string(),
            locale.to_string(),
            default_locale.to_string(),
        )
    }

    fn read(workspace: &PathBuf, id: &str) -> Result<Option<String>, String> {
        read_locale(workspace, id, "en", "en")
    }

    #[test]
    fn missing_plugin_returns_none() {
        let ws = temp_workspace("missing");
        assert_eq!(read(&ws, "nope"), Ok(None));
    }

    #[test]
    fn finds_lowercase_readme() {
        let ws = temp_workspace("lower");
        std::fs::write(plugin_dir(&ws, "p").join("readme.md"), "hello").unwrap();
        assert_eq!(read(&ws, "p"), Ok(Some("hello".to_string())));
    }

    #[test]
    fn no_readme_returns_none() {
        let ws = temp_workspace("none");
        std::fs::write(plugin_dir(&ws, "p").join("manifest.json"), "{}").unwrap();
        assert_eq!(read(&ws, "p"), Ok(None));
    }

    #[test]
    fn ignores_directory_named_readme() {
        let ws = temp_workspace("dir");
        std::fs::create_dir_all(plugin_dir(&ws, "p").join("README.md")).unwrap();
        assert_eq!(read(&ws, "p"), Ok(None));
    }

    #[test]
    fn rejects_oversize_readme() {
        let ws = temp_workspace("big");
        std::fs::write(
            plugin_dir(&ws, "p").join("README.md"),
            vec![b'a'; MAX_PLUGIN_README_BYTES + 1],
        )
        .unwrap();
        assert!(read(&ws, "p").is_err());
    }

    #[test]
    fn rejects_invalid_utf8() {
        let ws = temp_workspace("utf8");
        std::fs::write(plugin_dir(&ws, "p").join("README.md"), [0xff, 0xfe, 0xfd]).unwrap();
        assert!(read(&ws, "p").is_err());
    }

    #[test]
    fn strips_bom() {
        let ws = temp_workspace("bom");
        std::fs::write(plugin_dir(&ws, "p").join("README.md"), "\u{feff}# Hi").unwrap();
        assert_eq!(read(&ws, "p"), Ok(Some("# Hi".to_string())));
    }

    #[test]
    fn rejects_invalid_plugin_id() {
        let ws = temp_workspace("id");
        assert!(read(&ws, "../x").is_err());
    }

    #[test]
    fn decode_enforces_limit() {
        assert!(decode_readme(vec![b'a'; MAX_PLUGIN_README_BYTES]).is_ok());
        assert!(decode_readme(vec![b'a'; MAX_PLUGIN_README_BYTES + 1]).is_err());
    }

    #[test]
    fn picks_readme_for_locale() {
        let ws = temp_workspace("loc-ru");
        let dir = plugin_dir(&ws, "p");
        std::fs::write(dir.join("README.md"), "default").unwrap();
        std::fs::write(dir.join("README.ru.md"), "russian").unwrap();
        assert_eq!(
            read_locale(&ws, "p", "ru", "en"),
            Ok(Some("russian".into()))
        );
        assert_eq!(
            read_locale(&ws, "p", "de", "en"),
            Ok(Some("default".into()))
        );
    }

    #[test]
    fn locale_part_is_case_insensitive() {
        let ws = temp_workspace("loc-case");
        std::fs::write(plugin_dir(&ws, "p").join("readme.RU.MD"), "russian").unwrap();
        assert_eq!(
            read_locale(&ws, "p", "ru", "en"),
            Ok(Some("russian".into()))
        );
    }

    #[test]
    fn region_falls_back_to_base_language() {
        let ws = temp_workspace("loc-base");
        let dir = plugin_dir(&ws, "p");
        std::fs::write(dir.join("README.md"), "default").unwrap();
        std::fs::write(dir.join("README.pt.md"), "portuguese").unwrap();
        assert_eq!(
            read_locale(&ws, "p", "pt-BR", "en"),
            Ok(Some("portuguese".into()))
        );
    }

    #[test]
    fn falls_back_to_default_locale_then_plain_readme() {
        let ws = temp_workspace("loc-default");
        let dir = plugin_dir(&ws, "p");
        std::fs::write(dir.join("README.md"), "plain").unwrap();
        std::fs::write(dir.join("README.fr.md"), "french").unwrap();
        assert_eq!(read_locale(&ws, "p", "ru", "fr"), Ok(Some("french".into())));
        assert_eq!(read_locale(&ws, "p", "ru", "de"), Ok(Some("plain".into())));
    }

    #[test]
    fn rejects_invalid_locale() {
        let ws = temp_workspace("loc-bad");
        assert!(read_locale(&ws, "p", "../x", "en").is_err());
        assert!(read_locale(&ws, "p", "ru", "EN").is_err());
    }
}
