// Tauri commands for secret persistence, plus the keychain-vs-file policy.
//
// The OS keychain is the store of record. The pre-keychain plaintext file is
// consulted only as a migration source: a secret found there is copied into
// the keychain and then removed from disk, so an upgrading install ends up
// with nothing sensitive left in the app config dir. On a system with no
// usable keychain the file remains the primary store, unchanged.
//
// The commands are async and do their work on a blocking thread: keychain
// access is IPC to another process (DBus / Credential Manager / Security
// framework) and must not run on the webview main thread.

use std::path::PathBuf;
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

use super::keychain_store;
use super::secret_store::{FileSecretStore, SecretStore, SECRETS_FILE_NAME};

struct Stores {
    primary: Box<dyn SecretStore>,
    /// Legacy plaintext file — present only when the keychain took over as
    /// primary and an old file is still on disk.
    legacy: Option<FileSecretStore>,
}

fn secrets_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(SECRETS_FILE_NAME))
}

fn resolve(app: &AppHandle) -> Result<Stores, String> {
    let path = secrets_file_path(app)?;
    let stores = match keychain_store::open() {
        Some(primary) => {
            let file = FileSecretStore::new(path);
            let legacy = if file.exists() { Some(file) } else { None };
            Stores { primary, legacy }
        }
        None => Stores {
            primary: Box::new(FileSecretStore::new(path)),
            legacy: None,
        },
    };
    log_backend_once(stores.primary.name());
    Ok(stores)
}

/// Report the active backend once per process, so a bug report can tell a
/// keychain install from one that fell back to the file.
fn log_backend_once(name: &str) {
    static LOGGED: OnceLock<()> = OnceLock::new();
    LOGGED.get_or_init(|| {
        eprintln!("nevo: secret store backend = {name}");
    });
}

/// Read through to the legacy store, migrating any hit into the primary one.
/// A failed migration is reported but never loses the secret: the file copy
/// stays until the keychain has definitely accepted it.
///
/// When both stores hold a value and the two disagree, the file wins. That
/// looks backwards for a store we are migrating *away* from, but it is the
/// only ordering the two copies can have: migration removes the file entry as
/// soon as the keychain accepts it, so a file entry that coexists with a
/// keychain one must have been written afterwards — by a build with no
/// keychain support (an older release, a rollback, a second checkout). Letting
/// the stale keychain copy win instead silently swaps the user's identity, and
/// for `e2e.privateKey` that costs them access to every encrypted storage.
fn get_migrating(
    primary: &dyn SecretStore,
    legacy: Option<&dyn SecretStore>,
    key: &str,
) -> Result<Option<String>, String> {
    let current = primary.get(key)?;
    let Some(legacy) = legacy else {
        return Ok(current);
    };
    let stored = legacy.get(key)?;

    match (current, stored) {
        (value, None) => Ok(value),
        (None, Some(value)) => {
            adopt(primary, legacy, key, &value);
            Ok(Some(value))
        }
        (Some(current), Some(value)) if current == value => {
            // Same secret in both places: a previous migration wrote the
            // keychain but could not clear the file. Retry the cleanup.
            if let Err(e) = legacy.delete(key) {
                eprintln!("nevo: could not clear the redundant file copy of {key}: {e}");
            }
            Ok(Some(value))
        }
        (Some(_), Some(value)) => {
            eprintln!(
                "nevo: secret {key} differs between the keychain and the app-config file; \
                 taking the file copy, which a build without keychain support wrote later"
            );
            adopt(primary, legacy, key, &value);
            Ok(Some(value))
        }
    }
}

/// Move a secret into the primary store, clearing the legacy copy only once
/// the primary has definitely accepted it.
fn adopt(primary: &dyn SecretStore, legacy: &dyn SecretStore, key: &str, value: &str) {
    match primary.set(key, value) {
        Ok(()) => {
            if let Err(e) = legacy.delete(key) {
                eprintln!("nevo: migrated secret {key} but could not clear its file copy: {e}");
            }
        }
        Err(e) => {
            eprintln!("nevo: could not migrate secret {key} into the keychain: {e}");
        }
    }
}

/// Write to the primary store, then drop any stale plaintext copy so a
/// re-login does not leave the old value readable on disk.
fn set_migrating(
    primary: &dyn SecretStore,
    legacy: Option<&dyn SecretStore>,
    key: &str,
    value: &str,
) -> Result<(), String> {
    primary.set(key, value)?;
    if let Some(legacy) = legacy {
        if let Err(e) = legacy.delete(key) {
            eprintln!("nevo: could not clear the file copy of secret {key}: {e}");
        }
    }
    Ok(())
}

/// Delete from both stores. The primary's result decides the outcome; a
/// leftover file entry would otherwise resurrect a "deleted" secret.
fn delete_migrating(
    primary: &dyn SecretStore,
    legacy: Option<&dyn SecretStore>,
    key: &str,
) -> Result<(), String> {
    let result = primary.delete(key);
    if let Some(legacy) = legacy {
        if let Err(e) = legacy.delete(key) {
            eprintln!("nevo: could not clear the file copy of secret {key}: {e}");
        }
    }
    result
}

/// Run store work off the webview main thread.
async fn run<T, F>(task: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|e| format!("secure store task failed: {e}"))?
}

fn legacy_ref(stores: &Stores) -> Option<&dyn SecretStore> {
    stores.legacy.as_ref().map(|f| f as &dyn SecretStore)
}

#[tauri::command]
pub async fn secure_store_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    run(move || {
        let stores = resolve(&app)?;
        set_migrating(stores.primary.as_ref(), legacy_ref(&stores), &key, &value)
    })
    .await
}

