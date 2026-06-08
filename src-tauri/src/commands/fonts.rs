#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        use std::process::Command;
        match Command::new("fc-list").args([":", "family"]).output() {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let mut families: Vec<String> = stdout
                    .lines()
                    .flat_map(|line| line.split(','))
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                families.sort_unstable();
                families.dedup();
                families
            }
            Err(_) => vec![],
        }
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        match Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(New-Object System.Drawing.Text.InstalledFontCollection).Families.Name",
            ])
            .output()
        {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let mut families: Vec<String> = stdout
                    .lines()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                families.sort_unstable();
                families.dedup();
                families
            }
            Err(_) => vec![],
        }
    }
}
