use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::Agent;

const APP_ID: &str = "com.eliotBenitezhvat.nevo";

pub fn is_managed_launcher(command: &str, args: &[String]) -> bool {
    args == ["--mcp-server"]
        || (command == "flatpak" && args == ["run", "--command=nevo", APP_ID, "--mcp-server"])
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Launcher {
    pub command: String,
    pub args: Vec<String>,
}

impl Launcher {
    pub fn native(path: PathBuf) -> Self {
        Self {
            command: path.to_string_lossy().into_owned(),
            args: vec!["--mcp-server".to_string()],
        }
    }
}

pub fn resolve_launcher(
    env: &HashMap<String, String>,
    executable: &Path,
) -> Result<Launcher, String> {
    if env.get("FLATPAK_ID").is_some_and(|value| value == APP_ID) {
        return Ok(Launcher {
            command: "flatpak".to_string(),
            args: vec![
                "run".to_string(),
                "--command=nevo".to_string(),
                APP_ID.to_string(),
                "--mcp-server".to_string(),
            ],
        });
    }
    if let Some(appimage) = env.get("APPIMAGE") {
        let path = PathBuf::from(appimage);
        if path.is_absolute() && path.is_file() {
            return Ok(Launcher::native(path));
        }
        return Err("AppImage path is unavailable".to_string());
    }
    if executable.is_absolute() && executable.is_file() {
        return Ok(Launcher::native(executable.to_path_buf()));
    }
    Err("Installed Nevo executable is unavailable".to_string())
}

pub fn config_path(agent: Agent, env: &HashMap<String, String>) -> Result<PathBuf, String> {
    config_path_for(agent, env, std::env::consts::OS)
}

pub fn config_path_for(
    agent: Agent,
    env: &HashMap<String, String>,
    platform: &str,
) -> Result<PathBuf, String> {
    let profile = if platform == "windows" {
        env.get("USERPROFILE").or_else(|| env.get("HOME"))
    } else {
        env.get("HOME").or_else(|| env.get("USERPROFILE"))
    }
    .ok_or_else(|| "User profile directory is unavailable".to_string())?;
    let home = PathBuf::from(profile);
    if !home.is_absolute() {
        return Err("User profile directory is invalid".to_string());
    }
    let path = match agent {
        Agent::Codex => {
            let codex_home = env
                .get("CODEX_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(".codex"));
            if !codex_home.is_absolute() {
                return Err("Codex home directory is invalid".to_string());
            }
            if env.contains_key("CODEX_HOME") && !codex_home.is_dir() {
                return Err("Codex home directory is unavailable".to_string());
            }
            codex_home.join("config.toml")
        }
        Agent::ClaudeCode => home.join(".claude.json"),
    };
    Ok(path)
}

pub fn is_development_executable(executable: &Path, checkout: &Path) -> bool {
    executable.starts_with(checkout)
}
