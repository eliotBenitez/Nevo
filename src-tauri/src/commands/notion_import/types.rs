use serde::Serialize;

use crate::commands::note::ImportedImageAsset;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionExportDocument {
    pub relative_path: String,
    pub kind: NotionDocumentKind,
    pub content: String,
    pub size: u64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NotionDocumentKind {
    Markdown,
    Csv,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionExportAsset {
    pub relative_path: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionExportSkipped {
    pub relative_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotionExportManifest {
    pub session_token: String,
    pub export_name: String,
    pub documents: Vec<NotionExportDocument>,
    pub assets: Vec<NotionExportAsset>,
    pub skipped: Vec<NotionExportSkipped>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionAssetImportResult {
    pub relative_path: String,
    pub asset: Option<ImportedImageAsset>,
    pub error: Option<String>,
}
