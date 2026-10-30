//! Built-in AI engine on desktop: llama.cpp's `llama-server` (MIT) runs as a child process on 127.0.0.1.
//! Setup downloads a pinned Windows CPU build and a GGUF model (Apache-2.0) into `<app data>/ai/`,
//! and checks the sha256 of both. The server gets a random port and API key and dies with the app.
use crate::fetch::{agent, check, download, find_file, hex, SetupProgress, CANCELLED};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{ipc::Channel, AppHandle, Manager, State};

/// llama.cpp release b11849 (2026-10-24), CPU x64 build for Windows.
const LLAMA_URL: &str = "https://github.com/ggml-org/llama.cpp/releases/download/b11849/llama-b11849-bin-win-cpu-x64.zip";
const LLAMA_SHA256: &str = "d06c1e2f3b9d80b948fd95b1de1e02221db30f6a9fe147ec16106a73ad101a85";
const LLAMA_ZIP_BYTES: u64 = 24_165_481;
const SERVER_EXE: &str = "llama-server.exe";
/// Room for the unpacked binary and the log next to the downloads.
const DISK_MARGIN: u64 = 300 << 20;
const CONTEXT: &str = "8192";

pub struct ModelSpec {
    pub id: &'static str,
    file: &'static str,
    url: &'static str,
    bytes: u64,
    sha256: &'static str,
    /// Extra llama-server flags for this model.
    args: &'static [&'static str],
}

/// Both Apache-2.0 (checked on the Hugging Face model cards). URLs are pinned to a repo commit.
/// Qwen2.5-7B was tried for "quality" and dropped: it slipped into Chinese on this PC.
pub const MODELS: [ModelSpec; 2] = [
    ModelSpec {
        id: "fast",
        file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        bytes: 2_497_281_120,
        sha256: "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597",
        args: &[],
    },
    ModelSpec {
        id: "quality",
        file: "Qwen3-8B-Q4_K_M.gguf",
        url: "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/7c41481f57cb95916b40956ab2f0b139b296d974/Qwen3-8B-Q4_K_M.gguf",
        bytes: 5_027_783_488,
        sha256: "d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785",
        // Hybrid model: answer directly, no <think> block.
        args: &["--reasoning-budget", "0"],
    },
];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    id: &'static str,
    size_bytes: u64,
    installed: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    /// False where no engine build exists (desktop other than Windows x64).
    supported: bool,
    has_binary: bool,
    models: Vec<ModelInfo>,
    /// Model id of the running server.
    running: Option<String>,
    /// 0 when unknown.
    ram_bytes: u64,
    free_bytes: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Endpoint {
    url: String,
    key: String,
}

struct Server {
    child: Child,
    model: String,
    endpoint: Endpoint,
    #[cfg(windows)]
    _job: Option<win::Job>,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Default)]
pub struct AiState {
    server: Mutex<Option<Server>>,
    cancel: AtomicBool,
}

impl AiState {
    /// Kills the server (app exit).
    pub fn shutdown(&self) {
        if let Ok(mut s) = self.server.lock() {
            s.take();
        }
    }
}

pub fn spec(model: &str) -> Result<&'static ModelSpec, String> {
    MODELS.iter().find(|m| m.id == model).ok_or_else(|| format!("Bilinmeyen model: {model}"))
}

fn ai_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("ai"))
}

fn model_path(dir: &Path, m: &ModelSpec) -> PathBuf {
    dir.join("models").join(m.file)
}

fn server_exe(dir: &Path) -> Option<PathBuf> {
    find_file(&dir.join("bin"), SERVER_EXE, 3)
}

pub fn status(dir: &Path, running: Option<String>) -> AiStatus {
    let _ = fs::create_dir_all(dir);
    AiStatus {
        supported: cfg!(all(windows, target_arch = "x86_64")),
        has_binary: server_exe(dir).is_some(),
        models: MODELS
            .iter()
            .map(|m| ModelInfo { id: m.id, size_bytes: m.bytes, installed: model_path(dir, m).is_file() })
            .collect(),
        running,
        ram_bytes: sys::ram_bytes(),
        free_bytes: sys::free_bytes(dir),
    }
}

/// Bytes still to download for `model`, with a margin; 0 when everything is there.
pub fn needed_bytes(dir: &Path, m: &ModelSpec) -> u64 {
    let bin = if server_exe(dir).is_none() { LLAMA_ZIP_BYTES * 4 } else { 0 };
    let model = if model_path(dir, m).is_file() { 0 } else { m.bytes };
    if bin + model == 0 { 0 } else { bin + model + DISK_MARGIN }
}

