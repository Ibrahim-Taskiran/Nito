# Progress log

Newest entry first. Each entry records: what was finished, the files touched, the commit, what is half done, the next step and any problems.

## 2026-10-30 — Phase 2 done: 2A, 2B, 2C, 2D merged into main
- **Merged:** study (e9afeef), notes (merge after 182e0d6), transcription (079f536), AI + split view (a75d547). Migrations in order `[001, 002_study, 003_notes, 004_transcripts]` (2D added none).
- **2A Study:** cards from Tanım/Soru highlights, Leitner 1/2/4/8/16 days (`card_review` table), multiple-choice quiz, Study Center, Cornell note (kind 'template'), course pack zip (fflate).
- **2B Notes:** live note per PDF, colour digest per course, safe Markdown renderer, `nito://annotation/<id>` back-links open the reader on that page, free notes, Markdown export (`Platform.saveExport`), watched folders (`watched_folder` table, rescan at start and every 10 min, `Platform.listFolder`).
- **2C Transcription:** Rust `transcribe.rs` (`whisper_status`, `whisper_setup`, `whisper_transcribe`; ureq + native-tls + zip). whisper.cpp b5454 CPU x64 and `ggml-base.bin` downloaded into `<app data>/whisper/` on this machine and run for real on an English SAPI clip. webm → 16 kHz WAV in the webview, transcript note with `## mm:ss` paragraphs, `recording.transcript_note_id`.
- **2D AI:** `src/core/ai/` (tokenizer, chunks, BM25, prompts, Ollama client), AiView (summary saved as 'ai' note, chat with [s. N] citations), `@tauri-apps/plugin-http` scoped to localhost:11434 (default features off, so no webpki-roots). Split view with "Yan yana". Real chat with local qwen2.5:3b answered in Turkish.
- **Checks on main:** tsc 0, svelte-check 0, vitest 61 passed, `cargo check` ok, licences all allowed (447 crates), `npm run e2e` (screenshots, record, study, notes, transcribe, ai) all passed.
- **Not verified in the Tauri window:** mic permission, Whisper setup/transcribe buttons, plugin-http streaming, watched-folder scan.
- **Known limits:** pack has original PDFs (no burned-in highlights); definition card back repeats the term; transcript links not shown in NotesView list beyond the note body; Whisper setup cannot be cancelled; long recordings make large WAVs in memory; AI page-text cache is memory only; 3b model citations vary.
- **Lesson:** never `git worktree remove --force` a worktree whose `node_modules` is a junction to main: it emptied main's node_modules once. Unlink with `cmd /c rmdir` first.
- **Next step:** Phase 3 (tablets): `tauri android init` / `tauri ios init` need Android SDK/NDK and a Mac for iOS.

## 2026-10-29 — Phase 1 done (step 10), Phase 2 started
- **Step 10:** `npm run tauri build` ok (release 2 m 53 s). Installer `src-tauri/target/release/bundle/nsis/Nito_0.1.0_x64-setup.exe`, 2.51 MiB. Smoke test: silent install (`/S /D=<temp>`) exit 0, `nito.exe` running after 6 s with window title "Nito", silent uninstall exit 0. Unsigned (Phase 4).
- **Phase 2 scaffold (e9cc8bd):** `Library.section` ("library" | "study" | "notes" | "ai") and `Library.split`; sidebar "Çalışma" items; placeholder views StudyView, NotesView, AiView, SplitView, RecordingList (bottom of AnnotationPanel). `npm run e2e` runs screenshots + recording e2e.
- **Phase 2 running now:** four agents in separate git worktrees: 2A study (migration 002, port 1431), 2B notes (003, 1432), 2C transcription (004, 1433), 2D AI + split view (005, 1434). The main agent merges their branches into main.
- **Next step:** merge the four branches, resolve conflicts (MIGRATIONS array, lib.rs command list, package.json), run all checks and e2e scripts, update ROADMAP.
- **Known problems:** one e2e run timed out while the release build was using the CPU; the rerun passed.

## 2026-10-29 — Phase 1 steps 8 and 9: theme switch, licence check
- **Done:**
  - Theme switch (Sistem / Açık / Koyu) at the bottom of the sidebar; `src/ui/theme.ts` stores it in localStorage and sets `data-theme`. Favicon `public/icon.png` from the Tauri icons.
  - `scripts/check-licenses.mjs` (`npm run licenses`): shipped npm tree + all 421 crates from `cargo metadata` against the allow list. Result: all allowed.
  - Screenshots refreshed (`npm run screenshots`).
