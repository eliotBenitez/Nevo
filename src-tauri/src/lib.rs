mod collab;
mod commands;
mod logging;
mod media_server;

use commands::{
    ai, auth, config, database, folder, fonts, github_sync, graph, kanban, kanban_ops, note,
    notion_import, system, templates, typst_export, workspace,
};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, WindowEvent};

/// Emitted to the frontend when the OS/user requests a window close. The default
/// close is prevented until the frontend flushes pending writes and calls
/// `allow_app_close`, so quitting can never drop the last edits sitting in an
/// autosave / Y.Doc debounce window.
const CLOSE_REQUESTED_EVENT: &str = "nevo://close-requested";

/// Gate that lets the app distinguish a user-initiated close (must flush first)
/// from the programmatic re-close issued by `allow_app_close` after the flush.
struct CloseGuard {
    allowed: AtomicBool,
}

/// Marks the pending close as safe and closes the window. The subsequent
/// `CloseRequested` sees `allowed = true` and is not intercepted again.
#[tauri::command]
async fn allow_app_close(
    window: tauri::WebviewWindow,
    guard: tauri::State<'_, CloseGuard>,
) -> Result<(), String> {
    guard.allowed.store(true, Ordering::SeqCst);
    window.close().map_err(|error| error.to_string())
}

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

