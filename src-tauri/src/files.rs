use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

/// Validate a storage-relative path: not absolute, no `..`, not empty.
pub fn safe_rel(rel: &str) -> Result<PathBuf, String> {
    let p = Path::new(rel);
    if rel.is_empty() || p.is_absolute() || rel.starts_with('/') || rel.starts_with('\\') {
        return Err(format!("Invalid storage path: {rel}"));
    }
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::Normal(s) => out.push(s),
            Component::CurDir => {}
            _ => return Err(format!("Invalid storage path: {rel}")),
        }
    }
    if out.as_os_str().is_empty() {
        return Err(format!("Invalid storage path: {rel}"));
    }
    Ok(out)
}

#[derive(Serialize, Debug, PartialEq)]
pub struct PdfEntry {
    pub path: String,
    pub name: String,
    pub folder: Option<String>,
}

fn is_pdf(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false)
}

fn is_hidden(p: &Path) -> bool {
    p.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

fn entry(p: &Path, folder: Option<String>) -> PdfEntry {
    PdfEntry {
        path: p.to_string_lossy().into_owned(),
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        folder,
    }
}

fn walk(dir: &Path, folder: &Option<String>, out: &mut Vec<PdfEntry>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if is_hidden(&p) {
            continue;
        }
        if p.is_dir() {
            walk(&p, folder, out);
        } else if is_pdf(&p) {
            out.push(entry(&p, folder.clone()));
        }
    }
}

pub fn collect_pdfs(paths: &[String], recursive: bool) -> Vec<PdfEntry> {
    let mut out = Vec::new();
    for raw in paths {
        let root = Path::new(raw);
        if root.is_dir() {
            let Ok(rd) = fs::read_dir(root) else { continue };
            for e in rd.flatten() {
                let p = e.path();
                if is_hidden(&p) {
                    continue;
                }
                if p.is_dir() {
                    if recursive {
                        let name = e.file_name().to_string_lossy().into_owned();
                        walk(&p, &Some(name), &mut out);
                    }
                } else if is_pdf(&p) {
                    out.push(entry(&p, None));
                }
            }
        } else if root.is_file() && is_pdf(root) && !is_hidden(root) {
            out.push(entry(root, None));
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out.dedup_by(|a, b| a.path == b.path);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rel_validation() {
        assert!(safe_rel("a/b.pdf").is_ok());
        assert!(safe_rel("../x").is_err());
        assert!(safe_rel("a/../../x").is_err());
        assert!(safe_rel("/abs").is_err());
        assert!(safe_rel("C:\\abs").is_err());
        assert!(safe_rel("").is_err());
    }

    #[test]
    fn pdf_listing() {
        let base = std::env::temp_dir().join(format!("nito_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("Sub/deep")).unwrap();
        fs::create_dir_all(base.join(".hid")).unwrap();
        fs::write(base.join("a.PDF"), b"x").unwrap();
        fs::write(base.join("n.txt"), b"x").unwrap();
        fs::write(base.join(".h.pdf"), b"x").unwrap();
        fs::write(base.join("Sub/b.pdf"), b"x").unwrap();
        fs::write(base.join("Sub/deep/c.pdf"), b"x").unwrap();
        fs::write(base.join(".hid/d.pdf"), b"x").unwrap();
        let input = vec![base.to_string_lossy().into_owned()];

        let flat = collect_pdfs(&input, false);
        assert_eq!(flat.len(), 1);
        assert_eq!(flat[0].name, "a.PDF");
        assert_eq!(flat[0].folder, None);

        let rec = collect_pdfs(&input, true);
        assert_eq!(rec.len(), 3);
        let c = rec.iter().find(|e| e.name == "c.pdf").unwrap();
        assert_eq!(c.folder.as_deref(), Some("Sub"));
        let _ = fs::remove_dir_all(&base);
    }
}