#[tauri::command]
pub async fn secure_store_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    run(move || {
        let stores = resolve(&app)?;
        get_migrating(stores.primary.as_ref(), legacy_ref(&stores), &key)
    })
    .await
}

#[tauri::command]
pub async fn secure_store_delete(app: AppHandle, key: String) -> Result<(), String> {
    run(move || {
        let stores = resolve(&app)?;
        delete_migrating(stores.primary.as_ref(), legacy_ref(&stores), &key)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Two independent file stores stand in for (keychain, legacy file): the
    /// policy only depends on the trait, not on which backend is behind it.
    fn pair() -> (FileSecretStore, FileSecretStore, PathBuf) {
        let dir = std::env::temp_dir().join(format!("nevo_migrate_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        (
            FileSecretStore::new(dir.join("primary.json")),
            FileSecretStore::new(dir.join(SECRETS_FILE_NAME)),
            dir,
        )
    }

    #[test]
    fn get_reads_the_primary_store_when_no_file_copy_exists() {
        let (primary, _legacy, dir) = pair();
        primary.set("k", "only").unwrap();
        assert_eq!(
            get_migrating(&primary, None, "k").unwrap(),
            Some("only".to_string())
        );
        let _ = fs::remove_dir_all(dir);
    }

    /// The regression that cost a live user access to a cloud storage: a build
    /// without keychain support wrote a *newer* key into the file, and the
    /// stale keychain copy shadowed it.
    #[test]
    fn a_conflicting_file_copy_wins_and_replaces_the_primary() {
        let (primary, legacy, dir) = pair();
        primary.set("e2e.privateKey", "stale-key").unwrap();
        legacy.set("e2e.privateKey", "current-key").unwrap();

        let got = get_migrating(&primary, Some(&legacy), "e2e.privateKey").unwrap();
        assert_eq!(
            got,
            Some("current-key".to_string()),
            "the later file copy must win"
        );
        assert_eq!(
            primary.get("e2e.privateKey").unwrap(),
            Some("current-key".to_string()),
            "the keychain must be corrected, not left stale"
        );
        assert_eq!(legacy.get("e2e.privateKey").unwrap(), None);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn an_identical_file_copy_is_cleaned_up() {
        let (primary, legacy, dir) = pair();
        primary.set("k", "same").unwrap();
        legacy.set("k", "same").unwrap();

        assert_eq!(
            get_migrating(&primary, Some(&legacy), "k").unwrap(),
            Some("same".to_string())
        );
        assert_eq!(
            legacy.get("k").unwrap(),
            None,
            "a redundant plaintext copy must not survive the read"
        );
        assert_eq!(primary.get("k").unwrap(), Some("same".to_string()));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn get_migrates_a_legacy_secret_and_clears_the_file() {
        let (primary, legacy, dir) = pair();
        legacy.set("e2e.privateKey", "private").unwrap();

        let got = get_migrating(&primary, Some(&legacy), "e2e.privateKey").unwrap();
        assert_eq!(got, Some("private".to_string()));
        assert_eq!(
            primary.get("e2e.privateKey").unwrap(),
            Some("private".to_string()),
            "the secret must land in the primary store"
        );
        assert_eq!(
            legacy.get("e2e.privateKey").unwrap(),
            None,
            "the plaintext copy must not survive migration"
        );
        assert!(
            !dir.join(SECRETS_FILE_NAME).exists(),
            "migrating the last secret must remove the file"
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn get_without_a_legacy_store_reads_only_the_primary() {
        let (primary, _legacy, dir) = pair();
        assert_eq!(get_migrating(&primary, None, "missing").unwrap(), None);
        primary.set("k", "v").unwrap();
        assert_eq!(
            get_migrating(&primary, None, "k").unwrap(),
            Some("v".to_string())
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn set_drops_the_stale_plaintext_copy() {
        let (primary, legacy, dir) = pair();
        legacy.set("auth.refreshToken", "old").unwrap();

        set_migrating(&primary, Some(&legacy), "auth.refreshToken", "fresh").unwrap();
        assert_eq!(
            primary.get("auth.refreshToken").unwrap(),
            Some("fresh".to_string())
        );
        assert_eq!(legacy.get("auth.refreshToken").unwrap(), None);
        let _ = fs::remove_dir_all(dir);
    }

    /// The same migration, but with the real OS credential store as primary.
    /// Ignored by default because CI runners have none; run on a desktop with
    /// `cargo test -- --ignored migrates_into_the_real_keychain`.
    #[test]
    #[ignore = "requires a running OS credential store"]
    fn migrates_into_the_real_keychain() {
        let (_unused, legacy, dir) = pair();
        let primary = keychain_store::open().expect("no usable OS credential store on this system");
        let key = format!("__nevo_test_migrate_{}", uuid::Uuid::new_v4());
        legacy.set(&key, "private-key-material").unwrap();

        let got = get_migrating(primary.as_ref(), Some(&legacy), &key).unwrap();
        assert_eq!(got, Some("private-key-material".to_string()));
        assert_eq!(
            primary.get(&key).unwrap(),
            Some("private-key-material".to_string()),
            "the secret must now live in the OS credential store"
        );
        assert_eq!(legacy.get(&key).unwrap(), None);
        assert!(!dir.join(SECRETS_FILE_NAME).exists());

        primary.delete(&key).unwrap();
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn delete_clears_both_stores() {
        let (primary, legacy, dir) = pair();
        primary.set("k", "v").unwrap();
        legacy.set("k", "v").unwrap();

        delete_migrating(&primary, Some(&legacy), "k").unwrap();
        assert_eq!(primary.get("k").unwrap(), None);
        assert_eq!(
            legacy.get("k").unwrap(),
            None,
            "a deleted secret must not survive in the legacy file"
        );
        let _ = fs::remove_dir_all(dir);
    }
}
