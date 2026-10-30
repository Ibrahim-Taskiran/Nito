//! Whisper transcription on desktop: whisper.cpp (MIT) runs as an external program.
//! Setup downloads the official Windows CPU build and a ggml model into `<app data>/whisper/`.
use serde::Serialize;
use serde_json::Value;
use std::ffi::OsString;
use std::fs;
use std::io::{BufRead, BufReader};
use crate::fetch::{agent, check, download, find_file, net_error, SetupProgress};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{ipc::Channel, AppHandle, Manager, State};

const RELEASES_API: &str = "https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=15";
/// CPU x64 build; DLLs (whisper, ggml, SDL2) sit next to the exe.
const BIN_ASSET: &str = "whisper-bin-x64.zip";
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
/// Allowed model ids with the sha256 of `ggml-<id>.bin` (Hugging Face LFS ids); also keeps user input out of file paths.
pub const MODELS: [(&str, &str); 3] = [
    ("base", "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"),
    ("large-v3-turbo-q5_0", "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"),
    ("large-v3-turbo", "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69"),
];
/// Silero VAD v5.1.2 (MIT) in ggml form: whisper skips silence, which stops made-up lines.
const VAD_URL: &str = "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin";
const VAD_FILE: &str = "ggml-silero-v5.1.2.bin";
const VAD_SHA256: &str = "29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf";
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

fn model_spec(model: &str) -> Result<(&'static str, &'static str), String> {
    MODELS.iter().copied().find(|(id, _)| *id == model).ok_or_else(|| format!("Unknown model: {model}"))
}

fn model_file(dir: &Path, model: &str) -> Result<PathBuf, String> {
    let (id, _) = model_spec(model)?;
    Ok(dir.join("models").join(format!("ggml-{id}.bin")))
}

fn vad_file(dir: &Path) -> PathBuf {
    dir.join("models").join(VAD_FILE)
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
        .filter(|(m, _)| model_file(dir, m).map(|p| p.is_file()).unwrap_or(false))
        .map(|(m, _)| m.to_string())
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

/// Installs the binary, `model` and the VAD model (each if missing) into `dir`.
pub fn setup(dir: &Path, model: &str, progress: &mut dyn FnMut(SetupProgress)) -> Result<(), String> {
    let model_path = model_file(dir, model)?;
    let (_, model_sha) = model_spec(model)?;
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
        let sha = download(&agent, &format!("{MODEL_URL}ggml-{model}.bin"), &model_path, "model", progress, None)?;
        check(&sha, model_sha, &model_path)?;
    }
    let vad = vad_file(dir);
    if !vad.is_file() {
        let sha = download(&agent, VAD_URL, &vad, "model", progress, None)?;
        check(&sha, VAD_SHA256, &vad)?;
    }
    Ok(())
}

/// "whisper_print_progress_callback: progress =  45%" -> 45
pub fn parse_progress(line: &str) -> Option<u32> {
    let rest = &line[line.find("progress =")? + "progress =".len()..];
    rest.trim().trim_end_matches('%').trim().parse().ok()
}

/// Decoding settings for long Turkish lectures.
pub struct WhisperOpts<'a> {
    pub lang: &'a str,
    /// Initial prompt: course, title, key terms and a punctuated seed sentence.
    pub prompt: Option<&'a str>,
    /// Silero VAD model; None runs without VAD.
    pub vad: Option<&'a Path>,
}

/// Text tokens kept from earlier windows: room for the prompt and the flow, too few for runaway repetition loops.
const MAX_CONTEXT: &str = "128";

/// whisper-cli flags after `-m model -f wav`. `legacy` keeps only flags every release understands.
pub fn whisper_args(o: &WhisperOpts, threads: usize, legacy: bool) -> Vec<OsString> {
    let threads = threads.to_string();
    let mut a: Vec<OsString> = ["-l", o.lang, "-t", &threads, "-oj", "-pp", "-np"].map(OsString::from).to_vec();
    if legacy {
        return a;
    }
    // Beam search with 5 candidates; whisper's temperature fallback (0, +0.2 on failure) stays on.
    a.extend(["-bs", "5", "-bo", "5", "-mc", MAX_CONTEXT, "--suppress-nst"].map(OsString::from));
    if let Some(p) = o.prompt.filter(|p| !p.trim().is_empty()) {
        a.extend([OsString::from("--prompt"), p.into()]);
    }
    if let Some(v) = o.vad {
        a.extend([OsString::from("--vad"), "-vm".into(), v.as_os_str().into()]);
    }
    a
}

