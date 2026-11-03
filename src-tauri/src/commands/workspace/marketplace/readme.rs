use super::repository::{catalog_client, encode_raw_path, MARKETPLACE_RAW_BASE};
use crate::commands::workspace::plugin_readme::{decode_readme, MAX_PLUGIN_README_BYTES};
use crate::commands::workspace::plugins::validate_plugin_id;

fn validate_readme_file_name(file_name: &str) -> Result<(), String> {
    if file_name.eq_ignore_ascii_case("readme.md") && !file_name.contains(['/', '\\']) {
        Ok(())
    } else {
        Err("Invalid README file name".to_string())
    }
}

#[tauri::command]
pub async fn marketplace_plugin_readme(
    plugin_id: String,
    file_name: String,
) -> Result<Option<String>, String> {
    validate_plugin_id(&plugin_id)?;
    validate_readme_file_name(&file_name)?;
    let url = format!(
        "{}/{}",
        MARKETPLACE_RAW_BASE,
        encode_raw_path(&format!("plugins/{plugin_id}/{file_name}"))
    );
    let response = catalog_client()?
        .get(url)
        .header(reqwest::header::USER_AGENT, "Nevo Marketplace")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(format!("Marketplace request failed with {status}"));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_PLUGIN_README_BYTES as u64)
    {
        return Err("README exceeds the size limit".to_string());
    }
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    decode_readme(bytes.to_vec()).map(Some)
}

#[cfg(test)]
mod tests {
    use super::validate_readme_file_name;

    #[test]
    fn accepts_readme_in_any_case() {
        assert!(validate_readme_file_name("README.md").is_ok());
        assert!(validate_readme_file_name("readme.MD").is_ok());
    }

    #[test]
    fn rejects_other_names_and_separators() {
        assert!(validate_readme_file_name("manifest.json").is_err());
        assert!(validate_readme_file_name("a/README.md").is_err());
        assert!(validate_readme_file_name("a\\README.md").is_err());
    }
}
