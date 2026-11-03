use super::repository::{catalog_client, encode_raw_path, MARKETPLACE_RAW_BASE};
use crate::commands::workspace::plugin_locale::{
    locale_chain, merge_chain, parse_catalog, PluginMessages, MAX_PLUGIN_CATALOG_BYTES,
};
use crate::commands::workspace::plugins::validate_plugin_id;

#[tauri::command]
pub async fn marketplace_plugin_messages(
    plugin_id: String,
    locale: String,
    default_locale: String,
) -> Result<Option<PluginMessages>, String> {
    validate_plugin_id(&plugin_id)?;
    let chain = locale_chain(&locale, &default_locale)?;
    let client = catalog_client()?;
    let mut catalogs = Vec::new();
    for loc in chain {
        let url = format!(
            "{}/{}",
            MARKETPLACE_RAW_BASE,
            encode_raw_path(&format!("plugins/{plugin_id}/locales/{loc}.json"))
        );
        let response = client
            .get(url)
            .header(reqwest::header::USER_AGENT, "Nevo Marketplace")
            .send()
            .await
            .map_err(|error| error.to_string())?;
        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            continue;
        }
        if !status.is_success() {
            return Err(format!("Marketplace request failed with {status}"));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_PLUGIN_CATALOG_BYTES as u64)
        {
            return Err(format!("Catalog {loc}.json exceeds the size limit"));
        }
        let bytes = response.bytes().await.map_err(|error| error.to_string())?;
        let catalog =
            parse_catalog(bytes.to_vec()).map_err(|error| format!("{loc}.json: {error}"))?;
        catalogs.push((loc, catalog));
    }
    Ok(merge_chain(catalogs))
}
