#![cfg(desktop)]

use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn headless_server_handshakes_and_reports_unavailable_bridge_on_stdout() {
    let endpoint = std::env::temp_dir().join(format!(
        "nevo-missing-mcp-endpoint-{}.json",
        uuid::Uuid::new_v4()
    ));
    let mut child = Command::new(env!("CARGO_BIN_EXE_nevo"))
        .arg("--mcp-server")
        .env("NEVO_MCP_ENDPOINT", endpoint)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn headless server");
    let requests = [
        serde_json::json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26", "capabilities": {},
                "clientInfo": { "name": "nevo-test", "version": "1.0.0" }
            }
        }),
        serde_json::json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
        serde_json::json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }),
        serde_json::json!({
            "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": { "name": "nevo_workspace_info", "arguments": {} }
        }),
    ];
    let mut stdin = child.stdin.take().expect("stdin");
    for request in requests {
        writeln!(stdin, "{request}").expect("write request");
    }
    drop(stdin);

    let output = child.wait_with_output().expect("wait for server");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).expect("UTF-8 stdout");
    let responses: Vec<serde_json::Value> = stdout
        .lines()
        .map(|line| serde_json::from_str(line).expect("stdout contains only JSON-RPC"))
        .collect();
    assert_eq!(responses.len(), 3, "{stdout}");
    assert_eq!(responses[0]["result"]["serverInfo"]["name"], "nevo");
    assert_eq!(
        responses[1]["result"]["tools"]
            .as_array()
            .expect("tools")
            .len(),
        9
    );
    assert_eq!(responses[2]["result"]["isError"], true);
    assert!(!stdout.contains("Bearer "));
}
