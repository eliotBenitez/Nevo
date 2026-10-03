use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

use crate::commands::path_utils::write_atomic;
use crate::logging::{logger, resolve_logs_dir, LogContext, LogError};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecentWorkspace {
    pub id: String,
    pub name: String,
    pub glyph: String,
    pub gradient: String,
    pub path: String,
    #[serde(rename = "lastOpened")]
    pub last_opened: String,
    #[serde(rename = "pageCount")]
    pub page_count: u32,
    pub pinned: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(rename = "storageId", default, skip_serializing_if = "Option::is_none")]
    pub storage_id: Option<String>,
    #[serde(
        rename = "unreadCount",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub unread_count: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(default = "default_config_version")]
    pub version: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_locale")]
    pub locale: String,
    #[serde(default)]
    pub recents: Vec<RecentWorkspace>,
    #[serde(rename = "interfaceDensity", default = "default_interface_density")]
    pub interface_density: String,
    #[serde(rename = "reducedMotion", default = "default_reduced_motion")]
    pub reduced_motion: String,
    #[serde(
        rename = "scrollbarVisibility",
        default = "default_scrollbar_visibility"
    )]
    pub scrollbar_visibility: String,
    #[serde(rename = "focusRingStyle", default = "default_focus_ring_style")]
    pub focus_ring_style: String,
    #[serde(rename = "windowChromeStyle", default = "default_window_chrome_style")]
    pub window_chrome_style: String,
    // Onboarding state (tour status, first-steps checklist progress) is owned
    // and validated entirely by the TypeScript normalizer
    // (`src/utils/workspace-settings/normalizers.ts`); the Rust side only
    // needs to round-trip it opaquely without dropping or reshaping it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onboarding: Option<serde_json::Value>,
    // Appearance fields validated by the TypeScript normalizer. Declared so a
    // save does not drop them; values are round-tripped as written.
    #[serde(
        rename = "interfaceZoom",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub interface_zoom: Option<f64>,
    #[serde(
        rename = "reduceTransparency",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub reduce_transparency: Option<bool>,
    #[serde(
        rename = "interfaceRoundness",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub interface_roundness: Option<String>,
    #[serde(
        rename = "themeSchedule",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub theme_schedule: Option<serde_json::Value>,
    // Any field a newer frontend adds before this struct learns about it.
    // Without this catch-all, serde silently drops unknown keys on save.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            version: default_config_version(),
            theme: default_theme(),
            locale: default_locale(),
            recents: vec![],
            interface_density: default_interface_density(),
            reduced_motion: default_reduced_motion(),
            scrollbar_visibility: default_scrollbar_visibility(),
            focus_ring_style: default_focus_ring_style(),
            window_chrome_style: default_window_chrome_style(),
            onboarding: None,
            interface_zoom: None,
            reduce_transparency: None,
            interface_roundness: None,
            theme_schedule: None,
            extra: serde_json::Map::new(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AppMetadata {
    pub version: String,
    pub engine: String,
    pub runtime: String,
    pub platform: String,
    #[serde(rename = "appDataDir")]
    pub app_data_dir: String,
    #[serde(rename = "configPath")]
    pub config_path: String,
    #[serde(rename = "logsPath")]
    pub logs_path: String,
    #[serde(rename = "supportsWindowControls")]
    pub supports_window_controls: bool,
    #[serde(rename = "supportsGlobalShortcuts")]
    pub supports_global_shortcuts: bool,
    #[serde(rename = "supportsRevealInFileManager")]
    pub supports_reveal_in_file_manager: bool,
    #[serde(rename = "supportsWindowDragRegions")]
    pub supports_window_drag_regions: bool,
    #[serde(rename = "supportsNotebookLifecycleEvents")]
    pub supports_notebook_lifecycle_events: bool,
}

fn default_config_version() -> String {
    "1".to_string()
}
fn default_theme() -> String {
    "system".to_string()
}
fn default_locale() -> String {
    "ru".to_string()
}
fn default_interface_density() -> String {
    "comfortable".to_string()
}
fn default_reduced_motion() -> String {
    "system".to_string()
}
fn default_scrollbar_visibility() -> String {
    "hidden".to_string()
}
fn default_focus_ring_style() -> String {
    "accent".to_string()
}
fn default_window_chrome_style() -> String {
    "default".to_string()
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

#[tauri::command]
pub fn load_app_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
    let logger = logger();
    let path = config_path(&app)?;
    if !path.exists() {
        let _ = logger.warn(
            "tauri.config",
            "load_app_config",
            "App config missing, using defaults",
            false,
            LogContext::default().with_payload(serde_json::json!({
                "configPath": path.to_string_lossy(),
            })),
        );
        return Ok(AppConfig::default());
    }
    let content = std::fs::read_to_string(&path).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.config",
            "load_app_config",
            "Failed to read app config",
            LogContext::default()
                .with_error(LogError {
                    kind: Some("io".to_string()),
                    message: message.clone(),
                    details: None,
                })
                .with_payload(serde_json::json!({
                    "configPath": path.to_string_lossy(),
                })),
        );
        message
    })?;
    serde_json::from_str(&content).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.config",
            "load_app_config",
            "Failed to parse app config",
            LogContext::default()
                .with_error(LogError {
                    kind: Some("serde".to_string()),
                    message: message.clone(),
                    details: None,
                })
                .with_payload(serde_json::json!({
                    "configPath": path.to_string_lossy(),
                })),
        );
        message
    })
}

