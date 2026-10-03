#[cfg(target_os = "android")]
use tauri::Emitter;
use tauri::{Runtime, Window, WindowEvent};

#[cfg(any(target_os = "android", test))]
pub const NOTEBOOK_SUSPENDED_EVENT: &str = "nevo://notebook-suspended";
#[cfg(any(target_os = "android", test))]
pub const NOTEBOOK_RESUMED_EVENT: &str = "nevo://notebook-resumed";

pub const fn supports_notebook_lifecycle_events() -> bool {
    cfg!(target_os = "android")
}

pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    #[cfg(target_os = "android")]
    {
        let event_name = match event {
            WindowEvent::Suspended => Some(NOTEBOOK_SUSPENDED_EVENT),
            WindowEvent::Resumed => Some(NOTEBOOK_RESUMED_EVENT),
            _ => None,
        };
        if let Some(event_name) = event_name {
            let _ = window.emit(event_name, ());
        }
    }

    #[cfg(not(target_os = "android"))]
    let _ = (window, event);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_stable_notebook_lifecycle_event_names_and_platform_support() {
        assert_eq!(NOTEBOOK_SUSPENDED_EVENT, "nevo://notebook-suspended");
        assert_eq!(NOTEBOOK_RESUMED_EVENT, "nevo://notebook-resumed");
        assert_eq!(
            supports_notebook_lifecycle_events(),
            cfg!(target_os = "android")
        );
    }
}
