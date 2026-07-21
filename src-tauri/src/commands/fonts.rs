use fontdb::Database;

#[tauri::command]
pub async fn list_system_fonts() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(system_font_families)
        .await
        .unwrap_or_default()
}

fn system_font_families() -> Vec<String> {
    let mut database = Database::new();
    database.load_system_fonts();

    normalize_font_families(
        database
            .faces()
            .flat_map(|face| face.families.iter().map(|(family, _)| family.clone())),
    )
}

fn normalize_font_families(families: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut families = families
        .into_iter()
        .map(|family| family.trim().to_owned())
        .filter(|family| !family.is_empty())
        .collect::<Vec<_>>();
    families.sort_unstable();
    families.dedup();
    families
}

#[cfg(test)]
mod tests {
    use super::normalize_font_families;

    #[test]
    fn normalizes_system_font_families() {
        let families = normalize_font_families([
            "  Inter  ".to_string(),
            String::new(),
            "Arial".to_string(),
            "Inter".to_string(),
        ]);

        assert_eq!(families, ["Arial", "Inter"]);
    }
}
