use std::io::Read;

use zip::read::ZipFile;

/// Validates a ZIP entry name and returns its `/`-joined relative path.
/// `label` ("ZIP" / "Archive") only selects the wording of user-facing errors.
pub(crate) fn normalized_entry_path<R: Read>(
    entry: &ZipFile<'_, R>,
    max_depth: usize,
    label: &str,
) -> Result<String, String> {
    let name = entry
        .name()
        .map_err(|error| format!("{label} entry has an invalid name: {error}"))?;
    if name.contains('\\') {
        return Err(format!(
            "{label} entries with backslash paths are not supported"
        ));
    }
    // zip >= 9 strips a leading root from `enclosed_name` instead of rejecting it.
    let enclosed = entry
        .enclosed_name()
        .filter(|_| !name.starts_with('/'))
        .ok_or_else(|| format!("{label} entry has an unsafe path: {name}"))?;
    let depth = enclosed.components().count();
    if depth == 0 || depth > max_depth {
        return Err(format!(
            "{label} entry exceeds the path depth limit: {name}"
        ));
    }
    Ok(enclosed
        .components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

pub(crate) fn is_symlink<R: Read>(entry: &ZipFile<'_, R>) -> bool {
    entry
        .unix_mode()
        .is_some_and(|mode| mode & 0o170000 == 0o120000)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;
    use zip::{ZipArchive, ZipWriter};

    fn check(name: &str, max_depth: usize) -> Result<String, String> {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .start_file(name, SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"x").unwrap();
        let mut archive =
            ZipArchive::new(Cursor::new(writer.finish().unwrap().into_inner())).unwrap();
        let entry = archive.by_index(0).unwrap();
        normalized_entry_path(&entry, max_depth, "ZIP")
    }

    #[test]
    fn accepts_normal_path() {
        assert_eq!(check("a/b/c.md", 4).unwrap(), "a/b/c.md");
    }

    #[test]
    fn rejects_unsafe_paths() {
        assert!(check("a\\b.md", 4).unwrap_err().contains("backslash"));
        assert!(check("/abs.md", 4).unwrap_err().contains("unsafe"));
        assert!(check("../escape.md", 4).unwrap_err().contains("unsafe"));
        assert!(check("a/b/c/d.md", 3).unwrap_err().contains("depth"));
    }
}
