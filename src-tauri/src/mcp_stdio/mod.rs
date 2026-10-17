mod endpoint;
mod prompts;
mod resources;
mod tools;

use std::time::Duration;

use futures_util::StreamExt;
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, GetPromptRequestParams,
    GetPromptResponse, Implementation, ListPromptsResult, ListResourceTemplatesResult,
    ListResourcesResult, ListToolsResult, PaginatedRequestParams, ReadResourceRequestParams,
    ReadResourceResponse, ReadResourceResult, ResourceContents, ServerCapabilities, ServerConfig,
    Tool,
};
use rmcp::service::{RequestContext, RoleServer};
use rmcp::{ErrorData as McpError, ServerHandler, ServiceExt};
use serde_json::{json, Value};

const MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

struct NevoStdioServer {
    definitions: Vec<tools::ToolDefinition>,
    advertised: Vec<Tool>,
}

impl NevoStdioServer {
    fn new() -> Result<Self, String> {
        Ok(Self {
            definitions: tools::catalog().map_err(|error| error.to_string())?,
            advertised: tools::as_mcp_tools().map_err(|error| error.to_string())?,
        })
    }
}

impl ServerHandler for NevoStdioServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .enable_prompts()
                .build(),
        )
        .with_server_info(Implementation::new("nevo", env!("CARGO_PKG_VERSION")))
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        self.advertised
            .iter()
            .find(|tool| tool.name == name)
            .cloned()
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult::with_all_items(self.advertised.clone()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let Some(definition) = self
            .definitions
            .iter()
            .find(|tool| tool.name == request.name)
        else {
            return Err(McpError::invalid_params("Unknown Nevo tool", None));
        };
        let params = if definition.name == "nevo_workspace_info" {
            json!({})
        } else {
            Value::Object(request.arguments.unwrap_or_default())
        };
        let result = match forward(&definition.method, params).await {
            Ok(result) => result,
            Err(message) => tool_error(message),
        };
        Ok(result.into())
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        Ok(ListResourcesResult::with_all_items(resources::listed()))
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, McpError> {
        Ok(ListResourceTemplatesResult::with_all_items(
            resources::templates(),
        ))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, McpError> {
        let Some((method, params)) = resources::resolve(&request.uri) else {
            return Err(McpError::resource_not_found("Unknown Nevo resource", None));
        };
        let (status, body) = forward_raw(method, params)
            .await
            .map_err(|message| McpError::internal_error(message, None))?;
        let value = bridge_value(status, &body)
            .map_err(|message| McpError::resource_not_found(message, None))?;
        let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| "null".to_string());
        Ok(ReadResourceResult::new(vec![
            ResourceContents::text(text, request.uri).with_mime_type("application/json")
        ])
        .into())
    }

    async fn list_prompts(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, McpError> {
        Ok(ListPromptsResult::with_all_items(prompts::listed()))
    }

    async fn get_prompt(
        &self,
        request: GetPromptRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<GetPromptResponse, McpError> {
        prompts::render(&request.name, request.arguments.as_ref())
            .map(Into::into)
            .map_err(|message| McpError::invalid_params(message, None))
    }
}

fn tool_error(message: impl Into<String>) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(message.into())])
}

/// Unwraps the bridge envelope into its result, or a caller-facing error.
fn bridge_value(status: u16, raw: &[u8]) -> Result<Value, String> {
    let Ok(mut envelope) = serde_json::from_slice::<Value>(raw) else {
        return Err("Nevo returned an invalid bridge response".to_string());
    };
    if status >= 400 || envelope["ok"] != true {
        let code = envelope["error"]["code"].as_str().unwrap_or("bridge_error");
        let message = envelope["error"]["message"]
            .as_str()
            .unwrap_or("Nevo rejected this request");
        return Err(format!("{message} ({code})"));
    }
    Ok(envelope["result"].take())
}

