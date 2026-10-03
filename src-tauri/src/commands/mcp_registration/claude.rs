use serde_json::{json, Map, Value};

use super::{paths::Launcher, Entry};

fn document(raw: &str) -> Result<Value, String> {
    let source = if raw.trim().is_empty() { "{}" } else { raw };
    let value: Value = serde_json::from_str(source)
        .map_err(|_| "Claude Code configuration is not valid JSON".to_string())?;
    if !value.is_object() {
        return Err("Claude Code configuration must be a JSON object".to_string());
    }
    Ok(value)
}

pub fn entry(raw: &str) -> Result<Option<Entry>, String> {
    let doc = document(raw)?;
    let Some(servers) = doc.get("mcpServers") else {
        return Ok(None);
    };
    let servers = servers
        .as_object()
        .ok_or_else(|| "Claude Code MCP configuration has an unexpected shape".to_string())?;
    let Some(nevo) = servers.get("nevo") else {
        return Ok(None);
    };
    let command = nevo["command"]
        .as_str()
        .ok_or_else(|| "Claude Code nevo command is invalid".to_string())?;
    let args = match nevo.get("args") {
        Some(value) => value
            .as_array()
            .ok_or_else(|| "Claude Code nevo arguments are invalid".to_string())?
            .iter()
            .map(|item| {
                item.as_str()
                    .map(str::to_string)
                    .ok_or_else(|| "Claude Code nevo arguments are invalid".to_string())
            })
            .collect::<Result<Vec<_>, _>>()?,
        None => Vec::new(),
    };
    let managed = nevo["env"]["NEVO_MCP_MANAGED"] == "1";
    Ok(Some(Entry {
        command: command.to_string(),
        args,
        managed,
    }))
}

pub fn set(raw: &str, launcher: &Launcher, preserve_existing: bool) -> Result<String, String> {
    let mut doc = document(raw)?;
    let root = doc
        .as_object_mut()
        .ok_or_else(|| "Claude Code configuration must be a JSON object".to_string())?;
    let servers = root
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| "Claude Code MCP configuration has an unexpected shape".to_string())?;
    if preserve_existing {
        let nevo = servers
            .get_mut("nevo")
            .and_then(Value::as_object_mut)
            .ok_or_else(|| "Claude Code nevo entry has an unexpected shape".to_string())?;
        nevo.insert("command".to_string(), json!(launcher.command));
        nevo.insert("args".to_string(), json!(launcher.args));
        let env = nevo
            .get_mut("env")
            .and_then(Value::as_object_mut)
            .ok_or_else(|| "Claude Code nevo environment is invalid".to_string())?;
        env.insert("NEVO_MCP_MANAGED".to_string(), json!("1"));
    } else {
        servers.insert(
            "nevo".to_string(),
            json!({
                "type": "stdio",
                "command": launcher.command,
                "args": launcher.args,
                "env": { "NEVO_MCP_MANAGED": "1" }
            }),
        );
    }
    serde_json::to_string_pretty(&doc)
        .map(|mut raw| {
            raw.push('\n');
            raw
        })
        .map_err(|_| "Could not encode Claude Code configuration".to_string())
}

pub fn remove(raw: &str) -> Result<String, String> {
    let mut doc = document(raw)?;
    let servers = doc["mcpServers"]
        .as_object_mut()
        .ok_or_else(|| "Claude Code MCP configuration has an unexpected shape".to_string())?;
    servers.remove("nevo");
    serde_json::to_string_pretty(&doc)
        .map(|mut raw| {
            raw.push('\n');
            raw
        })
        .map_err(|_| "Could not encode Claude Code configuration".to_string())
}