/// Inside an AppImage, WebKitGTK relies on GStreamer for `<video>`/`<audio>`
/// playback, but the generated AppRun does not export the GStreamer plugin
/// paths. WebKit then fails to bring up the media/render pipeline, which shows
/// up as a blank (gray) window unless the user manually exports the paths.
///
/// We point GStreamer at the bundled plugins (copied by the AppImage
/// `bundleMediaFramework` option) before WebKit initializes, so the AppImage is
/// self-contained and works without any manual `export`.
#[cfg(target_os = "linux")]
fn configure_bundled_gstreamer() {
    use std::path::{Path, PathBuf};

    // APPDIR is only set when running from a mounted AppImage.
    let Ok(appdir) = std::env::var("APPDIR") else {
        return;
    };
    let appdir = PathBuf::from(appdir);

    let plugin_dir = [
        "usr/lib/x86_64-linux-gnu/gstreamer-1.0",
        "usr/lib/aarch64-linux-gnu/gstreamer-1.0",
        "usr/lib/gstreamer-1.0",
        "usr/lib64/gstreamer-1.0",
    ]
    .iter()
    .map(|rel| appdir.join(rel))
    .find(|path| path.is_dir());

    let Some(plugin_dir) = plugin_dir else {
        // Nothing was bundled — leave the system defaults untouched.
        return;
    };

    // Force WebKit/GStreamer to use ONLY the bundled plugins so playback works
    // on machines without a system GStreamer install.
    std::env::set_var("GST_PLUGIN_SYSTEM_PATH_1_0", &plugin_dir);
    std::env::set_var("GST_PLUGIN_PATH_1_0", &plugin_dir);

    let scanner = [
        "usr/lib/x86_64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner",
        "usr/lib/aarch64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner",
        "usr/lib/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner",
        "usr/libexec/gstreamer-1.0/gst-plugin-scanner",
    ]
    .iter()
    .map(|rel| appdir.join(rel))
    .find(|path: &PathBuf| Path::is_file(path));

    if let Some(scanner) = scanner {
        std::env::set_var("GST_PLUGIN_SCANNER_1_0", &scanner);
        std::env::set_var("GST_PLUGIN_SCANNER", &scanner);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Must run before WebKitGTK (and therefore GStreamer) is initialized.
    //
    // Note: we intentionally do NOT touch `WEBKIT_DISABLE_DMABUF_RENDERER`.
    // Forcing it on inside the AppImage dropped WebKitGTK to software
    // compositing, which made `backdrop-filter`/translucent layers crawl
    // (the AppImage lagged while `tauri dev` did not). Leaving the DMABUF
    // renderer enabled lets the AppImage use hardware GPU compositing too.
    #[cfg(target_os = "linux")]
    {
        configure_bundled_gstreamer();
    }

    let app = tauri::Builder::default()
        .register_uri_scheme_protocol("nevoasset", |_context, request| {
            commands::path_utils::workspace_asset_response(request.uri().path())
        })
        .register_uri_scheme_protocol("nevoplugin", |_context, request| {
            workspace::plugin_code_response(&request.uri().to_string())
        })
        .register_uri_scheme_protocol("nevoplugin-asset", |_context, request| {
            workspace::plugin_asset_response(&request.uri().to_string())
        })
        .manage(collab::server::CollabAppState::new())
        .manage(github_sync::GithubSyncState::default())
        .manage(typst_export::PdfPreviewCache::default())
        .manage(notion_import::NotionImportState::default())
        .manage(CloseGuard {
            allowed: AtomicBool::new(false),
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<CloseGuard>().allowed.load(Ordering::SeqCst) {
                    return;
                }
                api.prevent_close();
                let _ = window.emit(CLOSE_REQUESTED_EVENT, ());
            }
        })
        .setup(|app| {
            let logger = logging::AppLogger::new(logging::resolve_logs_dir(app.handle())?)?;
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
            // Desktop-only: the loopback server does not fit the mobile sandbox,
            // where assets are served through Tauri's asset protocol instead.
            #[cfg(desktop)]
            {
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
            }

            Ok(())
        })
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            allow_app_close,
            logging::log_frontend_event,
            ai::ai_list_models,
            ai::ai_complete,
            ai::ai_complete_stream,
            auth::start_oauth_loopback,
            auth::secure_store_set,
            auth::secure_store_get,
            auth::secure_store_delete,
            config::load_app_config,
            config::save_app_config,
            config::get_app_metadata,
            database::database_query_records,
            database::database_apply_operations,
            database::database_import_records,
            database::database_read_all_records,
            database::database_create_snapshot,
            database::database_restore_snapshot,
            database::database_delete,
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
            workspace::plugin_create_code_session,
            workspace::plugin_create_staged_code_session,
            workspace::plugin_revoke_code_session,
            workspace::plugin_storage_get,
            workspace::plugin_storage_set,
            workspace::plugin_storage_delete,
            workspace::plugin_storage_snapshot,
            workspace::plugin_asset_write,
            workspace::plugin_asset_read,
            workspace::plugin_asset_delete,
            workspace::plugin_asset_begin_upload,
            workspace::plugin_asset_append_chunk,
            workspace::plugin_asset_finish_upload,
            workspace::plugin_asset_abort_upload,
            workspace::plugin_asset_url,
            workspace::plugin_registry_load,
            workspace::plugin_registry_save,
            workspace::plugin_network_fetch,
            workspace::marketplace_list_plugins,
            workspace::marketplace_install_plugin,
            workspace::marketplace_update_plugin,
            workspace::marketplace_prepare_plugin,
            workspace::marketplace_commit_plugin,
            workspace::marketplace_abort_plugin,
            workspace::marketplace_remove_plugin,
            workspace::marketplace_refresh_cache,
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
            note::list_sidebar_note_previews,
            note::list_note_snapshots,
            note::list_all_note_snapshots,
            note::load_note_snapshot,
            note::restore_note_snapshot,
            note::prune_note_snapshots,
            note::restore_from_trash,
            note::permanently_delete_from_trash,
            note::empty_trash,
            note::import_image_asset,
            note::pick_and_import_asset,
            note::import_clipboard_image_path,
            note::import_asset_from_url,
            note::read_obsidian_vault,
            note::import_vault_asset,
            notion_import::pick_and_scan_notion_export,
            notion_import::import_notion_assets,
            notion_import::release_notion_import,
            note::delete_unreferenced_asset,
            note::save_draw_asset,
            note::read_draw_asset,
            note::read_latest_draw_asset,
            note::open_workspace_asset,
            system::open_workspace_location,
            system::open_app_location,
            system::open_external_url,
            system::pick_workspace_directory,
            media_server::get_media_server_info,
            note::search_workspace_blocks,
            note::export_note_markdown,
            note::export_note_html,
            note::export_note_docx,
            typst_export::export_note_pdf,
            typst_export::export_note_typst_archive,
            typst_export::prepare_note_pdf_preview,
            typst_export::render_note_pdf_preview_pages,
            note::pick_and_read_text_file,
            note::export_draw_file,
            note::save_yjs_state,
            note::load_yjs_state,
            note::delete_yjs_state,
            note::touch_note_updated_at,
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
            github_sync::github_sync_test_connection,
            github_sync::github_sync_now,
            github_sync::github_sync_get_status,
            github_sync::github_sync_start_auto,
            github_sync::github_sync_stop_auto,
        ]);
    app.run(tauri::generate_context!())
        .expect("error while running tauri application");
}
