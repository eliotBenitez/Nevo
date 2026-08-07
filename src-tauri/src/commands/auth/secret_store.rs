// The secret-store seam and its file-backed implementation.
//
// The file store is the pre-keychain baseline (a plaintext JSON map under the
// app config dir). It survives as (a) the fallback on systems with no usable
// OS credential store, and (b) the migration source for installs that predate
// the keychain backend.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::commands::path_utils::write_atomic;

/// A keyed store of opaque secret strings. Keys are namespaced by the caller
/// (`e2e.privateKey`, `auth.refreshToken`, `<pluginId>.<field>`).
pub trait SecretStore {
    fn get(&self, key: &str) -> Result<Option<String>, String>;
    fn set(&self, key: &str, value: &str) -> Result<(), String>;
    fn delete(&self, key: &str) -> Result<(), String>;
    /// Human-readable backend name, for diagnostics.
    fn name(&self) -> &'static str;
}

// Serializes read-modify-write access to the secrets file so concurrent
// set/delete calls can't interleave and corrupt it (a lost update, since each
// call reads the whole map, mutates it, and writes it back). `write_atomic`
// alone only guarantees a single write can't leave a half-written file; it
// doesn't prevent two writers from racing.
static SECRETS_LOCK: Mutex<()> = Mutex::new(());

pub const SECRETS_FILE_NAME: &str = "secrets.json";

/// Plaintext JSON map on disk. Readable by any process running as the user —
/// which is exactly why the keychain backend exists.
pub struct FileSecretStore {
    path: PathBuf,
}

impl FileSecretStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Whether the backing file exists at all. Used to skip migration work for
    /// the common case of a fresh install.
    pub fn exists(&self) -> bool {
        self.path.exists()
    }

    fn read_map(&self) -> Result<HashMap<String, String>, String> {
        read_map_at(&self.path)
    }

    fn write_map(&self, map: &HashMap<String, String>) -> Result<(), String> {
        // An empty map means nothing is left to protect: drop the file rather
        // than leave an empty husk behind after migration.
        if map.is_empty() {
            return match fs::remove_file(&self.path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(e.to_string()),
            };
        }
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let raw = serde_json::to_string(map).map_err(|e| e.to_string())?;
        write_atomic(&self.path, raw.as_bytes()).map_err(|e| e.to_string())
    }
}

fn read_map_at(path: &Path) -> Result<HashMap<String, String>, String> {
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

impl SecretStore for FileSecretStore {
    fn get(&self, key: &str) -> Result<Option<String>, String> {
        let _guard = SECRETS_LOCK
            .lock()
            .map_err(|_| "secrets lock poisoned".to_string())?;
        Ok(self.read_map()?.get(key).cloned())
    }

    fn set(&self, key: &str, value: &str) -> Result<(), String> {
        let _guard = SECRETS_LOCK
            .lock()
            .map_err(|_| "secrets lock poisoned".to_string())?;
        let mut map = self.read_map()?;
        map.insert(key.to_string(), value.to_string());
        self.write_map(&map)
    }

    fn delete(&self, key: &str) -> Result<(), String> {
        let _guard = SECRETS_LOCK
            .lock()
            .map_err(|_| "secrets lock poisoned".to_string())?;
        let mut map = self.read_map()?;
        if map.remove(key).is_none() {
            return Ok(());
        }
        self.write_map(&map)
    }

    fn name(&self) -> &'static str {
        "file"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store() -> (FileSecretStore, PathBuf) {
        let dir = std::env::temp_dir().join(format!("nevo_secrets_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(SECRETS_FILE_NAME);
        (FileSecretStore::new(path.clone()), path)
    }

    #[test]
    fn missing_file_reads_as_empty() {
        let (store, path) = temp_store();
        assert!(!store.exists());
        assert_eq!(store.get("e2e.privateKey").unwrap(), None);
        // Reading must not create the file.
        assert!(!path.exists());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn set_get_delete_roundtrip() {
        let (store, path) = temp_store();
        store.set("e2e.privateKey", "secret-value").unwrap();
        store.set("auth.refreshToken", "token").unwrap();
        assert_eq!(
            store.get("e2e.privateKey").unwrap(),
            Some("secret-value".to_string())
        );

        store.delete("e2e.privateKey").unwrap();
        assert_eq!(store.get("e2e.privateKey").unwrap(), None);
        // Other keys are untouched, so the file stays.
        assert!(path.exists());
        assert_eq!(
            store.get("auth.refreshToken").unwrap(),
            Some("token".into())
        );
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn removing_the_last_key_removes_the_file() {
        let (store, path) = temp_store();
        store.set("only", "value").unwrap();
        assert!(path.exists());
        store.delete("only").unwrap();
        assert!(
            !path.exists(),
            "an emptied secrets file must not linger on disk"
        );
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn deleting_a_missing_key_is_a_no_op() {
        let (store, path) = temp_store();
        store.delete("never-set").unwrap();
        assert!(!path.exists());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
