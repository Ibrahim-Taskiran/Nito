//! Shared download helpers for the desktop tool setups (Whisper, AI engine).
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SetupProgress {
    pub stage: &'static str,
    pub received: u64,
    pub total: u64,
}

pub const CANCELLED: &str = "İndirme iptal edildi.";

pub fn agent() -> Result<ureq::Agent, String> {
    let tls = native_tls::TlsConnector::new().map_err(|e| e.to_string())?;
    Ok(ureq::AgentBuilder::new()
        .tls_connector(std::sync::Arc::new(tls))
        .user_agent("nito-study-app")
        .build())
}

/// Turkish message for a failed request: no network vs. a server answer.
pub fn net_error(e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, _) => format!("Sunucu indirmeyi reddetti (HTTP {code}). Daha sonra yeniden dene."),
        ureq::Error::Transport(_) => "İnternete bağlanılamadı. Bağlantını kontrol edip yeniden dene.".into(),
    }
}

/// First file called `name` (case-insensitive) below `dir`, up to `depth` folders down.
pub fn find_file(dir: &Path, name: &str, depth: u32) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    let mut subdirs = vec![];
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            subdirs.push(p);
        } else if p.file_name().is_some_and(|n| n.eq_ignore_ascii_case(name)) {
            return Some(p);
        }
    }
    if depth == 0 {
        return None;
    }
    subdirs.into_iter().find_map(|d| find_file(&d, name, depth - 1))
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Deletes `file` and fails when its download sha256 is not `want`.
pub fn check(sha: &str, want: &str, file: &Path) -> Result<(), String> {
    if sha == want {
        return Ok(());
    }
    let _ = fs::remove_file(file);
    Err("İndirilen dosya bozuk çıktı (sha256 tutmadı). Yeniden dene.".into())
}

/// Streams `url` into `dest` through a `.part` file so a cut download never looks complete.
/// Returns the sha256 of the bytes. `cancel` stops it between chunks.
pub fn download(
    agent: &ureq::Agent,
    url: &str,
    dest: &Path,
    stage: &'static str,
    progress: &mut dyn FnMut(SetupProgress),
    cancel: Option<&AtomicBool>,
) -> Result<String, String> {
    let resp = agent.get(url).call().map_err(net_error)?;
    let total = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let part = dest.with_extension("part");
    let mut out = fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut reader = resp.into_reader();
    let mut buf = vec![0u8; 256 * 1024];
    let mut hash = Sha256::new();
    let (mut received, mut last) = (0u64, 0u64);
    progress(SetupProgress { stage, received, total });
    let result = (|| {
        loop {
            if cancel.is_some_and(|c| c.load(Ordering::Relaxed)) {
                return Err(CANCELLED.to_string());
            }
            let n = reader.read(&mut buf).map_err(|_| "İndirme yarıda kesildi. Bağlantını kontrol edip yeniden dene.".to_string())?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n]).map_err(|e| format!("Dosya yazılamadı: {e}"))?;
            hash.update(&buf[..n]);
            received += n as u64;
            if received - last >= 1 << 20 {
                last = received;
                progress(SetupProgress { stage, received, total });
            }
        }
        out.flush().map_err(|e| e.to_string())?;
        if total > 0 && received != total {
            return Err(format!("İndirme eksik kaldı ({received}/{total} bayt). Yeniden dene."));
        }
        Ok(())
    })();
    drop(out);
    if let Err(e) = result {
        let _ = fs::remove_file(&part);
        return Err(e);
    }
    fs::rename(&part, dest).map_err(|e| e.to_string())?;
    progress(SetupProgress { stage, received, total: total.max(received) });
    Ok(hex(&hash.finalize()))
}