- **Next step:** step 10, `npm run tauri build` and smoke test the installer.

## 2026-10-29 — Phase 1 step 7: recording while reading
- Owner confirmed the reader works in the Tauri window, and asked agents to finish the remaining steps alone, testing themselves.
- **Done:**
  - Rust `storage_write`: raw request body, path in the `x-rel` header (no JSON byte arrays for big recordings). `Storage.write` in both adapters.
  - `src/ui/recorder.svelte.ts`: MediaRecorder (mime from `pickRecordingMime`, 64 kbps, 1 s chunks), level meter via AnalyserNode, `RecordingClock` for pause-free offsets. Saves to `recordings/<id>.<ext>` on stop; deletes the row if the save fails. Closing the reader stops and saves.
  - Reader: highlight made while recording gets a `recording_mark`. Panel shows "▶ mm:ss"; playback starts 2 s before the mark, second click pauses.
  - `RecordBar.svelte`: Kaydet, timer, level meter, Duraklat/Sürdür, Durdur, error text (mic denied).
  - `scripts/e2e-record.mjs`: Edge with a fake microphone. Records 3 s, highlights, pauses 1.5 s, stops, checks the mark is 00:03 and playback starts.
- **Checks:** svelte-check 0 errors, vitest 11 passed, `cargo check` clean, e2e-record passed.
- **Not verified:** microphone permission inside the Tauri window (needs a person at the machine). iPad/Android permission strings are Phase 3.
- **Next step:** Phase 1 step 8 (theme switch), 9 (licence checks), 10 (`tauri build` installer).
- **Known problems:** a crash during recording loses the unsaved audio (chunks are kept in memory until stop).

## 2026-10-29 — Phase 1 step 6: PDF reader with highlights
- **Done:**
  - Owner tested `npm run tauri dev`: picker, folder and drag-drop add all work (step 3 ✅).
  - `src/core/reader.ts`: pages to render (visible ± 1), zoom steps (50–400 %), selection rects → normalised page rects (joined per line, 4 decimals). Tests in `tests/reader.test.ts`.
  - `src/ui/pdf.ts`: lazy pdf.js loader with worker. `src/ui/reader.svelte.ts`: reader state (load, close, add/update/delete highlight).
  - Views: `ReaderView.svelte` (toolbar, page count, zoom buttons and Ctrl+wheel, IntersectionObserver, label picker after text selection, Esc closes), `PdfPage.svelte` (canvas + text layer, rendered off-screen then swapped in, freed when far away; zoom stretches the old bitmap until a 120 ms re-render), `AnnotationPanel.svelte` (list, comment, change label, delete, jump to page).
  - `src/ui/textLayer.css`: text layer rules adapted from pdf.js (Apache-2.0).
  - Library: "Aç" button and double-click open a document; opening marks Okunmadı → Okunuyor.
- **Checks:** svelte-check 0 errors, vitest 11 passed, `npm run screenshots` opens a PDF, highlights as Sınav, saves a comment, and reopens with the comment kept, in light and dark (`docs/screenshots/reader-*.png`).
- **Half done:** not tried in the Tauri window yet. Pinch zoom on touch is Phase 3.
- **Next step:** Phase 1 step 7, audio recording while a PDF is open (MediaRecorder, timer, level meter, pause, `recording_mark` per highlight, ▶ mm:ss in the annotation list). `src/core/recording.ts` already has the clock and MIME logic; repo has `startRecording`, `finishRecording`, `addMark`, `marksForDocument`. Rust needs a command to write recording bytes into storage.
- **Known problems:** a selection that spans two pages keeps only the part on the first page.

## 2026-10-29 — graphify set up
- Owner ran `graphify claude install`: graphify section in CLAUDE.md, hooks in `.claude/settings.json`.
- Graph built with `graphify update . --no-cluster` and `graphify cluster-only . --no-label` (357 nodes, 17 communities).
- `graphify-out/` is gitignored (derived). Rebuild it locally with the same two commands.
- Port 1420 clash during the owner's `npm run tauri dev`: a leftover Vite from the screenshot run held it. It is stopped. Stop `npm run dev` before `tauri dev`.
- **Next step:** unchanged. Owner tests `npm run tauri dev`, then Phase 1 step 6 (PDF reader).

