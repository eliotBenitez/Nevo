// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(desktop)]
    if std::env::args().nth(1).as_deref() == Some("--mcp-server") {
        if let Err(error) = nevo_lib::mcp_stdio::run() {
            eprintln!("Nevo MCP server failed: {error}");
            std::process::exit(1);
        }
        return;
    }
    nevo_lib::run()
}