/// Runs whisper-cli on a 16 kHz mono WAV and returns its JSON output (`-oj`).
/// An older whisper-cli that rejects the newer flags is retried with the basic ones.
pub fn run_whisper(exe: &Path, model: &Path, wav: &Path, opts: &WhisperOpts, progress: &mut dyn FnMut(u32)) -> Result<String, String> {
    match run_once(exe, model, wav, opts, false, progress) {
        Err(e) if e.contains("unknown argument") || e.contains("invalid argument") => run_once(exe, model, wav, opts, true, progress),
        r => r,
    }
}

fn run_once(exe: &Path, model: &Path, wav: &Path, opts: &WhisperOpts, legacy: bool, progress: &mut dyn FnMut(u32)) -> Result<String, String> {
    let base = wav.with_extension("");
    let json = base.with_extension("json");
    let _ = fs::remove_file(&json);
    let threads = std::thread::available_parallelism().map(|n| n.get().min(8)).unwrap_or(4);
    let mut cmd = Command::new(exe);
    cmd.arg("-m").arg(model)
        .arg("-f").arg(wav)
        .args(whisper_args(opts, threads, legacy))
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
    prompt: Option<String>,
    on_progress: Channel<u32>,
) -> Result<String, String> {
    let dir = whisper_dir(&app)?;
    let wav = state.storage_path(&wav_rel)?;
    let model = model_file(&dir, &model)?;
    let exe = find_exe(&dir.join("bin")).ok_or("Whisper kurulu değil")?;
    if !model.is_file() {
        return Err("Whisper modeli yok".into());
    }
    let vad = Some(vad_file(&dir)).filter(|v| v.is_file());
    tauri::async_runtime::spawn_blocking(move || {
        let opts = WhisperOpts { lang: "tr", prompt: prompt.as_deref(), vad: vad.as_deref() };
        run_whisper(&exe, &model, &wav, &opts, &mut |p| {
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
        assert!(model_file(d, "large-v3-turbo-q5_0").unwrap().ends_with("ggml-large-v3-turbo-q5_0.bin"));
        assert!(model_file(d, "../evil").is_err());
        assert!(MODELS.iter().all(|(_, sha)| sha.len() == 64) && VAD_SHA256.len() == 64);
    }

    #[test]
    fn args_for_lectures() {
        let vad = Path::new("v.bin");
        let o = WhisperOpts { lang: "tr", prompt: Some("Ağlar. Bu derste TCP anlatılıyor."), vad: Some(vad) };
        let a: Vec<String> = whisper_args(&o, 4, false).iter().map(|s| s.to_string_lossy().into_owned()).collect();
        let has = |pair: &[&str]| a.windows(pair.len()).any(|w| w == pair);
        assert!(has(&["-l", "tr"]) && has(&["-bs", "5"]) && has(&["-bo", "5"]) && has(&["-mc", "128"]));
        assert!(has(&["--prompt", "Ağlar. Bu derste TCP anlatılıyor."]) && has(&["--vad", "-vm", "v.bin"]));
        assert!(has(&["--suppress-nst"]));
        let plain = WhisperOpts { lang: "tr", prompt: Some("  "), vad: None };
        assert!(!whisper_args(&plain, 4, false).iter().any(|s| s == "--prompt" || s == "--vad"));
        assert_eq!(whisper_args(&o, 4, true).len(), 7);
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
            let prompt = std::env::var("NITO_WHISPER_PROMPT").ok();
            let vad = vad_file(&dir);
            let opts = WhisperOpts { lang: &lang, prompt: prompt.as_deref(), vad: Some(&vad) };
            let mut seen = vec![];
            let json = run_whisper(&exe, &model_file(&dir, "base").unwrap(), Path::new(&wav), &opts, &mut |p| seen.push(p)).unwrap();
            let v: Value = serde_json::from_str(&json).unwrap();
            eprintln!("progress: {seen:?}\ntranscription: {}", v["transcription"]);
            assert!(v["transcription"].is_array());
        }
    }
}
