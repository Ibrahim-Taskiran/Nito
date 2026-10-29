mod backup;
mod db;
mod files;
#[cfg(desktop)]
mod transcribe;

use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{
    ipc::{InvokeBody, Request, Response},
    Manager, State,
};

struct AppState {
    db: Mutex<rusqlite::Connection>,
    storage: PathBuf,
}

impl AppState {
    fn conn(&self) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>, String> {
        self.db.lock().map_err(|_| "Database lock poisoned".to_string())
    }
    fn storage_path(&self, rel: &str) -> Result<PathBuf, String> {
        Ok(self.storage.join(files::safe_rel(rel)?))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunResult {
    last_id: i64,
    changes: usize,
}

#[tauri::command]
fn db_run(state: State<AppState>, sql: String, params: Vec<Value>) -> Result<RunResult, String> {
    let conn = state.conn()?;
    let (last_id, changes) = db::run(&conn, &sql, &params)?;
    Ok(RunResult { last_id, changes })
}

#[tauri::command]
fn db_exec(state: State<AppState>, sql: String) -> Result<(), String> {
    state.conn()?.execute_batch(&sql).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_all(
    state: State<AppState>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    let conn = state.conn()?;
    db::all(&conn, &sql, &params)
}

#[tauri::command]
fn file_hash(path: String) -> Result<String, String> {
    let mut f = fs::File::open(&path).map_err(|e| format!("Cannot open {path}: {e}"))?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

#[tauri::command]
fn storage_copy(state: State<AppState>, src: String, rel: String) -> Result<(), String> {
    let dest = state.storage_path(&rel)?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&src, &dest).map_err(|e| format!("Copy failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn storage_read(state: State<AppState>, rel: String) -> Result<Response, String> {
    let p = state.storage_path(&rel)?;
    let bytes = fs::read(&p).map_err(|e| format!("Read failed: {e}"))?;
    Ok(Response::new(bytes))
}

/// Writes raw bytes (the request body) to `<storage>/<rel>`; `rel` comes in the `x-rel` header.
/// Raw bodies avoid turning large recordings into JSON number arrays.
#[tauri::command]
fn storage_write(state: State<AppState>, request: Request) -> Result<(), String> {
    let rel = request
        .headers()
        .get("x-rel")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing x-rel header")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected a raw body".into());
    };
    let dest = state.storage_path(rel)?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&dest, bytes).map_err(|e| format!("Write failed: {e}"))
}

#[tauri::command]
fn storage_remove(state: State<AppState>, rel: String) -> Result<(), String> {
    let p = state.storage_path(&rel)?;
    match fs::remove_file(&p) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Remove failed: {e}")),
    }
}

#[tauri::command]
fn list_pdfs(paths: Vec<String>, recursive: bool) -> Result<Vec<files::PdfEntry>, String> {
    Ok(files::collect_pdfs(&paths, recursive))
}

/// Backs up the library into `dest` (a folder the user picked); returns the new folder path.
#[tauri::command]
fn backup_to(state: State<AppState>, dest: String) -> Result<String, String> {
    let conn = state.conn()?;
    backup::backup_to(&conn, &state.storage, Path::new(&dest)).map(|p| p.to_string_lossy().into_owned())
}

/// Restores a backup folder; the current state is saved under `<app data>/backups/` first.
#[tauri::command]
fn restore_from(state: State<AppState>, src: String) -> Result<String, String> {
    let mut conn = state.conn()?;
    let safety = state.storage.parent().map(|p| p.join("backups")).ok_or("No app data folder")?;
    backup::restore_from(&mut conn, &state.storage, &safety, Path::new(&src)).map(|p| p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let storage = dir.join("storage");
            fs::create_dir_all(&storage)?;
            let conn = rusqlite::Connection::open(dir.join("nito.sqlite"))?;
            conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
            app.manage(AppState {
                db: Mutex::new(conn),
                storage,
            });
            Ok(())
        })
        ;
    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db_run,
        db_exec,
        db_all,
        file_hash,
        storage_copy,
        storage_read,
        storage_write,
        storage_remove,
        backup_to,
        restore_from,
        list_pdfs,
        transcribe::whisper_status,
        transcribe::whisper_setup,
        transcribe::whisper_transcribe
    ]);
    // Mobile: no local Whisper (desktop-only), so those commands are absent.
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db_run,
        db_exec,
        db_all,
        file_hash,
        storage_copy,
        storage_read,
        storage_write,
        storage_remove,
        backup_to,
        restore_from,
        list_pdfs
    ]);
    builder
        .run(tauri::generate_context!())
        .expect("error while running Nito");
}