## 2026-10-29 — Phase 1 steps 1–5: core, adapters, add flow, library UI
- **Done:**
  - Importer leftovers removed (`source_key` columns, legacy colour map, `import:cli` script). Migration 001 was never shipped, so it was edited in place.
  - `src/core/library/addDocuments.ts`: one add flow for picker, folder and drag-drop. Hash, duplicate skip (DB and within batch), copy to `docs/<hash>.pdf`, clean title and week, subfolder → course, progress, cancel, summary text.
  - `src/platform/`: port in `types.ts`; web adapter (sql.js in memory, file input, folder input, drag-drop with folders); Tauri adapter (invoke commands, dialog plugin, webview drag-drop).
  - `src-tauri/`: Tauri 2 + rusqlite (bundled) + sha2. Commands `db_run`, `db_exec`, `db_all`, `file_hash`, `storage_copy`, `storage_read`, `storage_remove`, `list_pdfs`. DB at `<app data>/nito.sqlite`, files in `<app data>/storage/`. Icons generated from `nito.ico`.
  - UI: tokens (light/dark), Button, IconButton, Dialog, ProgressBar; empty state, sidebar with counts, week-grouped list (read dot, star), detail panel, add progress dialog and summary toast.
  - TypeScript pinned to 6 (svelte-check does not support TS 7 alone).
  - Fixtures: `node scripts/make-fixtures.mjs` writes tiny PDFs to `tests/fixtures/`. Screenshots: `npm run screenshots` (needs `npm run dev`; uses installed Edge).
- **Commit:** 07186bf.
- **Checks:** `npx tsc --noEmit` clean, `svelte-check` 0 errors, vitest 8 passed, `cargo check` clean, `cargo test --lib` 3 passed, `vite build` ok, Playwright add flow ok in light and dark (`docs/screenshots/`).
- **Half done:** step 3 is not tested inside the real Tauri window (`npm run tauri dev` not run yet). Step 9: licence scripts (`npm run licenses`, `cargo deny`) still missing.
- **Next step:**
  1. Run `npm run tauri dev`, add PDFs by picker, folder and drag-drop, confirm rows and files in app data.
  2. Phase 1 step 6: PDF reader (pdf.js, lazy pages, highlights with 5 labels).
- **Known problems:** sql.js wasm (685 kB) is still copied into `dist/` for the Tauri build, though only the web adapter loads it. No "target course" picker yet: files without a folder go to the course selected in the sidebar.

## 2026-10-29 — Decision from the owner: empty library and bulk add
- The app ships with no PDFs. Users add their own.
- Removed `src/core/importer/legacyLibrary.ts`. There is no importer for the owner's personal library (`C:\Users\ibrah\Nito`), and agents must not touch that library.
- ROADMAP Phase 1 step 3 is now "Adding PDFs": single add, bulk add (multi-select, folder, drag and drop), duplicate check by hash, and a progress summary.
- **Next step:** unchanged (see below). When you reach step 3, build the add flow. Remove any leftover references to the importer in `src/core` (types, repo, tests).

## 2026-10-29 — Phase 1 foundation agent (stopped; user's token budget nearly used up)
- **Done:**
  - Tooling is ready: Rust 1.99.1 and MSVC Build Tools 2022.
  - GitHub repo created.
  - ROADMAP.md, CLAUDE.md and PROGRESS.md written.
- **Half done (uncommitted work from the stopped agent, now committed as `wip`):**
  - Vite + Svelte + TypeScript scaffold: package.json, vite.config.ts, svelte.config.js, tsconfig.json, index.html, LICENSE.
  - `src-tauri/` folder exists. Its contents are unchecked.
  - `src/core/`: `db/migrate.ts`, `db/sql.ts`, `db/migrations/001_init.ts`, `importer/legacyLibrary.ts`, `labels.ts`, `recording.ts`, `repo.ts`, `types.ts`, `week.ts`.
  - None of this has been compiled or tested.
- **Next step:**
  1. Run `npm install`, then `npx tsc --noEmit` and `npm test`. Fix errors.
  2. Check `src-tauri/` with `cargo check`.
  3. Continue ROADMAP Phase 1 from step 4 (platform adapters).
  4. Re-check steps 1–3 against the ROADMAP.
- **Problems:** none known yet. The code is unchecked.
