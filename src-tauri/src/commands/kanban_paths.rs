use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use super::path_utils::validate_id;

// On Windows std reports name-surrogate reparse points (symlinks and junctions) as
// symlinks, while cloud placeholders (OneDrive), dedup and compressed files are not.
fn is_linked(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

fn validate_unlinked_directory(dir: &Path) -> Result<(), String> {
    match fs::symlink_metadata(dir) {
        Ok(metadata) => {
            if is_linked(&metadata) || !metadata.is_dir() {
                return Err(format!(
                    "Linked or invalid Kanban directory: {}",
                    dir.display()
                ));
            }
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    Ok(())
}

pub(super) fn validate_unlinked_file(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if is_linked(&metadata) || !metadata.is_file() {
        return Err(format!("Linked or invalid Kanban file: {}", path.display()));
    }
    Ok(())
}

pub(super) fn validate_card_identity(
    path: &Path,
    board_id: &str,
    card_id: &str,
    stored_board_id: &str,
) -> Result<(), String> {
    validate_id(card_id)?;
    if path.file_stem().and_then(|name| name.to_str()) != Some(card_id)
        || stored_board_id != board_id
    {
        return Err("Card identity does not match its file or board".to_string());
    }
    Ok(())
}

pub(super) fn validate_boards_directory(workspace_path: &str) -> Result<(), String> {
    let nevo = Path::new(workspace_path).join(".nevo");
    validate_unlinked_directory(&nevo)?;
    validate_unlinked_directory(&nevo.join("boards"))
}

/// Reject links in the path to card files, including Windows directory junctions.
/// Checking the ID alone cannot stop a linked board directory from redirecting IO.
pub(super) fn validate_card_directory(workspace_path: &str, board_id: &str) -> Result<(), String> {
    validate_id(board_id)?;
    validate_boards_directory(workspace_path)?;
    let cards = Path::new(workspace_path)
        .join(".nevo")
        .join("boards")
        .join(board_id);
    validate_unlinked_directory(&cards)
}

/// Deletes a board's card directory. A linked one is unlinked without following it,
/// so a tampered board can still be removed and its target is never touched.
pub(super) fn remove_card_directory(workspace_path: &str, board_id: &str) -> Result<(), String> {
    validate_id(board_id)?;
    validate_boards_directory(workspace_path)?;
    let cards = Path::new(workspace_path)
        .join(".nevo")
        .join("boards")
        .join(board_id);
    let metadata = match fs::symlink_metadata(&cards) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    let result = if !is_linked(&metadata) {
        fs::remove_dir_all(&cards)
    } else if cfg!(windows) {
        // Junctions and directory symlinks are removed as directories on Windows.
        fs::remove_dir(&cards).or_else(|_| fs::remove_file(&cards))
    } else {
        fs::remove_file(&cards)
    };
    result.map_err(|error| error.to_string())
}

pub(super) fn create_card_directory(workspace_path: &str, board_id: &str) -> Result<(), String> {
    validate_card_directory(workspace_path, board_id)?;
    let cards = Path::new(workspace_path)
        .join(".nevo")
        .join("boards")
        .join(board_id);
    fs::create_dir_all(cards).map_err(|error| error.to_string())?;
    validate_card_directory(workspace_path, board_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn a_linked_workspace_root_can_be_the_chosen_workspace() {
        let base = std::env::temp_dir().join(format!("nevo-linked-workspace-{}", Uuid::new_v4()));
        let actual_workspace = base.join("actual");
        let chosen_workspace = base.join("chosen");
        fs::create_dir_all(actual_workspace.join(".nevo/boards/board")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&actual_workspace, &chosen_workspace).unwrap();
        #[cfg(windows)]
        {
            let output = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(&chosen_workspace)
                .arg(&actual_workspace)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "junction creation failed: {output:?}"
            );
        }
        validate_card_directory(&chosen_workspace.to_string_lossy(), "board").unwrap();
        #[cfg(unix)]
        fs::remove_file(chosen_workspace).unwrap();
        #[cfg(windows)]
        fs::remove_dir(chosen_workspace).unwrap();
        fs::remove_dir_all(base).unwrap();
    }
}
