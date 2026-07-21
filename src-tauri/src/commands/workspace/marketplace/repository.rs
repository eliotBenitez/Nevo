use super::catalog::{build_catalog_from_tree, group_marketplace_files};
use super::types::{MarketplaceCatalog, MarketplaceCatalogItem};
use crate::commands::path_utils::write_atomic;
use serde::Deserialize;
use sha1::{Digest, Sha1};
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

pub(super) const MARKETPLACE_REPO: &str = "eliotBenitez/nevo-marketplace";
pub(super) const MARKETPLACE_BRANCH: &str = "main";
const MARKETPLACE_TREE_URL: &str =
    "https://api.github.com/repos/eliotBenitez/nevo-marketplace/git/trees/main?recursive=1";
const MARKETPLACE_RAW_BASE: &str =
    "https://raw.githubusercontent.com/eliotBenitez/nevo-marketplace/main";
pub(super) const MARKETPLACE_META_FILE: &str = ".nevo-marketplace.json";

#[derive(Debug, Deserialize)]
struct GitHubTreeResponse {
    tree: Vec<GitHubTreeEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub(super) struct GitHubTreeEntry {
    pub(super) path: String,
    pub(super) mode: String,
    #[serde(rename = "type")]
    pub(super) entry_type: String,
    pub(super) sha: String,
}

#[derive(Debug, Clone)]
pub(super) struct MarketplaceFile {
    pub(super) relative_path: String,
    pub(super) sha: String,
}

pub(super) async fn fetch_catalog_tree() -> Result<Vec<GitHubTreeEntry>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(MARKETPLACE_TREE_URL)
        .header(reqwest::header::USER_AGENT, "Nevo Marketplace")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Marketplace request failed with {}",
            response.status()
        ));
    }

    let payload = response
        .json::<GitHubTreeResponse>()
        .await
        .map_err(|error| error.to_string())?;
    Ok(payload.tree)
}

pub(super) async fn build_catalog_from_remote_tree(
    tree: &[GitHubTreeEntry],
    workspace_path: &str,
) -> Result<MarketplaceCatalog, String> {
    let grouped = group_marketplace_files(tree).0;
    let client = reqwest::Client::new();
    let mut manifests = BTreeMap::new();

    for (plugin_id, files) in &grouped {
        if !files
            .iter()
            .any(|file| file.relative_path == "manifest.json")
        {
            continue;
        }
        let manifest_url = format!(
            "{}/{}",
            MARKETPLACE_RAW_BASE,
            encode_raw_path(&format!("plugins/{}/manifest.json", plugin_id))
        );
        let response = client
            .get(manifest_url)
            .header(reqwest::header::USER_AGENT, "Nevo Marketplace")
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            continue;
        }
        let content = response.text().await.map_err(|error| error.to_string())?;
        manifests.insert(plugin_id.clone(), content);
    }

    Ok(build_catalog_from_tree(
        tree,
        &manifests,
        workspace_path,
        false,
        None,
    ))
}

pub(super) async fn download_plugin_files(
    item: &MarketplaceCatalogItem,
    tmp_dir: &Path,
) -> Result<(), String> {
    const MAX_PLUGIN_FILE_BYTES: usize = 5 * 1024 * 1024;
    const MAX_PLUGIN_TOTAL_BYTES: usize = 25 * 1024 * 1024;
    let expected_hashes = item.tree_sha.split(':').collect::<Vec<_>>();
    if expected_hashes.len() != item.files.len() {
        return Err("Marketplace catalog file hashes are incomplete".to_string());
    }
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| error.to_string())?;
    let mut total_bytes = 0usize;
    for (file, expected_hash) in item.files.iter().zip(expected_hashes) {
        let safe_path = safe_relative_path(file)?;
        let url = format!(
            "{}/{}",
            MARKETPLACE_RAW_BASE,
            encode_raw_path(&format!("{}/{}", item.plugin_path, file))
        );
        let response = client
            .get(url)
            .header(reqwest::header::USER_AGENT, "Nevo Marketplace")
            .send()
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Failed to download marketplace file {}", file));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_PLUGIN_FILE_BYTES as u64)
        {
            return Err(format!("Marketplace file {file} exceeds the size limit"));
        }
        let bytes = response.bytes().await.map_err(|error| error.to_string())?;
        total_bytes = total_bytes.saturating_add(bytes.len());
        if bytes.len() > MAX_PLUGIN_FILE_BYTES || total_bytes > MAX_PLUGIN_TOTAL_BYTES {
            return Err("Marketplace plugin exceeds the download size limit".to_string());
        }
        if git_blob_sha(&bytes) != expected_hash {
            return Err(format!(
                "Marketplace file {file} failed integrity verification"
            ));
        }
        let target = tmp_dir.join(&safe_path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(target, bytes).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(super) fn git_blob_sha(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("blob {}\0", bytes.len()).as_bytes());
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

pub(super) fn read_cache(cache_path: &Path) -> Result<MarketplaceCatalog, String> {
    let content = std::fs::read_to_string(cache_path).map_err(|error| error.to_string())?;
    serde_json::from_str::<MarketplaceCatalog>(&content).map_err(|error| error.to_string())
}

pub(super) fn write_cache(cache_path: &Path, catalog: &MarketplaceCatalog) -> Result<(), String> {
    if let Some(parent) = cache_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let content = serde_json::to_string_pretty(catalog).map_err(|error| error.to_string())?;
    write_atomic(cache_path, content.as_bytes()).map_err(|error| error.to_string())
}

pub(super) fn cache_path(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".nevo/marketplace/cache.json")
}
pub(super) fn split_plugin_tree_path(path: &str) -> Option<(String, String)> {
    let mut parts = path.splitn(3, '/');
    if parts.next()? != "plugins" {
        return None;
    }
    let plugin_id = parts.next()?.to_string();
    let relative_path = parts.next()?.to_string();
    Some((plugin_id, relative_path))
}

pub(super) fn safe_relative_path(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() || path.starts_with('/') || path.contains('\\') {
        return Err("Unsafe marketplace path".to_string());
    }
    let candidate = Path::new(path);
    if candidate
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Unsafe marketplace path".to_string());
    }
    Ok(candidate.to_path_buf())
}

fn encode_raw_path(path: &str) -> String {
    path.split('/')
        .map(|segment| segment.replace(' ', "%20"))
        .collect::<Vec<_>>()
        .join("/")
}
