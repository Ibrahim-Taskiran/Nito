//! Whisper transcription on desktop: whisper.cpp (MIT) runs as an external program.
//! Setup downloads the official Windows CPU build and a ggml model into `<app data>/whisper/`.
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader};
use crate::fetch::{agent, download, find_file, net_error, SetupProgress};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{ipc::Channel, AppHandle, Manager, State};

const RELEASES_API: &str = "https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=15";
/// CPU x64 build; DLLs (whisper, ggml, SDL2) sit next to the exe.
const BIN_ASSET: &str = "whisper-bin-x64.zip";
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
/// Allowed model ids; also keeps user input out of file paths.
pub const MODELS: [&str; 2] = ["base", "large-v3-turbo"];
const EXE_NAMES: [&str; 2] = ["whisper-cli.exe", "main.exe"];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WhisperStatus {
    installed: bool,
    has_binary: bool,
    models: Vec<String>,
}

fn whisper_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("whisper"))
}

fn model_file(dir: &Path, model: &str) -> Result<PathBuf, String> {
    if !MODELS.contains(&model) {
        return Err(format!("Unknown model: {model}"));
    }
    Ok(dir.join("models").join(format!("ggml-{model}.bin")))
}

/// First whisper-cli.exe (or the older main.exe) below `dir`.
pub fn find_exe(dir: &Path) -> Option<PathBuf> {
    for name in EXE_NAMES {
        if let Some(p) = find_file(dir, name, 4) {
            return Some(p);
        }
    }
    None
}

pub fn status(dir: &Path) -> WhisperStatus {
    let has_binary = find_exe(&dir.join("bin")).is_some();
    let models: Vec<String> = MODELS
        .iter()
        .filter(|m| model_file(dir, m).map(|p| p.is_file()).unwrap_or(false))
        .map(|m| m.to_string())
        .collect();
    WhisperStatus { installed: has_binary && !models.is_empty(), has_binary, models }
}

/// Download URL of the CPU x64 zip in the newest release that has one (tag releases can be empty).
pub fn pick_asset(releases: &Value) -> Option<String> {
    releases.as_array()?.iter().find_map(|r| {
        r["assets"].as_array()?.iter().find_map(|a| {
            (a["name"].as_str()? == BIN_ASSET).then(|| a["browser_download_url"].as_str().map(String::from))?
        })
    })
}

/// Installs the binary (if missing) and `model` (if missing) into `dir`.
pub fn setup(dir: &Path, model: &str, progress: &mut dyn FnMut(SetupProgress)) -> Result<(), String> {
    let model_path = model_file(dir, model)?;
    let agent = agent()?;
    let bin = dir.join("bin");
    if find_exe(&bin).is_none() {
        let releases: Value = agent
            .get(RELEASES_API)
            .call()
            .map_err(net_error)?
            .into_json()
            .map_err(|e| e.to_string())?;
        let url = pick_asset(&releases).ok_or("No whisper-bin-x64.zip in recent whisper.cpp releases")?;
        let zip_path = dir.join("whisper-bin-x64.zip");
        download(&agent, &url, &zip_path, "binary", progress, None)?;
        let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        let _ = fs::remove_dir_all(&bin);
        archive.extract(&bin).map_err(|e| format!("Unzip failed: {e}"))?;
        drop(archive);
        let _ = fs::remove_file(&zip_path);
        find_exe(&bin).ok_or("whisper-cli.exe not found in the release zip")?;
    }
    if !model_path.is_file() {
        download(&agent, &format!("{MODEL_URL}ggml-{model}.bin"), &model_path, "model", progress, None)?;
    }
    Ok(())
}

/// "whisper_print_progress_callback: progress =  45%" -> 45
pub fn parse_progress(line: &str) -> Option<u32> {
    let rest = &line[line.find("progress =")? + "progress =".len()..];
    rest.trim().trim_end_matches('%').trim().parse().ok()
}