#[tauri::command]
pub fn save_app_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let logger = logger();
    let path = config_path(&app)?;
    let content = serde_json::to_string_pretty(&config).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.config",
            "save_app_config",
            "Failed to serialize app config",
            LogContext::default().with_error(LogError {
                kind: Some("serde".to_string()),
                message: message.clone(),
                details: None,
            }),
        );
        message
    })?;
    write_atomic(&path, content.as_bytes()).map_err(|error| {
        let message = error.to_string();
        let _ = logger.error(
            "tauri.config",
            "save_app_config",
            "Failed to write app config",
            LogContext::default()
                .with_error(LogError {
                    kind: Some("io".to_string()),
                    message: message.clone(),
                    details: None,
                })
                .with_payload(serde_json::json!({
                    "configPath": path.to_string_lossy(),
                    "recentsCount": config.recents.len(),
                })),
        );
        message
    })?;
    let _ = logger.debug(
        "tauri.config",
        "save_app_config",
        "Saved app config",
        false,
        LogContext::default().with_payload(serde_json::json!({
            "configPath": path.to_string_lossy(),
            "recentsCount": config.recents.len(),
        })),
    );
    Ok(())
}

#[tauri::command]
pub fn get_app_metadata(app: tauri::AppHandle) -> Result<AppMetadata, String> {
    let logger = logger();
    let config_path = config_path(&app)?;
    let app_data_dir = config_path
        .parent()
        .ok_or_else(|| "Unable to resolve app data directory".to_string())?;
    let logs_path = resolve_logs_dir(&app)?;

    let _ = logger.debug(
        "tauri.config",
        "get_app_metadata",
        "Resolved app metadata",
        false,
        LogContext::default().with_payload(serde_json::json!({
            "configPath": config_path.to_string_lossy(),
            "logsPath": logs_path.to_string_lossy(),
        })),
    );

    Ok(AppMetadata {
        version: env!("CARGO_PKG_VERSION").to_string(),
        engine: "Tauri 2".to_string(),
        runtime: if cfg!(any(target_os = "android", target_os = "ios")) {
            std::env::consts::OS.to_string()
        } else {
            "desktop".to_string()
        },
        platform: std::env::consts::OS.to_string(),
        app_data_dir: app_data_dir.to_string_lossy().into_owned(),
        config_path: config_path.to_string_lossy().into_owned(),
        logs_path: logs_path.to_string_lossy().into_owned(),
        supports_window_controls: cfg!(desktop),
        supports_global_shortcuts: cfg!(desktop),
        supports_reveal_in_file_manager: cfg!(desktop),
        supports_window_drag_regions: cfg!(desktop),
        supports_notebook_lifecycle_events:
            crate::mobile_lifecycle::supports_notebook_lifecycle_events(),
    })
}

