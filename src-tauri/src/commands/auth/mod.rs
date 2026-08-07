// Desktop-side helpers for OAuth login and secret persistence.
//
// `oauth` owns the one-shot loopback listener the relay redirects to after a
// successful OAuth exchange. `secure_store` owns the Tauri commands that
// persist secrets (the user's E2E private key, the refresh token, plugin
// secret fields); `keychain_store` and `secret_store` are the two backends it
// chooses between.

// The command-bearing modules stay public: `tauri::generate_handler!` resolves
// each command through the module that defines it, so a re-export here would
// not be enough.
mod keychain_store;
pub mod oauth;
mod secret_store;
pub mod secure_store;