fn bridge_to_result(status: u16, raw: &[u8]) -> CallToolResult {
    match bridge_value(status, raw) {
        Ok(result) => {
            let pretty =
                serde_json::to_string_pretty(&result).unwrap_or_else(|_| "null".to_string());
            CallToolResult::success(vec![ContentBlock::text(pretty)])
        }
        Err(message) => tool_error(message),
    }
}

async fn forward(method: &str, params: Value) -> Result<CallToolResult, String> {
    let (status, body) = forward_raw(method, params).await?;
    Ok(bridge_to_result(status, &body))
}

async fn forward_raw(method: &str, params: Value) -> Result<(u16, Vec<u8>), String> {
    let endpoint = tokio::task::spawn_blocking(endpoint::read)
        .await
        .map_err(|_| "Could not read the Nevo MCP endpoint".to_string())??;
    let payload = serde_json::to_vec(&json!({ "method": method, "params": params }))
        .map_err(|_| "Could not encode the MCP request".to_string())?;
    if payload.len() > MAX_RESPONSE_BYTES {
        return Err("MCP request is too large".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|_| "Could not initialize the MCP bridge client".to_string())?;
    let response = client
        .post(format!("http://127.0.0.1:{}/rpc", endpoint.port))
        .header("Authorization", format!("Bearer {}", endpoint.token))
        .header("Content-Type", "application/json")
        .body(payload)
        .send()
        .await
        .map_err(|_| "Could not reach Nevo's MCP bridge".to_string())?;
    let status = response.status().as_u16();
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "Could not read Nevo's MCP response".to_string())?;
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err("Nevo's MCP response is too large".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    Ok((status, body))
}

pub fn run() -> Result<(), String> {
    let server = NevoStdioServer::new()?;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| error.to_string())?;
    runtime.block_on(async move {
        let running = server
            .serve(rmcp::transport::stdio())
            .await
            .map_err(|error| error.to_string())?;
        running.waiting().await.map_err(|error| error.to_string())?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::tools;

    #[test]
    fn exposes_the_shared_catalog() {
        let tools = tools::catalog().expect("tool catalog");
        assert_eq!(tools.len(), 20);
        assert_eq!(tools[0].name, "nevo_workspace_info");
        assert_eq!(tools[5].method, "notes.editorSnapshot");
        assert_eq!(tools[5].access, "read");
    }

    #[test]
    fn endpoint_override_is_used_without_exposing_the_token() {
        use std::collections::HashMap;

        // The override must be absolute on the host OS, so derive it from temp_dir.
        let endpoint = std::env::temp_dir().join("custom-endpoint.json");
        let home = std::env::temp_dir().join("home-tester");
        let env = HashMap::from([
            ("HOME".to_string(), home.to_string_lossy().into_owned()),
            (
                "NEVO_MCP_ENDPOINT".to_string(),
                endpoint.to_string_lossy().into_owned(),
            ),
        ]);
        assert_eq!(
            super::endpoint::path_for(&env, "linux").expect("endpoint path"),
            endpoint
        );
        let error =
            super::endpoint::parse(r#"{"port":0,"token":"top-secret"}"#).expect_err("invalid port");
        assert!(!error.contains("top-secret"));
    }

    #[test]
    fn exported_tools_keep_the_catalog_schemas() {
        let tools = tools::as_mcp_tools().expect("MCP tools");
        assert_eq!(tools.len(), 20);
        let edit = tools
            .iter()
            .find(|tool| tool.name == "nevo_apply_edit")
            .expect("edit tool");
        assert_eq!(
            edit.input_schema["required"],
            serde_json::json!(["noteId", "revision", "operations"])
        );
    }

    #[test]
    fn bridge_refusal_becomes_a_caller_visible_tool_error() {
        let result = super::bridge_to_result(
            403,
            br#"{"ok":false,"error":{"code":"read_only","message":"Bridge is read-only"}}"#,
        );
        assert_eq!(result.is_error, Some(true));
        let raw = serde_json::to_string(&result).expect("serialize tool result");
        assert!(raw.contains("read_only"));
        assert!(raw.contains("Bridge is read-only"));
    }
}
