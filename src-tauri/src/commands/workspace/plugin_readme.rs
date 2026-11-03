use super::paths::plugins_dir_path;
use super::plugins::validate_plugin_id;
use crate::commands::path_utils::normalize_workspace_path;

pub(crate) const MAX_PLUGIN_README_BYTES: usize = 256 * 1024;

/// Enforces the size limit, decodes strict UTF-8 and strips a leading BOM.
pub(crate) fn decode_readme(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.len() > MAX_PLUGIN_README_BYTES {
        return Err("README exceeds the size limit".to_string());
    }
    let text = String::from_utf8(bytes).map_err(|_| "README is not valid UTF-8".to_string())?;
    Ok(match text.strip_prefix('\u{feff}') {
        Some(stripped) => stripped.to_string(),
        None => text,
    })
}

#[tauri::command]
pub async fn plugin_readme_read(
    workspace_path: String,
    plugin_id: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || plugin_readme_read_sync(workspace_path, plugin_id))
        .await
        .map_err(|error| error.to_string())?
}

pub fn plugin_readme_read_sync(
    workspace_path: String,
    plugin_id: String,
) -> Result<Option<String>, String> {
    validate_plugin_id(&plugin_id)?;
    let workspace = normalize_workspace_path(&workspace_path)?;
    let plugin_dir = plugins_dir_path(&workspace.to_string_lossy()).join(&plugin_id);
    let entries = match std::fs::read_dir(&plugin_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case("readme.md")
        {
            continue;
        }
        let metadata =
            std::fs::symlink_metadata(entry.path()).map_err(|error| error.to_string())?;
        if !metadata.is_file() {
            continue;
        }
        if metadata.len() > MAX_PLUGIN_README_BYTES as u64 {
            return Err("README exceeds the size limit".to_string());
        }
        let bytes = std::fs::read(entry.path()).map_err(|error| error.to_string())?;
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

    fn read(workspace: &PathBuf, id: &str) -> Result<Option<String>, String> {
        plugin_readme_read_sync(workspace.to_string_lossy().into_owned(), id.to_string())
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
}
