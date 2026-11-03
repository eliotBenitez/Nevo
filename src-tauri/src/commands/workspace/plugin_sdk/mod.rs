mod assets;
mod code;
mod network;
mod registry;
mod storage;

pub use assets::*;
pub use code::*;
pub use network::*;
pub use registry::*;
pub use storage::*;

static USE_HTTPS_SCHEME: std::sync::OnceLock<bool> = std::sync::OnceLock::new();

/// Mirrors the main window's `useHttpsScheme` (set once at startup), which switches
/// WebView2/Android custom schemes to `https://<scheme>.localhost`. The CSP in
/// `tauri.conf.json` lists the `http` form and must be updated if this is enabled.
pub fn set_custom_scheme_https(enabled: bool) {
    let _ = USE_HTTPS_SCHEME.set(enabled);
}

/// URL for a Nevo custom scheme as the webview loads it. WebView2 and Android
/// WebView only route custom schemes through `http(s)://<scheme>.localhost`.
pub(crate) fn custom_scheme_url(scheme: &str, path: &str) -> String {
    if cfg!(any(windows, target_os = "android")) {
        let protocol = if USE_HTTPS_SCHEME.get().copied().unwrap_or(false) {
            "https"
        } else {
            "http"
        };
        format!("{protocol}://{scheme}.localhost/{path}")
    } else {
        format!("{scheme}://{path}")
    }
}

/// Strips the scheme from a protocol-handler request URI. wry hands Windows and
/// Android requests over as `<scheme>://localhost/<path>` after undoing its
/// `http://<scheme>.localhost` workaround; macOS/Linux keep `<scheme>://<path>`.
pub(crate) fn strip_custom_scheme<'a>(uri: &'a str, scheme: &str) -> Option<&'a str> {
    let rest = uri.strip_prefix(scheme)?.strip_prefix("://")?;
    Some(rest.strip_prefix("localhost/").unwrap_or(rest))
}

#[cfg(test)]
mod scheme_tests {
    use super::*;

    #[test]
    fn strips_both_handler_uri_forms() {
        let token = "0123456789abcdef0123456789abcdef";
        let scheme_form = format!("nevoplugin://{token}/index.js");
        let localhost_form = format!("nevoplugin://localhost/{token}/index.js");
        let expected = format!("{token}/index.js");
        assert_eq!(
            strip_custom_scheme(&scheme_form, "nevoplugin"),
            Some(expected.as_str())
        );
        assert_eq!(
            strip_custom_scheme(&localhost_form, "nevoplugin"),
            Some(expected.as_str())
        );
        assert_eq!(
            strip_custom_scheme("nevoplugin-asset://t/a", "nevoplugin"),
            None
        );
        assert_eq!(
            strip_custom_scheme("http://nevoplugin.localhost/t/a", "nevoplugin"),
            None
        );
    }

    #[test]
    fn builds_the_platform_url_form() {
        let url = custom_scheme_url("nevoplugin", "tok/index.js");
        if cfg!(any(windows, target_os = "android")) {
            assert_eq!(url, "http://nevoplugin.localhost/tok/index.js");
        } else {
            assert_eq!(url, "nevoplugin://tok/index.js");
        }
    }
}
