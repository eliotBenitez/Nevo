use toml_edit::{value, Array, DocumentMut, Item, Table};

use super::{paths::Launcher, Entry};

fn document(raw: &str) -> Result<DocumentMut, String> {
    raw.parse::<DocumentMut>()
        .map_err(|_| "Codex configuration is not valid TOML".to_string())
}

pub fn entry(raw: &str) -> Result<Option<Entry>, String> {
    let doc = document(raw)?;
    let Some(servers) = doc.get("mcp_servers") else {
        return Ok(None);
    };
    let servers = servers
        .as_table()
        .ok_or_else(|| "Codex MCP configuration has an unexpected shape".to_string())?;
    let Some(nevo) = servers.get("nevo") else {
        return Ok(None);
    };
    let nevo = nevo
        .as_table()
        .ok_or_else(|| "Codex nevo entry has an unexpected shape".to_string())?;
    let command = nevo
        .get("command")
        .and_then(Item::as_str)
        .ok_or_else(|| "Codex nevo command is invalid".to_string())?;
    let args = match nevo.get("args") {
        Some(item) => item
            .as_array()
            .ok_or_else(|| "Codex nevo arguments are invalid".to_string())?
            .iter()
            .map(|item| {
                item.as_str()
                    .map(str::to_string)
                    .ok_or_else(|| "Codex nevo arguments are invalid".to_string())
            })
            .collect::<Result<Vec<_>, _>>()?,
        None => Vec::new(),
    };
    let managed = nevo
        .get("env")
        .and_then(Item::as_table)
        .and_then(|env| env.get("NEVO_MCP_MANAGED"))
        .and_then(Item::as_str)
        == Some("1");
    Ok(Some(Entry {
        command: command.to_string(),
        args,
        managed,
    }))
}

fn set_launcher(nevo: &mut Table, launcher: &Launcher) -> Result<(), String> {
    nevo["command"] = value(&launcher.command);
    let mut args = Array::new();
    for arg in &launcher.args {
        args.push(arg.as_str());
    }
    nevo["args"] = value(args);
    if nevo.get("env").is_none() {
        nevo["env"] = Item::Table(Table::new());
    }
    let env = nevo["env"]
        .as_table_mut()
        .ok_or_else(|| "Codex nevo environment is invalid".to_string())?;
    env["NEVO_MCP_MANAGED"] = value("1");
    Ok(())
}

pub fn set(raw: &str, launcher: &Launcher, preserve_existing: bool) -> Result<String, String> {
    let mut doc = document(raw)?;
    if doc.get("mcp_servers").is_none() {
        doc["mcp_servers"] = Item::Table(Table::new());
    }
    let servers = doc["mcp_servers"]
        .as_table_mut()
        .ok_or_else(|| "Codex MCP configuration has an unexpected shape".to_string())?;
    if preserve_existing {
        let nevo = servers["nevo"]
            .as_table_mut()
            .ok_or_else(|| "Codex nevo entry has an unexpected shape".to_string())?;
        set_launcher(nevo, launcher)?;
    } else {
        let mut nevo = Table::new();
        set_launcher(&mut nevo, launcher)?;
        servers["nevo"] = Item::Table(nevo);
    }
    Ok(doc.to_string())
}

pub fn remove(raw: &str) -> Result<String, String> {
    let mut doc = document(raw)?;
    let servers = doc["mcp_servers"]
        .as_table_mut()
        .ok_or_else(|| "Codex MCP configuration has an unexpected shape".to_string())?;
    servers.remove("nevo");
    Ok(doc.to_string())
}