const GB: f64 = (1u64 << 30) as f64;

/// Installs the engine (if missing) and `model` (if missing) into `dir`.
pub fn setup(dir: &Path, model: &str, progress: &mut dyn FnMut(SetupProgress), cancel: &AtomicBool) -> Result<(), String> {
    let m = spec(model)?;
    if !cfg!(all(windows, target_arch = "x86_64")) {
        return Err("Dahili yapay zekâ şimdilik yalnız Windows (x64) üzerinde çalışıyor.".into());
    }
    fs::create_dir_all(dir).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    let need = needed_bytes(dir, m);
    let free = sys::free_bytes(dir);
    if need > 0 && free > 0 && free < need {
        return Err(format!(
            "Yeterli disk alanı yok: {:.1} GB gerekiyor, {:.1} GB boş. Yer açıp yeniden dene.",
            need as f64 / GB,
            free as f64 / GB
        ));
    }
    let agent = agent()?;
    if server_exe(dir).is_none() {
        let zip_path = dir.join("llama-cpu-x64.zip");
        let sha = download(&agent, LLAMA_URL, &zip_path, "binary", progress, Some(cancel))?;
        check(&sha, LLAMA_SHA256, &zip_path)?;
        let tmp = dir.join("bin.new");
        let _ = fs::remove_dir_all(&tmp);
        let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        archive.extract(&tmp).map_err(|e| format!("Arşiv açılamadı: {e}"))?;
        drop(archive);
        let _ = fs::remove_file(&zip_path);
        let bin = dir.join("bin");
        let _ = fs::remove_dir_all(&bin);
        fs::rename(&tmp, &bin).map_err(|e| e.to_string())?;
        server_exe(dir).ok_or("llama-server.exe arşivde bulunamadı")?;
    }
    if cancel.load(Ordering::Relaxed) {
        return Err(CANCELLED.into());
    }
    let path = model_path(dir, m);
    if !path.is_file() {
        let sha = download(&agent, m.url, &path, "model", progress, Some(cancel))?;
        check(&sha, m.sha256, &path)?;
    }
    Ok(())
}

fn free_port() -> Result<u16, String> {
    let l = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    Ok(l.local_addr().map_err(|e| e.to_string())?.port())
}

fn random_key(port: u16) -> String {
    let mut h = Sha256::new();
    h.update(format!("{:?}{}{}", Instant::now(), std::process::id(), port));
    h.update(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos().to_le_bytes());
    hex(&h.finalize())[..32].to_string()
}

/// Last `n` bytes of the server log, for error messages.
fn log_tail(log: &Path, n: u64) -> String {
    let Ok(mut f) = fs::File::open(log) else { return String::new() };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let _ = f.seek(SeekFrom::Start(len.saturating_sub(n)));
    let mut s = String::new();
    let _ = f.read_to_string(&mut s);
    s.lines().filter(|l| !l.trim().is_empty()).last().unwrap_or("").to_string()
}

/// Starts llama-server with `model` and waits until it answers /health.
fn spawn(dir: &Path, model: &str) -> Result<Server, String> {
    let m = spec(model)?;
    let exe = server_exe(dir).ok_or("Yapay zekâ motoru kurulu değil.")?;
    let path = model_path(dir, m);
    if !path.is_file() {
        return Err("Bu model indirilmemiş.".into());
    }
    let port = free_port()?;
    let key = random_key(port);
    let log_path = dir.join("server.log");
    let log = fs::File::create(&log_path).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(&exe);
    cmd.arg("-m").arg(&path)
        .args(["--host", "127.0.0.1", "--port", &port.to_string(), "--api-key", &key])
        .args(["-c", CONTEXT, "-np", "1", "--no-webui"])
        .args(m.args)
        .stdin(Stdio::null())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log);
    if let Some(d) = exe.parent() {
        cmd.current_dir(d);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let child = cmd.spawn().map_err(|e| format!("Yapay zekâ motoru başlatılamadı: {e}"))?;
    let mut server = Server {
        #[cfg(windows)]
        _job: win::Job::kill_on_close(&child),
        child,
        model: model.to_string(),
        endpoint: Endpoint { url: format!("http://127.0.0.1:{port}"), key },
    };
    let health = format!("{}/health", server.endpoint.url);
    let probe = ureq::AgentBuilder::new().timeout(Duration::from_secs(2)).build();
    let deadline = Instant::now() + Duration::from_secs(240);
    loop {
        if let Ok(Some(code)) = server.child.try_wait() {
            let tail = log_tail(&log_path, 4096);
            return Err(format!("Yapay zekâ motoru başlatılamadı ({code}). {tail}"));
        }
        if probe.get(&health).call().is_ok() {
            return Ok(server);
        }
        if Instant::now() > deadline {
            return Err("Yapay zekâ motoru 4 dakikada açılmadı. Bilgisayarı yeniden başlatıp dene.".into());
        }
        std::thread::sleep(Duration::from_millis(300));
    }
}

