use rmcp::model::{Tool, ToolAnnotations};
use serde::Deserialize;
use serde_json::{Map, Value};

const CATALOG: &str = include_str!("../../../packages/mcp-server/src/tools/catalog.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDefinition {
    pub name: String,
    pub title: String,
    pub description: String,
    pub method: String,
    pub access: String,
    pub input_schema: Map<String, Value>,
}

pub fn catalog() -> Result<Vec<ToolDefinition>, serde_json::Error> {
    serde_json::from_str(CATALOG)
}

pub fn as_mcp_tools() -> Result<Vec<Tool>, serde_json::Error> {
    Ok(catalog()?
        .into_iter()
        .map(|definition| {
            let read_only = definition.access == "read";
            Tool::new(
                definition.name,
                definition.description,
                definition.input_schema,
            )
            .with_title(definition.title)
            .with_annotations(ToolAnnotations::new().read_only(read_only))
        })
        .collect())
}
