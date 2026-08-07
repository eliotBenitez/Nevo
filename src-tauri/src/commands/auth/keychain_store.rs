// OS credential-store backend: macOS Keychain, Windows Credential Manager,
// Secret Service (gnome-keyring / KWallet) on *nix.
//
// Availability is probed once per process with a real write/read/delete cycle
// rather than trusted from initialization alone: a Secret Service can be
// present on the bus yet locked or unusable, and finding that out on the write
// that stores the user's private key would strand them mid-login. When the
// probe fails the caller keeps the file backend, and secrets stay where they
// already are.
//
// The crate has no Android/iOS backend, so the whole module is desktop-only;
// mobile keeps the file store.

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop {
    use std::sync::OnceLock;

    use keyring::{Entry, Error as KeyringError};

    use super::super::secret_store::SecretStore;

    /// Shown as the credential's service/where in the OS UI.
    const SERVICE: &str = "com.eliotBenitezhvat.nevo";
    /// Canary key for the availability probe; never holds real data.
    const PROBE_KEY: &str = "__nevo_keychain_probe__";

    pub struct KeychainSecretStore;

    impl KeychainSecretStore {
        fn entry(key: &str) -> Result<Entry, String> {
            Entry::new(SERVICE, key).map_err(|e| format!("keychain entry: {e}"))
        }
    }

    impl SecretStore for KeychainSecretStore {
        fn get(&self, key: &str) -> Result<Option<String>, String> {
            match Self::entry(key)?.get_password() {
                Ok(value) => Ok(Some(value)),
                Err(KeyringError::NoEntry) => Ok(None),
                Err(e) => Err(format!("keychain read: {e}")),
            }
        }

        fn set(&self, key: &str, value: &str) -> Result<(), String> {
            Self::entry(key)?
                .set_password(value)
                .map_err(|e| format!("keychain write: {e}"))
        }

        fn delete(&self, key: &str) -> Result<(), String> {
            match Self::entry(key)?.delete_credential() {
                Ok(()) => Ok(()),
                Err(KeyringError::NoEntry) => Ok(()),
                Err(e) => Err(format!("keychain delete: {e}")),
            }
        }

        fn name(&self) -> &'static str {
            "keychain"
        }
    }

    /// Round-trips a canary credential to prove the store actually works.
    fn probe() -> Result<(), String> {
        let store = KeychainSecretStore;
        store.set(PROBE_KEY, "ok")?;
        let read = store.get(PROBE_KEY)?;
        // Best-effort cleanup: a leftover canary is harmless, a failure here
        // does not mean the store is unusable.
        let _ = store.delete(PROBE_KEY);
        if read.as_deref() != Some("ok") {
            return Err("keychain probe read back an unexpected value".to_string());
        }
        Ok(())
    }

    fn available() -> bool {
        static AVAILABLE: OnceLock<bool> = OnceLock::new();
        *AVAILABLE.get_or_init(|| match probe() {
            Ok(()) => true,
            Err(e) => {
                eprintln!(
                    "nevo: OS keychain unavailable ({e}); secrets fall back to the app-config file"
                );
                false
            }
        })
    }

    /// The keychain store, or `None` when this system has no usable one.
    pub fn open() -> Option<Box<dyn SecretStore>> {
        available().then(|| Box::new(KeychainSecretStore) as Box<dyn SecretStore>)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// Exercises the real OS credential store. Ignored by default because
        /// CI runners have no Secret Service; run on a desktop with
        /// `cargo test -- --ignored keychain`.
        #[test]
        #[ignore = "requires a running OS credential store"]
        fn round_trips_against_the_real_store() {
            let store = KeychainSecretStore;
            let key = format!("__nevo_test_{}", uuid::Uuid::new_v4());

            assert_eq!(store.get(&key).unwrap(), None, "unset key must read None");
            store.set(&key, "private-key-material").unwrap();
            assert_eq!(
                store.get(&key).unwrap(),
                Some("private-key-material".to_string())
            );
            store.set(&key, "rotated").unwrap();
            assert_eq!(store.get(&key).unwrap(), Some("rotated".to_string()));

            store.delete(&key).unwrap();
            assert_eq!(store.get(&key).unwrap(), None);
            // Deleting again must not error.
            store.delete(&key).unwrap();
        }
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use desktop::open;

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn open() -> Option<Box<dyn super::secret_store::SecretStore>> {
    None
}
