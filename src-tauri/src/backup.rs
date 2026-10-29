//! Backup and restore of the whole library (database + stored files) to a folder,
//! e.g. one synced by a cloud drive. Restore first saves the current state under
//! `<app data>/backups/` so it can be undone by hand.
use rusqlite::{Connection, DatabaseName};
use std::fs;
use std::path::{Path, PathBuf};

pub const DB_FILE: &str = "nito.sqlite";

fn timestamp(conn: &Connection) -> Result<String, String> {
    conn.query_row("SELECT strftime('%Y%m%d-%H%M%S','now','localtime')", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

fn copy_dir(from: &Path, to: &Path) -> Result<u64, String> {
    fs::create_dir_all(to).map_err(|e| e.to_string())?;
    let mut n = 0;
    for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src = entry.path();
        let dest = to.join(entry.file_name());
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            n += copy_dir(&src, &dest)?;
        } else {
            fs::copy(&src, &dest).map_err(|e| format!("Copy failed {}: {e}", src.display()))?;
            n += 1;
        }
    }
    Ok(n)
}

/// Writes `<dest>/Nito-yedek-<time>/` with a consistent copy of the database and all stored files.
pub fn backup_to(conn: &Connection, storage: &Path, dest: &Path) -> Result<PathBuf, String> {
    let dir = dest.join(format!("Nito-yedek-{}", timestamp(conn)?));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db = dir.join(DB_FILE);
    // VACUUM INTO gives a single consistent file even while WAL is in use.
    conn.execute("VACUUM INTO ?1", [db.to_string_lossy()]).map_err(|e| format!("Database copy failed: {e}"))?;
    copy_dir(storage, &dir.join("storage"))?;
    Ok(dir)
}

/// Replaces the live database with `<src>/nito.sqlite` and adds `<src>/storage` files.
/// Returns the safety backup folder made beforehand.
pub fn restore_from(conn: &mut Connection, storage: &Path, safety: &Path, src: &Path) -> Result<PathBuf, String> {
    let db = src.join(DB_FILE);
    if !db.is_file() {
        return Err(format!("{} bulunamadı. Bir Nito yedek klasörü seçin.", DB_FILE));
    }
    // Refuse files that are not SQLite databases before touching anything.
    Connection::open(&db)
        .and_then(|c| c.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0)))
        .map_err(|e| format!("Yedek veritabanı okunamadı: {e}"))?;
    let saved = backup_to(conn, storage, safety)?;
    conn.restore(DatabaseName::Main, &db, None::<fn(rusqlite::backup::Progress)>)
        .map_err(|e| format!("Geri yükleme başarısız: {e}"))?;
    let files = src.join("storage");
    if files.is_dir() {
        copy_dir(&files, storage)?;
    }
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("nito-backup-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn backup_then_restore_round_trip() {
        let root = temp("rt");
        let storage = root.join("storage");
        fs::create_dir_all(storage.join("docs")).unwrap();
        fs::write(storage.join("docs/a.pdf"), b"%PDF-a").unwrap();
        let mut conn = Connection::open(root.join("live.sqlite")).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE t(x); INSERT INTO t VALUES (1);").unwrap();

        let out = backup_to(&conn, &storage, &root.join("drive")).unwrap();
        assert!(out.join(DB_FILE).is_file());
        assert_eq!(fs::read(out.join("storage/docs/a.pdf")).unwrap(), b"%PDF-a");

        // Change the live state, then restore the backup.
        conn.execute_batch("INSERT INTO t VALUES (2);").unwrap();
        fs::remove_file(storage.join("docs/a.pdf")).unwrap();
        let saved = restore_from(&mut conn, &storage, &root.join("safety"), &out).unwrap();
        let n: i64 = conn.query_row("SELECT count(*) FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        assert!(storage.join("docs/a.pdf").is_file());
        assert!(saved.join(DB_FILE).is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn restore_rejects_a_folder_without_database() {
        let root = temp("bad");
        let mut conn = Connection::open_in_memory().unwrap();
        let err = restore_from(&mut conn, &root, &root.join("s"), &root).unwrap_err();
        assert!(err.contains("bulunamadı"));
        let _ = fs::remove_dir_all(&root);
    }
}
