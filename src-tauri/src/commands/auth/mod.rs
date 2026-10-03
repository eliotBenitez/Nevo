// Desktop-side helpers for secret persistence.
//
// `secure_store` owns the Tauri commands that persist secrets (GitHub sync
// tokens, plugin secret fields); `keychain_store` and `secret_store` are the
// two backends it chooses between.

// The command-bearing module stays public: `tauri::generate_handler!` resolves
// each command through the module that defines it, so a re-export here would
// not be enough.
mod keychain_store;
mod secret_store;
pub mod secure_store;
