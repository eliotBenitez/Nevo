use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

const LOG_FILE_NAME: &str = "nevo.log";
const MAX_LOG_FILE_BYTES: u64 = 512 * 1024;
const MAX_LOG_FILES: usize = 5;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
}

impl LogLevel {
    fn is_error(&self) -> bool {
        matches!(self, Self::Error)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LogError {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LogContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<LogError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

impl LogContext {
    pub fn workspace(workspace_path: impl Into<String>) -> Self {
        Self {
            workspace_path: Some(workspace_path.into()),
            ..Self::default()
        }
    }

    pub fn with_workspace_id(mut self, workspace_id: impl Into<String>) -> Self {
        self.workspace_id = Some(workspace_id.into());
        self
    }

    pub fn with_error(mut self, error: LogError) -> Self {
        self.error = Some(error);
        self
    }

    pub fn with_payload(mut self, payload: Value) -> Self {
        self.payload = Some(payload);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRecord {
    pub timestamp: String,
    pub level: LogLevel,
    pub source: String,
    pub event: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<LogError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendLogEntry {
    pub level: LogLevel,
    pub source: String,
    pub event: String,
    pub message: String,
    #[serde(default)]
    pub workspace_path: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub error: Option<LogError>,
    #[serde(default)]
    pub payload: Option<Value>,
    #[serde(default)]
    pub diagnostics_enabled: Option<bool>,
}

pub struct AppLogger {
    log_dir: PathBuf,
    file_name: String,
    max_bytes: u64,
    max_files: usize,
    write_lock: Mutex<()>,
}

static GLOBAL_LOGGER: OnceLock<AppLogger> = OnceLock::new();

pub struct GlobalLogger(Option<&'static AppLogger>);

impl GlobalLogger {
    pub fn log_dir(&self) -> Option<&Path> {
        self.0.map(AppLogger::log_dir)
    }

    pub fn error(
        &self,
        source: &str,
        event: &str,
        message: &str,
        context: LogContext,
    ) -> Result<(), String> {
        match self.0 {
            Some(logger) => logger.error(source, event, message, context),
            None => Ok(()),
        }
    }

    pub fn warn(
        &self,
        source: &str,
        event: &str,
        message: &str,
        diagnostics_enabled: bool,
        context: LogContext,
    ) -> Result<(), String> {
        match self.0 {
            Some(logger) => logger.warn(source, event, message, diagnostics_enabled, context),
            None => Ok(()),
        }
    }

    pub fn info(
        &self,
        source: &str,
        event: &str,
        message: &str,
        diagnostics_enabled: bool,
        context: LogContext,
    ) -> Result<(), String> {
        match self.0 {
            Some(logger) => logger.info(source, event, message, diagnostics_enabled, context),
            None => Ok(()),
        }
    }

    pub fn debug(
        &self,
        source: &str,
        event: &str,
        message: &str,
        diagnostics_enabled: bool,
        context: LogContext,
    ) -> Result<(), String> {
        match self.0 {
            Some(logger) => logger.debug(source, event, message, diagnostics_enabled, context),
            None => Ok(()),
        }
    }

    pub fn write(
        &self,
        level: LogLevel,
        source: &str,
        event: &str,
        message: &str,
        diagnostics_enabled: bool,
        context: LogContext,
    ) -> Result<(), String> {
        match self.0 {
            Some(logger) => {
                logger.write(level, source, event, message, diagnostics_enabled, context)
            }
            None => Ok(()),
        }
    }
}

impl AppLogger {
    pub fn new(log_dir: PathBuf) -> Result<Self, String> {
        Self::new_with_config(
            log_dir,
            LOG_FILE_NAME.to_string(),
            MAX_LOG_FILE_BYTES,
            MAX_LOG_FILES,
        )
    }

    fn new_with_config(
        log_dir: PathBuf,
        file_name: String,
        max_bytes: u64,
        max_files: usize,
    ) -> Result<Self, String> {
        std::fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;
        Ok(Self {
            log_dir,
            file_name,
            max_bytes,
            max_files: max_files.max(1),
            write_lock: Mutex::new(()),
        })
    }

    pub fn log_dir(&self) -> &Path {
        &self.log_dir
    }

    pub fn error(
        &self,
        source: &str,
        event: &str,
        message: &str,
        context: LogContext,
    ) -> Result<(), String> {
        self.write(LogLevel::Error, source, event, message, true, context)
    }

    pub fn warn(
        &self,
        source: &str,
        event: &str,
        message: &str,
        diagnostics_enabled: bool,
        context: LogContext,
    ) -> Result<(), String> {
        self.write(
            LogLevel::Warn,
            source,
            event,
            message,
            diagnostics_enabled,
            context,
        )
    }

    pub fn info(
        &self,
        source: &str,
        event: &str,
        message: &str,
        diagnostics_enabled: bool,
        context: LogContext,
    ) -> Result<(), String> {
        self.write(
            LogLevel::Info,
            source,
            event,
            message,
            diagnostics_enabled,
            context,
        )
    }

    pub fn debug(
        &self,
        source: &str,
        event: &str,
        message: &str,
        diagnostics_enabled: bool,
        context: LogContext,
    ) -> Result<(), String> {
        self.write(
            LogLevel::Debug,
            source,
            event,
            message,
            diagnostics_enabled,
            context,
        )
    }

    pub fn write(
        &self,
        level: LogLevel,
        source: &str,
        event: &str,
        message: &str,
        diagnostics_enabled: bool,
        context: LogContext,
    ) -> Result<(), String> {
        if !level.is_error() && !diagnostics_enabled {
            return Ok(());
        }

        let record = LogRecord {
            timestamp: Utc::now().to_rfc3339(),
            level,
            source: source.to_string(),
            event: event.to_string(),
            message: message.to_string(),
            workspace_path: context.workspace_path,
            workspace_id: context.workspace_id,
            error: context.error,
            payload: context.payload,
        };

        self.write_record(&record)
    }

    fn write_record(&self, record: &LogRecord) -> Result<(), String> {
        let _lock = self
            .write_lock
            .lock()
            .map_err(|_| "Failed to lock logger".to_string())?;
        std::fs::create_dir_all(&self.log_dir).map_err(|error| error.to_string())?;

        let current_path = self.current_file_path();
        let serialized = serde_json::to_string(record).map_err(|error| error.to_string())?;
        let line = format!("{serialized}\n");
        let next_bytes = line.len() as u64;

        let current_size = std::fs::metadata(&current_path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);

        if current_size > 0 && current_size + next_bytes > self.max_bytes {
            self.rotate_files()?;
        }

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.current_file_path())
            .map_err(|error| error.to_string())?;
        file.write_all(line.as_bytes())
            .map_err(|error| error.to_string())
    }

    fn current_file_path(&self) -> PathBuf {
        self.log_dir.join(&self.file_name)
    }

    fn rotated_file_path(&self, index: usize) -> PathBuf {
        self.log_dir.join(format!("{}.{}", self.file_name, index))
    }

    fn rotate_files(&self) -> Result<(), String> {
        if self.max_files <= 1 {
            let current_path = self.current_file_path();
            if current_path.exists() {
                std::fs::remove_file(current_path).map_err(|error| error.to_string())?;
            }
            return Ok(());
        }

        let oldest_path = self.rotated_file_path(self.max_files - 1);
        if oldest_path.exists() {
            std::fs::remove_file(&oldest_path).map_err(|error| error.to_string())?;
        }

        for index in (1..self.max_files - 1).rev() {
            let source = self.rotated_file_path(index);
            if source.exists() {
                std::fs::rename(&source, self.rotated_file_path(index + 1))
                    .map_err(|error| error.to_string())?;
            }
        }

        let current_path = self.current_file_path();
        if current_path.exists() {
            std::fs::rename(current_path, self.rotated_file_path(1))
                .map_err(|error| error.to_string())?;
        }

        Ok(())
    }
}

pub fn resolve_logs_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let log_dir = app_data_dir.join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;
    Ok(log_dir)
}

pub fn install_global_logger(logger: AppLogger) -> Result<(), String> {
    GLOBAL_LOGGER
        .set(logger)
        .map_err(|_| "Logger was already initialized".to_string())
}

pub fn logger() -> GlobalLogger {
    GlobalLogger(GLOBAL_LOGGER.get())
}

#[tauri::command]
pub fn log_frontend_event(entry: FrontendLogEntry) -> Result<(), String> {
    let logger = logger();
    let diagnostics_enabled = entry
        .diagnostics_enabled
        .or_else(|| {
            entry
                .workspace_path
                .as_deref()
                .map(crate::commands::workspace::is_extended_diagnostics_enabled)
        })
        .unwrap_or(false);

    logger.write(
        entry.level,
        &entry.source,
        &entry.event,
        &entry.message,
        diagnostics_enabled,
        LogContext {
            workspace_path: entry.workspace_path,
            workspace_id: entry.workspace_id,
            error: entry.error,
            payload: entry.payload,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use uuid::Uuid;

    fn temp_log_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nevo-logger-{label}-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp log dir");
        dir
    }

    fn read_lines(path: &Path) -> Vec<String> {
        std::fs::read_to_string(path)
            .expect("read log file")
            .lines()
            .map(str::to_string)
            .collect()
    }

    #[test]
    fn initializes_without_workspace() {
        let dir = temp_log_dir("init");
        let logger = AppLogger::new(dir.clone()).expect("create logger");

        assert_eq!(logger.log_dir(), dir.as_path());
        assert!(dir.exists());
    }

    #[test]
    fn writes_errors_even_when_diagnostics_disabled() {
        let dir = temp_log_dir("error");
        let logger = AppLogger::new(dir.clone()).expect("create logger");

        logger
            .error(
                "tauri.workspace",
                "open_workspace",
                "Failed to open workspace",
                LogContext::workspace("/tmp/workspace").with_error(LogError {
                    kind: Some("io".to_string()),
                    message: "missing file".to_string(),
                    details: None,
                }),
            )
            .expect("write error");

        let lines = read_lines(&dir.join(LOG_FILE_NAME));
        assert_eq!(lines.len(), 1);
        let record: LogRecord = serde_json::from_str(&lines[0]).expect("parse log record");
        assert_eq!(record.level, LogLevel::Error);
        assert_eq!(record.event, "open_workspace");
    }

    #[test]
    fn skips_info_and_debug_when_diagnostics_disabled() {
        let dir = temp_log_dir("filtered");
        let logger = AppLogger::new(dir.clone()).expect("create logger");

        logger
            .info(
                "frontend.workspace",
                "hydrate_workspace_state",
                "Hydrating workspace state",
                false,
                LogContext::workspace("/tmp/workspace"),
            )
            .expect("skip info");
        logger
            .debug(
                "frontend.workspace",
                "hydrate_workspace_state",
                "Hydrating workspace state",
                false,
                LogContext::workspace("/tmp/workspace").with_payload(json!({ "phase": "plugins" })),
            )
            .expect("skip debug");

        assert!(!dir.join(LOG_FILE_NAME).exists());
    }

    #[test]
    fn rotates_files_without_breaking_writes() {
        let dir = temp_log_dir("rotate");
        let logger = AppLogger::new_with_config(dir.clone(), LOG_FILE_NAME.to_string(), 180, 3)
            .expect("create logger");

        for index in 0..12 {
            logger
                .info(
                    "frontend.test",
                    "rotation",
                    &format!("Entry {index}"),
                    true,
                    LogContext::default().with_payload(json!({
                        "value": "x".repeat(64),
                        "index": index,
                    })),
                )
                .expect("write rotating record");
        }

        let mut files = std::fs::read_dir(&dir)
            .expect("read log dir")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        files.sort();

        assert!(files.contains(&"nevo.log".to_string()));
        assert!(files.contains(&"nevo.log.1".to_string()));
        assert!(files.contains(&"nevo.log.2".to_string()));
        assert_eq!(files.len(), 3);

        let current_lines = read_lines(&dir.join(LOG_FILE_NAME));
        assert!(!current_lines.is_empty());
    }
}