/// Runs whisper-cli on a 16 kHz mono WAV and returns its JSON output (`-oj`).
pub fn run_whisper(exe: &Path, model: &Path, wav: &Path, lang: &str, progress: &mut dyn FnMut(u32)) -> Result<String, String> {
    let base = wav.with_extension("");
    let json = base.with_extension("json");
    let _ = fs::remove_file(&json);
    let threads = std::thread::available_parallelism().map(|n| n.get().min(8)).unwrap_or(4);
    let mut cmd = Command::new(exe);
    cmd.arg("-m").arg(model)
        .arg("-f").arg(wav)
        .args(["-l", lang, "-t", &threads.to_string(), "-oj", "-pp", "-np"])
        .arg("-of").arg(&base)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    if let Some(d) = exe.parent() {
        cmd.current_dir(d);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Cannot start whisper: {e}"))?;
    let mut tail: Vec<String> = vec![];
    if let Some(err) = child.stderr.take() {
        for line in BufReader::new(err).lines().map_while(Result::ok) {
            match parse_progress(&line) {
                Some(p) => progress(p),
                None => {
                    tail.push(line);
                    if tail.len() > 8 {
                        tail.remove(0);
                    }
                }
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("whisper failed ({status}): {}", tail.join(" | ")));
    }
    let out = fs::read_to_string(&json).map_err(|e| format!("No whisper output: {e}"))?;
    let _ = fs::remove_file(&json);
    progress(100);
    Ok(out)
}

#[tauri::command]
pub fn whisper_status(app: AppHandle) -> Result<WhisperStatus, String> {
    Ok(status(&whisper_dir(&app)?))
}

#[tauri::command]
pub async fn whisper_setup(app: AppHandle, model: String, on_progress: Channel<SetupProgress>) -> Result<WhisperStatus, String> {
    let dir = whisper_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        setup(&dir, &model, &mut |p| {
            let _ = on_progress.send(p);
        })?;
        Ok(status(&dir))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// `wav_rel` is a storage path written by the webview (`transcripts/<id>.wav`).
#[tauri::command]
pub async fn whisper_transcribe(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    wav_rel: String,
    model: String,
    on_progress: Channel<u32>,
) -> Result<String, String> {
    let dir = whisper_dir(&app)?;
    let wav = state.storage_path(&wav_rel)?;
    let model = model_file(&dir, &model)?;
    let exe = find_exe(&dir.join("bin")).ok_or("Whisper kurulu değil")?;
    if !model.is_file() {
        return Err("Whisper modeli yok".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        run_whisper(&exe, &model, &wav, "tr", &mut |p| {
            let _ = on_progress.send(p);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_lines() {
        assert_eq!(parse_progress("whisper_print_progress_callback: progress =  45%"), Some(45));
        assert_eq!(parse_progress("progress = 100%"), Some(100));
        assert_eq!(parse_progress("whisper_init: loading model"), None);
    }

    #[test]
    fn picks_first_release_with_cpu_zip() {
        let v: Value = serde_json::json!([
            { "tag_name": "v9", "assets": [] },
            { "tag_name": "b2", "assets": [
                { "name": "whisper-blas-bin-x64.zip", "browser_download_url": "u-blas" },
                { "name": "whisper-bin-x64.zip", "browser_download_url": "u-cpu" }
            ]},
            { "tag_name": "b1", "assets": [{ "name": "whisper-bin-x64.zip", "browser_download_url": "old" }] }
        ]);
        assert_eq!(pick_asset(&v).as_deref(), Some("u-cpu"));
        assert_eq!(pick_asset(&serde_json::json!([])), None);
    }

    #[test]
    fn rejects_unknown_models() {
        let d = Path::new("w");
        assert!(model_file(d, "base").is_ok());
        assert!(model_file(d, "../evil").is_err());
    }

    #[test]
    fn status_of_empty_dir() {
        let s = status(&std::env::temp_dir().join("nito-whisper-missing"));
        assert!(!s.installed && !s.has_binary && s.models.is_empty());
    }

    /// Real download + run. `NITO_WHISPER_DIR=<dir> NITO_WHISPER_WAV=<16k wav> cargo test --lib -- --ignored`
    #[test]
    #[ignore]
    fn real_setup_and_transcribe() {
        let dir = PathBuf::from(std::env::var("NITO_WHISPER_DIR").expect("NITO_WHISPER_DIR"));
        setup(&dir, "base", &mut |p| eprintln!("{} {}/{}", p.stage, p.received, p.total)).unwrap();
        assert!(status(&dir).installed);
        if let Ok(wav) = std::env::var("NITO_WHISPER_WAV") {
            let exe = find_exe(&dir.join("bin")).unwrap();
            let lang = std::env::var("NITO_WHISPER_LANG").unwrap_or("tr".into());
            let mut seen = vec![];
            let json = run_whisper(&exe, &model_file(&dir, "base").unwrap(), Path::new(&wav), &lang, &mut |p| seen.push(p)).unwrap();
            let v: Value = serde_json::from_str(&json).unwrap();
            eprintln!("progress: {seen:?}\ntranscription: {}", v["transcription"]);
            assert!(v["transcription"].is_array());
        }
    }
}