#[cfg(test)]
mod tests {
    use super::AppConfig;

    #[test]
    fn app_config_without_onboarding_still_loads_with_none() {
        let json = r#"{
            "version": "1",
            "theme": "system",
            "locale": "ru",
            "recents": [],
            "interfaceDensity": "comfortable",
            "reducedMotion": "system",
            "scrollbarVisibility": "hidden",
            "focusRingStyle": "accent",
            "windowChromeStyle": "default"
        }"#;

        let config: AppConfig =
            serde_json::from_str(json).expect("config without onboarding should deserialize");
        assert!(config.onboarding.is_none());

        let serialized = serde_json::to_value(&config).expect("config should serialize");
        assert!(
            serialized.get("onboarding").is_none(),
            "onboarding should be omitted from the serialized output when absent"
        );
    }

    #[test]
    fn app_config_with_onboarding_round_trips_unchanged() {
        let onboarding = serde_json::json!({
            "tourStatus": "completed",
            "firstSteps": ["createWorkspace", "takeTour"],
            "firstStepsHidden": true
        });
        let json = serde_json::json!({
            "version": "1",
            "theme": "system",
            "locale": "ru",
            "recents": [],
            "interfaceDensity": "comfortable",
            "reducedMotion": "system",
            "scrollbarVisibility": "hidden",
            "focusRingStyle": "accent",
            "windowChromeStyle": "default",
            "onboarding": onboarding.clone(),
        });

        let config: AppConfig =
            serde_json::from_value(json).expect("config with onboarding should deserialize");
        assert_eq!(config.onboarding, Some(onboarding.clone()));

        let serialized = serde_json::to_value(&config).expect("config should serialize");
        assert_eq!(serialized.get("onboarding"), Some(&onboarding));
    }

    #[test]
    fn app_config_round_trips_appearance_and_unknown_fields() {
        let json = serde_json::json!({
            "version": "1",
            "theme": "dark",
            "locale": "ru",
            "recents": [],
            "interfaceDensity": "compact",
            "reducedMotion": "reduce",
            "scrollbarVisibility": "thin",
            "focusRingStyle": "high-contrast",
            "windowChromeStyle": "minimal",
            "interfaceZoom": 1.25,
            "reduceTransparency": true,
            "interfaceRoundness": "sharp",
            "themeSchedule": { "enabled": true, "lightTime": "07:00", "darkTime": "20:00" },
            "futureSetting": { "nested": [1, 2] }
        });

        let config: AppConfig =
            serde_json::from_value(json.clone()).expect("full config should deserialize");
        assert_eq!(config.interface_zoom, Some(1.25));
        assert_eq!(config.reduce_transparency, Some(true));
        assert_eq!(config.interface_roundness.as_deref(), Some("sharp"));

        let serialized = serde_json::to_value(&config).expect("config should serialize");
        assert_eq!(serialized, json);
    }

    #[test]
    fn app_config_round_trips_notebook_palette_unchanged() {
        let json = serde_json::json!({
            "version": "1",
            "theme": "system",
            "locale": "en",
            "recents": [],
            "interfaceDensity": "comfortable",
            "reducedMotion": "system",
            "scrollbarVisibility": "hidden",
            "focusRingStyle": "accent",
            "windowChromeStyle": "default",
            "notebookPalette": {
                "presets": ["#abcdef", "#123456"],
                "recents": ["#dc2626", "#000000"]
            }
        });

        let config: AppConfig =
            serde_json::from_value(json.clone()).expect("config with palette should deserialize");
        assert_eq!(
            config.extra.get("notebookPalette"),
            json.get("notebookPalette")
        );

        let serialized = serde_json::to_value(&config).expect("config should serialize");
        assert_eq!(serialized, json);
    }

    #[test]
    fn app_config_default_has_no_onboarding() {
        assert!(AppConfig::default().onboarding.is_none());
    }
}