fn running_model(state: &AiState) -> Option<String> {
    let mut guard = state.server.try_lock().ok()?;
    let alive = guard.as_mut().is_some_and(|s| matches!(s.child.try_wait(), Ok(None)));
    if !alive {
        guard.take();
    }
    guard.as_ref().map(|s| s.model.clone())
}

#[tauri::command]
pub fn ai_status(app: AppHandle, state: State<'_, AiState>) -> Result<AiStatus, String> {
    Ok(status(&ai_dir(&app)?, running_model(&state)))
}

#[tauri::command]
pub async fn ai_setup(app: AppHandle, model: String, on_progress: Channel<SetupProgress>) -> Result<AiStatus, String> {
    let dir = ai_dir(&app)?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<AiState>();
        state.cancel.store(false, Ordering::Relaxed);
        setup(&dir, &model, &mut |p| {
            let _ = on_progress.send(p);
        }, &state.cancel)?;
        Ok(status(&dir, running_model(&state)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ai_cancel_setup(state: State<'_, AiState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

/// Starts (or reuses) the server for `model`; returns its URL and API key.
#[tauri::command]
pub async fn ai_start(app: AppHandle, model: String) -> Result<Endpoint, String> {
    let dir = ai_dir(&app)?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<AiState>();
        let mut guard = state.server.lock().map_err(|_| "AI lock poisoned")?;
        if let Some(s) = guard.as_mut() {
            if s.model == model && matches!(s.child.try_wait(), Ok(None)) {
                return Ok(s.endpoint.clone());
            }
        }
        guard.take();
        let server = spawn(&dir, &model)?;
        let ep = server.endpoint.clone();
        *guard = Some(server);
        Ok(ep)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ai_stop(state: State<'_, AiState>) {
    state.shutdown();
}

/// Deletes a downloaded model (stops the server first when it uses it).
#[tauri::command]
pub fn ai_delete(app: AppHandle, state: State<'_, AiState>, model: String) -> Result<AiStatus, String> {
    let dir = ai_dir(&app)?;
    let m = spec(&model)?;
    if running_model(&state).as_deref() == Some(m.id) {
        state.shutdown();
    }
    match fs::remove_file(model_path(&dir, m)) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("Model silinemedi: {e}")),
    }
    Ok(status(&dir, running_model(&state)))
}

/// RAM and free disk space without extra crates.
mod sys {
    use std::path::Path;

    #[cfg(windows)]
    pub fn ram_bytes() -> u64 {
        super::win::ram_bytes()
    }
    #[cfg(windows)]
    pub fn free_bytes(dir: &Path) -> u64 {
        super::win::free_bytes(dir)
    }
    #[cfg(not(windows))]
    pub fn ram_bytes() -> u64 {
        0
    }
    #[cfg(not(windows))]
    pub fn free_bytes(_dir: &Path) -> u64 {
        0
    }
}

#[cfg(windows)]
mod win {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::AsRawHandle;
    use std::path::Path;

    #[repr(C)]
    #[derive(Default)]
    struct MemoryStatusEx {
        length: u32,
        load: u32,
        total_phys: u64,
        avail_phys: u64,
        total_page: u64,
        avail_page: u64,
        total_virtual: u64,
        avail_virtual: u64,
        avail_extended: u64,
    }

    #[repr(C)]
    #[derive(Default)]
    struct BasicLimit {
        per_process_user_time: i64,
        per_job_user_time: i64,
        limit_flags: u32,
        min_working_set: usize,
        max_working_set: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    struct ExtendedLimit {
        basic: BasicLimit,
        io: [u64; 6],
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory: usize,
        peak_job_memory: usize,
    }

    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: i32 = 9;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;

    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalMemoryStatusEx(buf: *mut MemoryStatusEx) -> i32;
        fn GetDiskFreeSpaceExW(dir: *const u16, avail: *mut u64, total: *mut u64, free: *mut u64) -> i32;
        fn CreateJobObjectW(attrs: *const c_void, name: *const u16) -> *mut c_void;
        fn SetInformationJobObject(job: *mut c_void, class: i32, info: *const c_void, len: u32) -> i32;
        fn AssignProcessToJobObject(job: *mut c_void, process: *mut c_void) -> i32;
        fn CloseHandle(h: *mut c_void) -> i32;
    }

    pub fn ram_bytes() -> u64 {
        let mut m = MemoryStatusEx { length: std::mem::size_of::<MemoryStatusEx>() as u32, ..Default::default() };
        if unsafe { GlobalMemoryStatusEx(&mut m) } != 0 { m.total_phys } else { 0 }
    }

    pub fn free_bytes(dir: &Path) -> u64 {
        let wide: Vec<u16> = dir.as_os_str().encode_wide().chain([0]).collect();
        let mut avail = 0u64;
        let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut avail, std::ptr::null_mut(), std::ptr::null_mut()) };
        if ok != 0 { avail } else { 0 }
    }

    /// A job that kills the server when its handle closes, so it dies with Nito even after a crash.
    pub struct Job(*mut c_void);
    // The handle is only used to close the job.
    unsafe impl Send for Job {}

    impl Job {
        pub fn kill_on_close(child: &std::process::Child) -> Option<Job> {
            unsafe {
                let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if h.is_null() {
                    return None;
                }
                let job = Job(h);
                let mut info = ExtendedLimit::default();
                info.basic.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let len = std::mem::size_of::<ExtendedLimit>() as u32;
                if SetInformationJobObject(h, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, &info as *const _ as *const c_void, len) == 0 {
                    return None;
                }
                if AssignProcessToJobObject(h, child.as_raw_handle() as *mut c_void) == 0 {
                    return None;
                }
                Some(job)
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            unsafe { CloseHandle(self.0) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_models_only() {
        assert!(spec("fast").is_ok() && spec("quality").is_ok());
        assert!(spec("../evil").is_err());
        assert!(MODELS.iter().all(|m| m.url.ends_with(m.file) && m.sha256.len() == 64));
    }

    #[test]
    fn empty_dir_needs_everything() {
        let d = std::env::temp_dir().join("nito-ai-empty-test");
        let s = status(&d, None);
        assert!(!s.has_binary && s.models.iter().all(|m| !m.installed) && s.running.is_none());
        let m = spec("fast").unwrap();
        assert!(needed_bytes(&d, m) > m.bytes);
        #[cfg(windows)]
        assert!(s.ram_bytes > 1 << 30 && s.free_bytes > 0);
    }

    #[test]
    fn ports_and_keys() {
        let p = free_port().unwrap();
        assert!(p > 0);
        let (a, b) = (random_key(p), random_key(p));
        assert_eq!(a.len(), 32);
        assert_ne!(a, b);
    }

    #[test]
    fn bad_checksum_removes_file() {
        let f = std::env::temp_dir().join("nito-ai-bad.part2");
        fs::write(&f, b"x").unwrap();
        assert!(check("aa", "bb", &f).is_err());
        assert!(!f.exists());
    }

    /// Real download + start + one Turkish chat.
    /// `NITO_AI_DIR=<dir> NITO_AI_MODEL=fast cargo test --lib ai::tests::real -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_setup_start_chat() {
        let dir = PathBuf::from(std::env::var("NITO_AI_DIR").expect("NITO_AI_DIR"));
        let model = std::env::var("NITO_AI_MODEL").unwrap_or("fast".into());
        let cancel = AtomicBool::new(false);
        let mut last = 0u64;
        setup(&dir, &model, &mut |p| {
            if p.received >= last + (200 << 20) || p.received == p.total {
                last = p.received;
                eprintln!("{} {}/{} MB", p.stage, p.received >> 20, p.total >> 20);
            }
        }, &cancel)
        .unwrap();
        let t0 = Instant::now();
        let server = spawn(&dir, &model).unwrap();
        eprintln!("server up in {:.1} s at {}", t0.elapsed().as_secs_f32(), server.endpoint.url);
        let t1 = Instant::now();
        let body: serde_json::Value = ureq::post(&format!("{}/v1/chat/completions", server.endpoint.url))
            .set("Authorization", &format!("Bearer {}", server.endpoint.key))
            .send_json(serde_json::json!({
                "messages": [{ "role": "user", "content": "TCP ile UDP arasındaki farkı iki cümleyle Türkçe açıkla." }],
                "temperature": 0.2
            }))
            .unwrap()
            .into_json()
            .unwrap();
        eprintln!("answer in {:.1} s: {}", t1.elapsed().as_secs_f32(), body["choices"][0]["message"]["content"]);
        // Without the key the server refuses.
        assert!(ureq::post(&format!("{}/v1/chat/completions", server.endpoint.url)).send_json(serde_json::json!({})).is_err());
    }
}
