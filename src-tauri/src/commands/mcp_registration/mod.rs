mod claude;
mod codex;
mod paths;
mod write;

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;

use self::paths::Launcher;

static REGISTRATION_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Agent {
    Codex,
    ClaudeCode,
}

impl Agent {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "codex" => Ok(Self::Codex),
            "claudeCode" => Ok(Self::ClaudeCode),
            _ => Err("Unknown MCP agent".to_string()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StatusKind {
    NotConfigured,
    Connected,
    NeedsReconnect,
    Conflict,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub kind: StatusKind,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatuses {
    pub codex: AgentStatus,
    pub claude_code: AgentStatus,
}

fn installed_context(agent: Agent) -> Result<(std::path::PathBuf, Launcher), String> {
    if cfg!(debug_assertions) {
        return Err("Connect agents from an installed Nevo build".to_string());
    }
    let env: HashMap<String, String> = std::env::vars().collect();
    let executable = std::env::current_exe()
        .map_err(|_| "Installed Nevo executable is unavailable".to_string())?;
    if paths::is_development_executable(&executable, Path::new(env!("CARGO_MANIFEST_DIR"))) {
        return Err("Connect agents from an installed Nevo build".to_string());
    }
    let launcher = paths::resolve_launcher(&env, &executable)?;
    let path = paths::config_path(agent, &env)?;
    Ok((path, launcher))
}

fn installed_status(agent: Agent) -> AgentStatus {
    match installed_context(agent) {
        Ok((path, launcher)) => status(agent, &path, &launcher),
        Err(message) => AgentStatus {
            kind: StatusKind::Error,
            message: Some(message),
        },
    }
}

pub fn installed_statuses() -> AgentStatuses {
    AgentStatuses {
        codex: installed_status(Agent::Codex),
        claude_code: installed_status(Agent::ClaudeCode),
    }
}

pub fn connect_installed(agent: Agent, replace_conflict: bool) -> Result<AgentStatus, String> {
    let _guard = REGISTRATION_LOCK
        .lock()
        .map_err(|_| "Could not lock MCP agent configuration".to_string())?;
    let (path, launcher) = installed_context(agent)?;
    connect(agent, &path, &launcher, replace_conflict)
}

pub fn disconnect_installed(agent: Agent) -> Result<AgentStatus, String> {
    let _guard = REGISTRATION_LOCK
        .lock()
        .map_err(|_| "Could not lock MCP agent configuration".to_string())?;
    let (path, launcher) = installed_context(agent)?;
    disconnect(agent, &path, &launcher)
}

#[derive(Debug, Clone)]
pub struct Entry {
    command: String,
    args: Vec<String>,
    managed: bool,
}

fn entry(agent: Agent, raw: &str) -> Result<Option<Entry>, String> {
    match agent {
        Agent::Codex => codex::entry(raw),
        Agent::ClaudeCode => claude::entry(raw),
    }
}

fn status_for_entry(entry: Option<Entry>, launcher: &Launcher) -> AgentStatus {
    let kind = match entry {
        None => StatusKind::NotConfigured,
        Some(entry)
            if !entry.managed || !paths::is_managed_launcher(&entry.command, &entry.args) =>
        {
            StatusKind::Conflict
        }
        Some(entry) if entry.command == launcher.command && entry.args == launcher.args => {
            StatusKind::Connected
        }
        Some(_) => StatusKind::NeedsReconnect,
    };
    AgentStatus {
        kind,
        message: None,
    }
}

pub fn status(agent: Agent, path: &Path, launcher: &Launcher) -> AgentStatus {
    let result = write::read_existing(path).and_then(|bytes| {
        let raw = String::from_utf8(bytes.unwrap_or_default())
            .map_err(|_| "Agent configuration is not valid UTF-8".to_string())?;
        entry(agent, &raw)
    });
    match result {
        Ok(entry) => status_for_entry(entry, launcher),
        Err(message) => AgentStatus {
            kind: StatusKind::Error,
            message: Some(message),
        },
    }
}

pub fn connect(
    agent: Agent,
    path: &Path,
    launcher: &Launcher,
    replace_conflict: bool,
) -> Result<AgentStatus, String> {
    let before = write::read_existing(path)?;
    let raw = String::from_utf8(before.clone().unwrap_or_default())
        .map_err(|_| "Agent configuration is not valid UTF-8".to_string())?;
    let previous = status_for_entry(entry(agent, &raw)?, launcher);
    if previous.kind == StatusKind::Conflict && !replace_conflict {
        return Err("An MCP entry named nevo already exists in this agent".to_string());
    }
    if previous.kind == StatusKind::Connected {
        return Ok(previous);
    }
    let updated = match agent {
        Agent::Codex => codex::set(&raw, launcher, previous.kind == StatusKind::NeedsReconnect)?,
        Agent::ClaudeCode => {
            claude::set(&raw, launcher, previous.kind == StatusKind::NeedsReconnect)?
        }
    };
    write::replace_if_unchanged(path, before.as_deref(), updated.as_bytes())?;
    Ok(status(agent, path, launcher))
}

pub fn disconnect(agent: Agent, path: &Path, launcher: &Launcher) -> Result<AgentStatus, String> {
    let before = write::read_existing(path)?;
    let raw = String::from_utf8(before.clone().unwrap_or_default())
        .map_err(|_| "Agent configuration is not valid UTF-8".to_string())?;
    let previous = status_for_entry(entry(agent, &raw)?, launcher);
    match previous.kind {
        StatusKind::NotConfigured => return Ok(previous),
        StatusKind::Conflict => return Err("Nevo does not own this agent entry".to_string()),
        _ => {}
    }
    let updated = match agent {
        Agent::Codex => codex::remove(&raw)?,
        Agent::ClaudeCode => claude::remove(&raw)?,
    };
    write::replace_if_unchanged(path, before.as_deref(), updated.as_bytes())?;
    Ok(status(agent, path, launcher))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("nevo-mcp-registration-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("test directory");
        dir.join(name)
    }

    #[test]
    fn codex_connection_preserves_other_servers_and_comments() {
        let path = temp_path("config.toml");
        std::fs::write(
            &path,
            "# keep this\n[mcp_servers.other]\ncommand = 'other'\n",
        )
        .expect("initial config");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        connect(Agent::Codex, &path, &launcher, false).expect("connect");
        let raw = std::fs::read_to_string(&path).expect("updated config");
        assert!(raw.contains("# keep this"));
        assert!(raw.contains("command = 'other'"));
        assert!(raw.contains("/opt/nevo/bin/nevo"));
        assert_eq!(
            status(Agent::Codex, &path, &launcher).kind,
            StatusKind::Connected
        );
    }

    #[test]
    fn claude_connection_preserves_other_settings() {
        let path = temp_path(".claude.json");
        std::fs::write(
            &path,
            r#"{"theme":"dark","mcpServers":{"other":{"command":"other"}}}"#,
        )
        .expect("initial config");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        connect(Agent::ClaudeCode, &path, &launcher, false).expect("connect");
        let value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).expect("config")).expect("JSON");
        assert_eq!(value["theme"], "dark");
        assert_eq!(value["mcpServers"]["other"]["command"], "other");
        assert_eq!(value["mcpServers"]["nevo"]["command"], "/opt/nevo/bin/nevo");
        assert_eq!(
            status(Agent::ClaudeCode, &path, &launcher).kind,
            StatusKind::Connected
        );
    }

    #[test]
    fn conflicting_entry_is_not_replaced_without_explicit_choice() {
        let path = temp_path("config.toml");
        let original = "[mcp_servers.nevo]\ncommand = 'other'\n";
        std::fs::write(&path, original).expect("initial config");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        assert_eq!(
            status(Agent::Codex, &path, &launcher).kind,
            StatusKind::Conflict
        );
        assert!(connect(Agent::Codex, &path, &launcher, false).is_err());
        assert_eq!(std::fs::read_to_string(&path).expect("config"), original);
    }

    #[test]
    fn managed_marker_does_not_own_an_entry_with_extra_arguments() {
        let path = temp_path("config.toml");
        let original = "[mcp_servers.nevo]\ncommand = '/other/program'\nargs = ['--mcp-server', '--extra']\n[mcp_servers.nevo.env]\nNEVO_MCP_MANAGED = '1'\n";
        std::fs::write(&path, original).expect("initial config");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        assert_eq!(
            status(Agent::Codex, &path, &launcher).kind,
            StatusKind::Conflict
        );
        assert!(connect(Agent::Codex, &path, &launcher, false).is_err());
        assert_eq!(std::fs::read_to_string(&path).expect("config"), original);
    }

    #[test]
    fn explicitly_replaces_a_conflicting_entry_and_keeps_a_backup() {
        let path = temp_path("config.toml");
        let original = "# keep\n[mcp_servers.nevo]\ncommand = 'other'\n";
        std::fs::write(&path, original).expect("initial config");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        connect(Agent::Codex, &path, &launcher, true).expect("replace conflict");
        assert_eq!(
            status(Agent::Codex, &path, &launcher).kind,
            StatusKind::Connected
        );
        assert_eq!(
            std::fs::read_to_string(path.with_file_name("config.toml.nevo-backup"))
                .expect("backup"),
            original
        );
    }

    #[test]
    fn claude_connection_and_disconnect_preserve_unrelated_servers() {
        let path = temp_path(".claude.json");
        let original = r#"{"theme":"dark","mcpServers":{"other":{"command":"other"}}}"#;
        std::fs::write(&path, original).expect("initial config");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        connect(Agent::ClaudeCode, &path, &launcher, false).expect("connect");
        disconnect(Agent::ClaudeCode, &path, &launcher).expect("disconnect");
        let value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).expect("config")).expect("JSON");
        assert_eq!(value["theme"], "dark");
        assert_eq!(value["mcpServers"]["other"]["command"], "other");
        assert!(value["mcpServers"].get("nevo").is_none());
    }

    #[test]
    fn reconnects_only_a_managed_entry_and_disconnects_idempotently() {
        let path = temp_path("config.toml");
        let old = paths::Launcher::native("/old/nevo".into());
        let current = paths::Launcher::native("/new/nevo".into());
        connect(Agent::Codex, &path, &old, false).expect("connect old binary");
        assert_eq!(
            status(Agent::Codex, &path, &current).kind,
            StatusKind::NeedsReconnect
        );
        connect(Agent::Codex, &path, &current, false).expect("reconnect");
        assert_eq!(
            status(Agent::Codex, &path, &current).kind,
            StatusKind::Connected
        );
        disconnect(Agent::Codex, &path, &current).expect("disconnect");
        disconnect(Agent::Codex, &path, &current).expect("disconnect twice");
        assert_eq!(
            status(Agent::Codex, &path, &current).kind,
            StatusKind::NotConfigured
        );
    }

    #[test]
    fn reconnect_preserves_custom_nevo_settings() {
        let codex_path = temp_path("config.toml");
        std::fs::write(
            &codex_path,
            "[mcp_servers.nevo]\ncommand = '/old/nevo'\nargs = ['--mcp-server']\nstartup_timeout_sec = 45 # keep\n[mcp_servers.nevo.env]\nNEVO_MCP_MANAGED = '1'\nCUSTOM = 'keep'\n",
        )
        .expect("Codex config");
        let claude_path = temp_path(".claude.json");
        std::fs::write(
            &claude_path,
            r#"{"mcpServers":{"nevo":{"type":"stdio","command":"/old/nevo","args":["--mcp-server"],"env":{"NEVO_MCP_MANAGED":"1","CUSTOM":"keep"},"timeout":45000}}}"#,
        )
        .expect("Claude config");
        let current = paths::Launcher::native("/new/nevo".into());
        connect(Agent::Codex, &codex_path, &current, false).expect("reconnect Codex");
        connect(Agent::ClaudeCode, &claude_path, &current, false).expect("reconnect Claude");
        let codex = std::fs::read_to_string(&codex_path).expect("Codex config");
        assert!(codex.contains("startup_timeout_sec = 45 # keep"));
        assert!(codex.contains("CUSTOM = 'keep'"));
        let claude: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&claude_path).expect("Claude config"))
                .expect("JSON");
        assert_eq!(claude["mcpServers"]["nevo"]["timeout"], 45000);
        assert_eq!(claude["mcpServers"]["nevo"]["env"]["CUSTOM"], "keep");
    }

    #[test]
    fn malformed_config_is_left_untouched() {
        let path = temp_path(".claude.json");
        std::fs::write(&path, "{invalid").expect("invalid config");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        assert_eq!(
            status(Agent::ClaudeCode, &path, &launcher).kind,
            StatusKind::Error
        );
        assert!(connect(Agent::ClaudeCode, &path, &launcher, true).is_err());
        assert_eq!(std::fs::read_to_string(&path).expect("config"), "{invalid");
        assert!(!path.with_file_name(".claude.json.nevo-backup").exists());
    }

    #[test]
    fn refuses_to_replace_a_config_changed_since_it_was_read() {
        let path = temp_path("config.toml");
        std::fs::write(&path, "original").expect("initial config");
        std::fs::write(&path, "newer user content").expect("external edit");
        let error = write::replace_if_unchanged(&path, Some(b"original"), b"nevo version")
            .expect_err("concurrent edit");
        assert!(error.contains("changed"));
        assert_eq!(
            std::fs::read_to_string(&path).expect("config"),
            "newer user content"
        );
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinked_configuration() {
        let real = temp_path("actual.toml");
        let link = real.with_file_name("config.toml");
        std::fs::write(&real, "").expect("real config");
        std::os::unix::fs::symlink(&real, &link).expect("symlink");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        assert_eq!(
            status(Agent::Codex, &link, &launcher).kind,
            StatusKind::Error
        );
        assert!(connect(Agent::Codex, &link, &launcher, false).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_configuration_directory() {
        let real = temp_path("real");
        std::fs::create_dir_all(&real).expect("real directory");
        let link = real.with_file_name(".codex");
        std::os::unix::fs::symlink(&real, &link).expect("symlinked directory");
        let path = link.join("config.toml");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        assert_eq!(
            status(Agent::Codex, &path, &launcher).kind,
            StatusKind::Error
        );
        assert!(connect(Agent::Codex, &path, &launcher, false).is_err());
        assert!(!real.join("config.toml").exists());
    }

    #[cfg(unix)]
    #[test]
    fn keeps_an_owner_only_backup_of_the_original() {
        use std::os::unix::fs::PermissionsExt;

        let path = temp_path("config.toml");
        std::fs::write(&path, "# original\n").expect("initial config");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        connect(Agent::Codex, &path, &launcher, false).expect("connect");
        let backup = path.with_file_name("config.toml.nevo-backup");
        assert_eq!(
            std::fs::read_to_string(&backup).expect("backup"),
            "# original\n"
        );
        assert_eq!(
            std::fs::metadata(backup)
                .expect("metadata")
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }

    #[cfg(unix)]
    #[test]
    fn refuses_an_existing_symlinked_backup() {
        let path = temp_path("config.toml");
        std::fs::write(&path, "# original\n").expect("initial config");
        let other = path.with_file_name("other");
        std::fs::write(&other, "keep").expect("other file");
        std::os::unix::fs::symlink(&other, path.with_file_name("config.toml.nevo-backup"))
            .expect("backup symlink");
        let launcher = paths::Launcher::native("/opt/nevo/bin/nevo".into());
        assert!(connect(Agent::Codex, &path, &launcher, false).is_err());
        assert_eq!(
            std::fs::read_to_string(&path).expect("config"),
            "# original\n"
        );
        assert_eq!(std::fs::read_to_string(&other).expect("other"), "keep");
    }

    #[test]
    fn resolves_stable_appimage_and_flatpak_launchers() {
        let appimage = temp_path("Nevo.AppImage");
        std::fs::write(&appimage, "binary").expect("appimage fixture");
        let env = std::collections::HashMap::from([(
            "APPIMAGE".to_string(),
            appimage.to_string_lossy().into_owned(),
        )]);
        assert_eq!(
            paths::resolve_launcher(&env, std::path::Path::new("/tmp/mount/nevo"))
                .expect("appimage launcher"),
            paths::Launcher::native(appimage)
        );
        let env = std::collections::HashMap::from([(
            "FLATPAK_ID".to_string(),
            "com.eliotBenitezhvat.nevo".to_string(),
        )]);
        let launcher = paths::resolve_launcher(&env, std::path::Path::new("/app/bin/nevo"))
            .expect("flatpak launcher");
        assert_eq!(launcher.command, "flatpak");
        assert_eq!(
            launcher.args.last().map(String::as_str),
            Some("--mcp-server")
        );
    }

    #[test]
    fn rejects_a_relative_user_profile_directory() {
        let env = HashMap::from([("HOME".to_string(), "relative-home".to_string())]);
        assert!(paths::config_path(Agent::Codex, &env).is_err());
    }

    #[test]
    fn uses_codex_home_override_and_windows_profile_precedence() {
        let codex_home = temp_path("custom-codex-home");
        std::fs::create_dir_all(&codex_home).expect("Codex home");
        let env = HashMap::from([
            ("HOME".to_string(), "/home/unix".to_string()),
            ("USERPROFILE".to_string(), "/users/windows".to_string()),
            (
                "CODEX_HOME".to_string(),
                codex_home.to_string_lossy().into_owned(),
            ),
        ]);
        assert_eq!(
            paths::config_path_for(Agent::Codex, &env, "linux").expect("Codex path"),
            codex_home.join("config.toml")
        );
        assert_eq!(
            paths::config_path_for(Agent::ClaudeCode, &env, "windows").expect("Claude path"),
            std::path::PathBuf::from("/users/windows/.claude.json")
        );
    }

    #[test]
    fn rejects_a_missing_codex_home_override() {
        let missing = temp_path("missing-codex-home");
        let env = HashMap::from([
            ("HOME".to_string(), "/home/unix".to_string()),
            (
                "CODEX_HOME".to_string(),
                missing.to_string_lossy().into_owned(),
            ),
        ]);
        assert!(paths::config_path_for(Agent::Codex, &env, "linux").is_err());
    }

    #[test]
    fn rejects_a_release_executable_in_the_build_tree() {
        let checkout = std::path::Path::new("/work/nevo/src-tauri");
        let executable = checkout.join("target/release/nevo");
        assert!(paths::is_development_executable(&executable, checkout));
        assert!(!paths::is_development_executable(
            std::path::Path::new("/usr/bin/nevo"),
            checkout
        ));
    }
}
