use super::super::types::PluginManifest;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceCatalog {
    pub repo: String,
    pub branch: String,
    pub updated_at: String,
    pub from_cache: bool,
    pub error: Option<String>,
    pub plugins: Vec<MarketplaceCatalogItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceCatalogItem {
    pub plugin_id: String,
    pub plugin_path: String,
    pub tree_sha: String,
    pub status: MarketplacePluginStatus,
    pub manifest: Option<PluginManifest>,
    pub manifest_error: Option<String>,
    pub installed_version: Option<String>,
    pub source_url: String,
    pub files: Vec<String>,
    pub permission_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MarketplacePluginStatus {
    NotInstalled,
    Installed,
    UpdateAvailable,
    Disabled,
    Invalid,
    Conflict,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceInstallMetadata {
    pub repo: String,
    pub branch: String,
    pub plugin_path: String,
    pub tree_sha: String,
    pub installed_version: String,
    pub installed_at: String,
    pub files: Vec<String>,
    #[serde(default)]
    pub permission_fingerprint: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplacePreparedPlugin {
    pub transaction_id: String,
    pub manifest: PluginManifest,
    pub previous_data_version: Option<u32>,
    pub permission_fingerprint: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceMigrationBundle {
    pub workspace_storage: Option<serde_json::Value>,
    pub plugin_registry: Option<serde_json::Value>,
    #[serde(default)]
    pub collab_states_base64: BTreeMap<String, String>,
}
