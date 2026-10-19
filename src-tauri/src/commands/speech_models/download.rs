use super::catalog::ModelEntry;
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;

const CANCEL_POLL: Duration = Duration::from_millis(250);
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, PartialEq, Eq)]
pub enum VerifyError {
    /// More bytes than the catalog size arrived.
    TooLarge,
    /// Wrong final size or hash.
    IntegrityFailed,
}

/// Consumes chunks, enforcing the expected size cap and the pinned SHA-256.
pub struct Verifier {
    expected_bytes: u64,
    expected_sha256: &'static str,
    received: u64,
    hasher: Sha256,
}

impl Verifier {
    pub fn new(entry: &ModelEntry) -> Self {
        Self {
            expected_bytes: entry.bytes,
            expected_sha256: entry.sha256,
            received: 0,
            hasher: Sha256::new(),
        }
    }

    pub fn push(&mut self, chunk: &[u8]) -> Result<u64, VerifyError> {
        self.received += chunk.len() as u64;
        if self.received > self.expected_bytes {
            return Err(VerifyError::TooLarge);
        }
        self.hasher.update(chunk);
        Ok(self.received)
    }

    pub fn finish(self) -> Result<(), VerifyError> {
        let digest: String = self
            .hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        if self.received == self.expected_bytes && digest == self.expected_sha256 {
            Ok(())
        } else {
            Err(VerifyError::IntegrityFailed)
        }
    }
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .use_rustls_tls()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "download_failed".to_string())
}

/// Streams the entry into `<dir>/<file>.part`, verifies it and renames it into place.
/// The `.part` file is removed on any failure.
pub async fn download(
    entry: &ModelEntry,
    dir: &Path,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(u64, u64),
) -> Result<(), String> {
    let url = entry.url.ok_or_else(|| "model_bundled".to_string())?;
    let part = dir.join(format!("{}.part", entry.file));
    let result = stream_to_part(entry, url, &part, cancel, &mut on_progress).await;
    let result = match result {
        Ok(()) => tokio::fs::rename(&part, dir.join(entry.file))
            .await
            .map_err(|_| "download_failed".to_string()),
        Err(error) => Err(error),
    };
    if result.is_err() {
        let _ = tokio::fs::remove_file(&part).await;
    }
    result
}

async fn stream_to_part(
    entry: &ModelEntry,
    url: &str,
    part: &Path,
    cancel: &AtomicBool,
    on_progress: &mut impl FnMut(u64, u64),
) -> Result<(), String> {
    let request = client()?.get(url).send();
    tokio::pin!(request);
    // Poll cancel while connecting and waiting for headers too, not only during the body.
    let response = loop {
        if cancel.load(Ordering::Acquire) {
            return Err("download_cancelled".to_string());
        }
        if let Ok(result) = tokio::time::timeout(CANCEL_POLL, &mut request).await {
            break result
                .and_then(reqwest::Response::error_for_status)
                .map_err(|_| "download_failed".to_string())?;
        }
    };
    let mut file = tokio::fs::File::create(part)
        .await
        .map_err(|_| "download_failed".to_string())?;
    let mut verifier = Verifier::new(entry);
    let mut stream = response.bytes_stream();
    let mut last_report = Instant::now();
    loop {
        if cancel.load(Ordering::Acquire) {
            return Err("download_cancelled".to_string());
        }
        // Wake periodically so cancel takes effect even when no data flows.
        let Ok(next) = tokio::time::timeout(CANCEL_POLL, stream.next()).await else {
            continue;
        };
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(|_| "download_failed".to_string())?;
        let received = verifier
            .push(&chunk)
            .map_err(|_| "integrity_failed".to_string())?;
        file.write_all(&chunk)
            .await
            .map_err(|_| "download_failed".to_string())?;
        // Time-based only: on a fast link a byte threshold would fire on nearly every chunk.
        if last_report.elapsed() >= PROGRESS_INTERVAL {
            on_progress(received, entry.bytes);
            last_report = Instant::now();
        }
    }
    if cancel.load(Ordering::Acquire) {
        return Err("download_cancelled".to_string());
    }
    file.flush()
        .await
        .map_err(|_| "download_failed".to_string())?;
    drop(file);
    verifier
        .finish()
        .map_err(|_| "integrity_failed".to_string())?;
    on_progress(entry.bytes, entry.bytes);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const DATA: &[u8] = b"hello";
    const HELLO: &str = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

    fn entry(bytes: u64, sha256: &'static str) -> ModelEntry {
        ModelEntry {
            id: "t",
            file: "t.bin",
            url: Some("http://127.0.0.1:1/t.bin"),
            bytes,
            sha256,
        }
    }

    #[test]
    fn verifier_accepts_matching_content_across_chunks() {
        let mut v = Verifier::new(&entry(5, HELLO));
        assert_eq!(v.push(&DATA[..2]), Ok(2));
        assert_eq!(v.push(&DATA[2..]), Ok(5));
        assert_eq!(v.finish(), Ok(()));
    }

    #[test]
    fn verifier_rejects_oversize_short_and_wrong_hash() {
        let mut v = Verifier::new(&entry(3, HELLO));
        assert_eq!(v.push(DATA), Err(VerifyError::TooLarge));
        let mut v = Verifier::new(&entry(6, HELLO));
        v.push(DATA).unwrap();
        assert_eq!(v.finish(), Err(VerifyError::IntegrityFailed));
        let mut v = Verifier::new(&entry(5, HELLO));
        v.push(b"hellp").unwrap();
        assert_eq!(v.finish(), Err(VerifyError::IntegrityFailed));
    }

    #[test]
    fn failed_download_removes_part_file() {
        let dir = std::env::temp_dir().join(format!("nevo-dl-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let part = dir.join("t.bin.part");
        std::fs::write(&part, b"stale").unwrap();
        let cancel = AtomicBool::new(true);
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        // Connection to a closed local port fails; the stale .part must still be removed.
        let result = rt.block_on(download(&entry(5, HELLO), &dir, &cancel, |_, _| {}));
        assert!(result.is_err());
        assert!(!part.exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn cancel_interrupts_a_stalled_connection() {
        use tokio::io::AsyncWriteExt;
        let dir = std::env::temp_dir().join(format!("nevo-dl-stall-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = rt.block_on(async {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let url = format!("http://{}/t.bin", listener.local_addr().unwrap());
            tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let _ = socket
                    .write_all(
                        b"HTTP/1.1 200 OK
Content-Length: 5

",
                    )
                    .await;
                tokio::time::sleep(Duration::from_secs(60)).await;
            });
            let mut entry = entry(5, HELLO);
            entry.url = Some(Box::leak(url.into_boxed_str()));
            let cancel = std::sync::Arc::new(AtomicBool::new(false));
            let flag = std::sync::Arc::clone(&cancel);
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(100)).await;
                flag.store(true, Ordering::Release);
            });
            tokio::time::timeout(
                Duration::from_secs(5),
                download(&entry, &dir, &cancel, |_, _| {}),
            )
            .await
        });
        assert_eq!(result.unwrap().unwrap_err(), "download_cancelled");
        assert!(!dir.join("t.bin.part").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
