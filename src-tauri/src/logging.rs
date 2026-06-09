use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use uuid::Uuid;

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

    fn label(&self) -> &'static str {
        match self {
            Self::Error => "ERROR",
            Self::Warn => "WARN",
            Self::Info => "INFO",
            Self::Debug => "DEBUG",
        }
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
    pub trace_id: Option<String>,
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
    pub process_id: u32,
    pub thread: String,
    pub source: String,
    pub trace_id: String,
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
    #[serde(default)]
    pub trace_id: Option<String>,
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

fn generate_trace_id() -> String {
    Uuid::new_v4().simple().to_string()[..8].to_string()
}

fn sanitize_log_text(value: &str) -> String {
    value.replace('\r', "\\r").replace('\n', "\\n")
}

fn context_json(record: &LogRecord) -> Result<Option<String>, String> {
    let mut context = Map::new();

    if !record.event.is_empty() {
        context.insert("event".to_string(), Value::String(record.event.clone()));
    }
    if let Some(workspace_path) = record
        .workspace_path
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        context.insert(
            "workspacePath".to_string(),
            Value::String(workspace_path.clone()),
        );
    }
    if let Some(workspace_id) = record
        .workspace_id
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        context.insert(
            "workspaceId".to_string(),
            Value::String(workspace_id.clone()),
        );
    }
    if let Some(error) = &record.error {
        context.insert(
            "error".to_string(),
            serde_json::to_value(error).map_err(|error| error.to_string())?,
        );
    }
    if let Some(payload) = &record.payload {
        if !payload.is_null() {
            context.insert("payload".to_string(), payload.clone());
        }
    }

    if context.is_empty() {
        return Ok(None);
    }

    serde_json::to_string(&Value::Object(context))
        .map(Some)
        .map_err(|error| error.to_string())
}

fn format_log_line(record: &LogRecord) -> Result<String, String> {
    let base = format!(
        "[{}] [{}] [pid:{}/thread:{}] [{}] [{}] - {}",
        sanitize_log_text(&record.timestamp),
        record.level.label(),
        record.process_id,
        sanitize_log_text(&record.thread),
        sanitize_log_text(&record.source),
        sanitize_log_text(&record.trace_id),
        sanitize_log_text(&record.message)
    );

    match context_json(record)? {
        Some(context) => Ok(format!("{base} {context}")),
        None => Ok(base),
    }
}

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

        let current_thread = std::thread::current();
        let thread = current_thread
            .name()
            .map(str::to_string)
            .unwrap_or_else(|| format!("{:?}", current_thread.id()));
        let record = LogRecord {
            timestamp: Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
            level,
            process_id: std::process::id(),
            thread,
            source: source.to_string(),
            trace_id: context.trace_id.unwrap_or_else(generate_trace_id),
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
        let line = format!("{}\n", format_log_line(record)?);
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
            trace_id: entry.trace_id,
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

    fn assert_timestamp_prefix(line: &str) {
        let timestamp = line
            .strip_prefix('[')
            .and_then(|line| line.split_once(']').map(|(timestamp, _)| timestamp))
            .expect("timestamp prefix");

        assert_eq!(timestamp.len(), 23);
        assert_eq!(&timestamp[4..5], "-");
        assert_eq!(&timestamp[7..8], "-");
        assert_eq!(&timestamp[10..11], " ");
        assert_eq!(&timestamp[13..14], ":");
        assert_eq!(&timestamp[16..17], ":");
        assert_eq!(&timestamp[19..20], ".");
        assert!(timestamp
            .chars()
            .enumerate()
            .all(
                |(index, character)| matches!(index, 4 | 7 | 10 | 13 | 16 | 19)
                    || character.is_ascii_digit()
            ));
    }

    fn trace_id_from_line(line: &str) -> &str {
        line.split("] [")
            .nth(4)
            .and_then(|part| part.split(']').next())
            .expect("trace id")
    }

    fn context_from_line(line: &str) -> Option<Value> {
        let context = line
            .split_once(" {")
            .map(|(_, context)| format!("{{{context}"))?;
        serde_json::from_str(&context).ok()
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
        let line = &lines[0];
        assert_timestamp_prefix(line);
        assert!(line.contains(" [ERROR] "));
        assert!(line.contains("[pid:"));
        assert!(line.contains("/thread:"));
        assert!(line.contains("] [tauri.workspace] ["));
        assert!(line.contains(" - Failed to open workspace "));
        assert_eq!(trace_id_from_line(line).len(), 8);

        let context = context_from_line(line).expect("log context");
        assert_eq!(context["event"], "open_workspace");
        assert_eq!(context["workspacePath"], "/tmp/workspace");
        assert_eq!(context["error"]["kind"], "io");
        assert_eq!(context["error"]["message"], "missing file");
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
    fn writes_compact_context_json() {
        let dir = temp_log_dir("context");
        let logger = AppLogger::new(dir.clone()).expect("create logger");
        let mut context = LogContext::workspace("/tmp/workspace")
            .with_workspace_id("workspace-1")
            .with_error(LogError {
                kind: Some("plugin".to_string()),
                message: "invalid plugin".to_string(),
                details: Some("missing manifest".to_string()),
            })
            .with_payload(json!({ "phase": "plugins" }));
        context.trace_id = Some("trace-123".to_string());

        logger
            .warn(
                "frontend.workspace",
                "load_workspace_plugins",
                "Plugin metadata changed",
                true,
                context,
            )
            .expect("write warning");

        let lines = read_lines(&dir.join(LOG_FILE_NAME));
        assert_eq!(lines.len(), 1);
        let line = &lines[0];

        assert!(line.contains(" [WARN] "));
        assert!(line.contains("] [frontend.workspace] [trace-123] - Plugin metadata changed "));

        let context = context_from_line(line).expect("log context");
        assert_eq!(context["event"], "load_workspace_plugins");
        assert_eq!(context["workspacePath"], "/tmp/workspace");
        assert_eq!(context["workspaceId"], "workspace-1");
        assert_eq!(context["error"]["kind"], "plugin");
        assert_eq!(context["error"]["message"], "invalid plugin");
        assert_eq!(context["error"]["details"], "missing manifest");
        assert_eq!(context["payload"], json!({ "phase": "plugins" }));
    }

    #[test]
    fn omits_empty_context_json() {
        let record = LogRecord {
            timestamp: "2026-06-09 14:23:45.123".to_string(),
            level: LogLevel::Info,
            process_id: 12345,
            thread: "main".to_string(),
            source: "tauri.app".to_string(),
            trace_id: "a1b2c3d4".to_string(),
            event: String::new(),
            message: "Started".to_string(),
            workspace_path: None,
            workspace_id: None,
            error: None,
            payload: None,
        };

        let line = format_log_line(&record).expect("format line");

        assert_eq!(
            line,
            "[2026-06-09 14:23:45.123] [INFO] [pid:12345/thread:main] [tauri.app] [a1b2c3d4] - Started"
        );
        assert!(!line.ends_with(" {}"));
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
