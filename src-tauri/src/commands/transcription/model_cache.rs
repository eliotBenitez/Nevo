//! Holds at most one loaded model, keyed by the file it was loaded from.
//! Generic over the model type so the caching rules are testable without Whisper.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub(crate) struct ModelCache<T> {
    slot: Mutex<Option<(PathBuf, Arc<T>)>>,
}

impl<T> Default for ModelCache<T> {
    fn default() -> Self {
        Self {
            slot: Mutex::new(None),
        }
    }
}

impl<T> ModelCache<T> {
    /// Returns the cached model for `path`, loading it when another (or no) model is cached.
    pub(crate) fn get_or_load(
        &self,
        path: &Path,
        load: impl FnOnce(&Path) -> Result<T, String>,
    ) -> Result<Arc<T>, String> {
        let mut slot = self
            .slot
            .lock()
            .map_err(|_| "model_unavailable".to_string())?;
        if let Some((cached, model)) = slot.as_ref() {
            if cached == path {
                return Ok(Arc::clone(model));
            }
        }
        // Free the previous model before loading the next one to cap peak memory.
        *slot = None;
        let model = Arc::new(load(path)?);
        *slot = Some((path.to_path_buf(), Arc::clone(&model)));
        Ok(model)
    }

    /// Drops the cached model when it was loaded from `path`, freeing its memory.
    pub(crate) fn forget(&self, path: &Path) {
        if let Ok(mut slot) = self.slot.lock() {
            if slot.as_ref().is_some_and(|(cached, _)| cached == path) {
                *slot = None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn counting_loader(loads: &Cell<u32>) -> impl FnOnce(&Path) -> Result<u32, String> + '_ {
        move |_| {
            loads.set(loads.get() + 1);
            Ok(loads.get())
        }
    }

    #[test]
    fn reuses_the_cached_model_for_the_same_path() {
        let cache = ModelCache::default();
        let loads = Cell::new(0);
        let turbo = Path::new("/models/turbo.bin");
        let first = cache.get_or_load(turbo, counting_loader(&loads)).unwrap();
        let second = cache.get_or_load(turbo, counting_loader(&loads)).unwrap();
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(loads.get(), 1);
    }

    #[test]
    fn forgetting_the_cached_path_frees_it_and_forces_a_reload() {
        let cache = ModelCache::default();
        let loads = Cell::new(0);
        let turbo = Path::new("/models/turbo.bin");
        let first = cache.get_or_load(turbo, counting_loader(&loads)).unwrap();
        cache.forget(turbo);
        // Only the caller's handle is left: the cache released its reference.
        assert_eq!(Arc::strong_count(&first), 1);
        cache.get_or_load(turbo, counting_loader(&loads)).unwrap();
        assert_eq!(loads.get(), 2);
    }

    #[test]
    fn forgetting_another_path_keeps_the_cached_model() {
        let cache = ModelCache::default();
        let loads = Cell::new(0);
        let base = Path::new("/models/base.bin");
        let first = cache.get_or_load(base, counting_loader(&loads)).unwrap();
        cache.forget(Path::new("/models/turbo.bin"));
        assert_eq!(Arc::strong_count(&first), 2);
        cache.get_or_load(base, counting_loader(&loads)).unwrap();
        assert_eq!(loads.get(), 1);
    }

    #[test]
    fn a_failed_load_leaves_nothing_cached() {
        let cache = ModelCache::<u32>::default();
        let base = Path::new("/models/base.bin");
        let first = cache.get_or_load(base, |_| Ok(1)).unwrap();
        let turbo = Path::new("/models/turbo.bin");
        assert!(cache
            .get_or_load(turbo, |_| Err("model_unavailable".to_string()))
            .is_err());
        // The previous model was released before the failed load.
        assert_eq!(Arc::strong_count(&first), 1);
    }
}
