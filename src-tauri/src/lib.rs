mod collab;
mod commands;
mod logging;
mod media_server;

use commands::{
    auth, config, folder, fonts, graph, kanban, kanban_ops, note, templates, typst_export,
    workspace,
};
#[cfg(target_os = "linux")]
use tauri::Manager;

#[cfg(target_os = "linux")]
fn enable_native_spellcheck(app: &tauri::App) {
    use webkit2gtk::{WebContextExt, WebViewExt};

    let webview_windows = app.webview_windows();
    if webview_windows.is_empty() {
        let logger = logging::logger();
        let _ = logger.warn(
            "tauri.app",
            "spellcheck",
            "No webview windows are available; native spellcheck was not configured",
            false,
            logging::LogContext::default(),
        );
        return;
    }

    for (label, webview_window) in webview_windows {
        if let Err(error) = webview_window.with_webview(move |webview| {
            let Some(context) = webview.inner().context() else {
                let logger = logging::logger();
                let _ = logger.warn(
                    "tauri.app",
                    "spellcheck",
                    "WebKitGTK context is unavailable; native spellcheck was not configured",
                    false,
                    logging::LogContext::default(),
                );
                return;
            };

            context.set_spell_checking_enabled(true);
            context.set_spell_checking_languages(&["ru_RU", "en_US"]);
        }) {
            let logger = logging::logger();
            let _ = logger.warn(
                "tauri.app",
                "spellcheck",
                "Unable to access WebKitGTK webview; native spellcheck was not configured",
                false,
                logging::LogContext::default().with_error(logging::LogError {
                    kind: Some("tauri".to_string()),
                    message: format!("{}: {}", label, error),
                    details: None,
                }),
            );
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(collab::server::CollabAppState::new())
        .setup(|app| {
            let logger = logging::AppLogger::new(logging::resolve_logs_dir(&app.handle())?)?;
            logging::install_global_logger(logger)?;
            let logger = logging::logger();
            let _ = logger.info(
                "tauri.app",
                "app_setup",
                "Application setup completed",
                false,
                logging::LogContext::default(),
            );

            #[cfg(target_os = "linux")]
            enable_native_spellcheck(app);

            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // Start the localhost media streaming server (for <video> playback).
            if let Err(error) = media_server::ensure_started() {
                let _ = logger.error(
                    "tauri.app",
                    "media_server",
                    "Failed to start media server",
                    logging::LogContext::default().with_error(logging::LogError {
                        kind: Some("io".to_string()),
                        message: error,
                        details: None,
                    }),
                );
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            logging::log_frontend_event,
            auth::start_oauth_loopback,
            auth::secure_store_set,
            auth::secure_store_get,
            auth::secure_store_delete,
            config::load_app_config,
            config::save_app_config,
            config::get_app_metadata,
            workspace::create_workspace,
            workspace::open_workspace,
            workspace::save_workspace_manifest,
            workspace::load_workspace_settings,
            workspace::save_workspace_settings,
            workspace::load_custom_css,
            workspace::save_custom_css,
            workspace::list_plugins,
            workspace::validate_plugin_manifest,
            workspace::set_plugin_enabled,
            workspace::get_workspace_diagnostics,
            workspace::prune_workspace_snapshots,
            workspace::cleanup_orphaned_assets,
            templates::template_list,
            templates::template_get,
            templates::template_create,
            templates::template_update,
            templates::template_delete,
            templates::template_create_note,
            folder::create_folder,
            folder::rename_folder,
            folder::delete_folder,
            note::create_note,
            note::load_note,
            note::save_note,
            note::delete_note,
            note::move_note,
            note::list_note_snapshots,
            note::load_note_snapshot,
            note::restore_note_snapshot,
            note::prune_note_snapshots,
            note::restore_from_trash,
            note::permanently_delete_from_trash,
            note::empty_trash,
            note::import_image_asset,
            note::import_asset_by_path,
            note::delete_unreferenced_asset,
            note::open_file_path,
            media_server::get_media_server_info,
            note::search_workspace_blocks,
            note::export_note_markdown,
            note::export_note_html,
            typst_export::export_note_pdf,
            typst_export::export_note_typst_archive,
            typst_export::render_note_pdf_preview,
            note::read_text_file,
            note::save_yjs_state,
            note::load_yjs_state,
            collab::server::start_collab_server,
            collab::server::stop_collab_server,
            collab::server::get_collab_server_info,
            graph::graph_update_note_edges,
            graph::graph_get_backlinks,
            graph::graph_get_outlinks,
            graph::graph_remove_note,
            graph::graph_get_all_edges,
            fonts::list_system_fonts,
            kanban::kanban_list_boards,
            kanban::kanban_create_board,
            kanban::kanban_update_board,
            kanban::kanban_delete_board,
            kanban::kanban_list_cards,
            kanban::kanban_create_card,
            kanban::kanban_update_card,
            kanban::kanban_delete_card,
            kanban_ops::kanban_move_card,
            kanban_ops::kanban_save_board_schema,
        ]);
    app.run(tauri::generate_context!())
        .expect("error while running tauri application");
}
