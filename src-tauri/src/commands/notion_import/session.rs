use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub(super) struct NotionArchiveSession {
    pub archive_path: PathBuf,
    pub allowed_assets: HashSet<String>,
}

#[derive(Clone, Default)]
pub struct NotionImportState {
    sessions: Arc<Mutex<HashMap<String, NotionArchiveSession>>>,
}

impl NotionImportState {
    pub(super) fn insert(
        &self,
        token: String,
        session: NotionArchiveSession,
    ) -> Result<(), String> {
        self.sessions
            .lock()
            .map_err(|_| "Notion import session store is unavailable".to_string())?
            .insert(token, session);
        Ok(())
    }

    pub(super) fn get(&self, token: &str) -> Result<NotionArchiveSession, String> {
        self.sessions
            .lock()
            .map_err(|_| "Notion import session store is unavailable".to_string())?
            .get(token)
            .cloned()
            .ok_or_else(|| "Notion import session is unknown or expired".to_string())
    }

    pub(super) fn remove(&self, token: &str) -> Result<bool, String> {
        Ok(self
            .sessions
            .lock()
            .map_err(|_| "Notion import session store is unavailable".to_string())?
            .remove(token)
            .is_some())
    }
}
