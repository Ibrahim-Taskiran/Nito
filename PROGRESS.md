# Progress log

Newest entry first. Each entry records: what was finished, the files touched, the commit, what is half done, the next step and any problems.

## 2026-10-30 (11) — Study time per PDF + Whisper accuracy (branch `feat/study-time-whisper`)
- **Study time:** `core/study/studyTime.ts` (pure `advance`: stopwatch time goes to the PDF open in the reader at that moment; switching PDFs splits, closed reader or split view credits nothing; `formatStudyTime` → "1 sa 25 dk"). `ui/studyTime.svelte.ts` tracks from App, flushes every 30 s, on pause/switch/close and when the page hides. Migration `015_study_time.ts` (study_time: document_id, day, ms); final order m013 notebook, m014 note colour, m015 study time. Çalışma Merkezi: new "Çalışma süresi" card per PDF, course total in "Ders ilerlemesi".
- **Whisper:** new model `large-v3-turbo-q5_0` (574 MB, suggested; base = "Hızlı"; full turbo kept), sha256 checked for every model and the Silero VAD v5.1.2 (MIT, 885 KB, downloaded in setup). whisper-cli gets `-bs 5 -bo 5 -mc 128 --suppress-nst --prompt … --vad -vm …`; an old binary that says "unknown argument" is retried with the basic flags. Prompt = course + title + PDF key terms + a punctuated Turkish seed (`core/transcribe/prompt.ts`). WAV is DC-centred and raised to 0.9 peak (gain ≤ 8). `dropHallucinations` removes subtitle credits, thanks lines, the prompt read back, repeated segments and repetition loops.
- **Checked:** svelte-check 0; vitest 183 passed; cargo check ok, cargo test --lib 14 passed; real whisper-cli 1.9.5 run with all new flags + VAD (base model, English TTS sample) ok; e2e-timer (now checks Çalışma Merkezi), e2e-study, e2e-transcribe ok.
- **Not verified:** the q5_0 model was not downloaded or run here; no real Turkish lecture compared before/after.
- **Next step:** lead merges, fixes migration order, owner reinstalls Whisper with the suggested model (setup also fetches the VAD file).
## 2026-10-30 (10) — Phase 3.8 cross-page move (branch feat/selection-move-page)
- **Done:** drag a lasso selection past the page edge onto another page (target page outlined, edge auto-scroll); "Sayfaya taşı" menu (page "2" or "2a"); "Kes" button + Ctrl+X (cut, then paste on any page). Strokes, pictures and notes change page; one undo step. No migration.
- **Files:** `src/core/selection.ts` (PageMap, pageMap, paperPlace, mapPoints, mapBox), `inkRepo.ts` / `imageRepo.ts` / `pageToolsRepo.ts` (page in update), `ui/inkEdit.svelte.ts` (moveTo, cut, dropPage), `ui/reader.svelte.ts` (moveImage page), `ui/pageTools.svelte.ts`, `ui/views/SelectionLayer.svelte`, `ui/views/PenTools.svelte`, tests, `scripts/e2e-pen.mjs`.
- **Checks:** check 0 errors, vitest 174 passed, e2e-pen phone + tablet ok.
- **Next step:** merge into main with the other 3.8 branches. PenTools.svelte also touched by the toolbar branch.
## 2026-10-30 (9) — Phase 3.8 notebook ("Defter") on branch feat/notebook
- **Done:** "Defter" toolbar button opens a notebook beside the PDF (resizable column on wide screens, covers the reader body under 760 px). Starts with one Düz page; add Düz/Kareli/Çizgili/Noktalı (CSS backgrounds), move up/down, delete with confirm (last page stays). Same pen, eraser, lasso, text and sticky notes as PDF pages: notebook pages use page keys -(1e9 + notebook_page.id) in the existing layer tables.
- **Files:** `src/core/notebook.ts`, `src/core/db/migrations/013_notebook.ts`, `migrate.ts`, `src/ui/notebook.svelte.ts`, `src/ui/views/NotebookPane.svelte`, `ReaderView.svelte` (button, mount, `.body` relative), `tests/notebook.test.ts`, `scripts/e2e-notebook.mjs`, `package.json` e2e chain.
- **Checks:** svelte-check 0, vitest 175 passed, e2e-notebook OK.
- **Limits:** one notebook per PDF; pictures cannot be added to notebook pages; notebook pages are not in the PDF export.
- **Next step:** coordinator merges; migration order m013 before m014/m015.

## 2026-10-30 (8) — Phase 3.8 started: notebook, toolbar groups, cross-page move, study time, Whisper accuracy
- **Owner asked (7 items):** notebook beside PDF (plain first page, add grid/lined/dot pages); group reader toolbar (Kalem group, Lazer apart, Resim group); sticky note colour; move writing to another page; stopwatch time into Çalışma Merkezi per PDF; remove blank pages; fewer transcription errors.
- **Running:** four worktree agents (toolbar+note colour+blank page removal → migration 015; notebook → 013; cross-page move; study time 014 + Whisper). Branches under `.claude/worktrees/`.
- **Also running:** a fifth worktree agent restyles the app to the owner's design (zip on Desktop, `stitch_tablet_pdf_study_app.zip`; DESIGN.md + 3 screens: Bugün, Kütüphane, Çalışma Merkezi). It leaves StudyView/ReaderView markup alone; second pass after merge.
- **Next step:** merge the four branches, fix the migration order in `migrate.ts` to `[…, m012, m013, m014, m015]`, add new e2e scripts to the chain, run check + vitest + full e2e, update ROADMAP 3.8 icons, push.

## 2026-10-30 (7) — Phase 3.7 done: pages, pen, lasso, timer; double scrollbar fixed
- **Merged:** Pages (f9a52cb: transcript beside page, "Önemli" flag + mini PDF + pdf-lib export, virtual blank pages with negative page keys = -page_insert.id, migration 012), Pen (shape recogniser, palm/touch rejection with per-device settings `nito.penInput`, web images by paste/drop/link, lasso select move/scale/recolour/copy/delete/undo; no migration). Study timer (6588624, `src/core/timer.ts`, `ui/timer.svelte.ts`, TimerButton/TimerAlert). Window no longer scrolls, only views (baa503f).
- **Owner rule:** phones and tablets first, desktop second (ROADMAP architecture rules, Claude memory).
- **Checks on main:** svelte-check 0, vitest 170 passed, full `npm run e2e` (16 scripts, ends with timer, pages, pen) passed.
- **Known limits:** text boxes and sticky notes are not burned into exported PDFs; blank pages cannot be moved; pen/lasso not e2e-tested on blank pages; dragging an image from a browser into the Tauri window is blocked by `dragDropEnabled: true` (paste and link work); image links on Tauri only work when the site allows cross-origin requests; undo lasts only while the document is open.
- **Next step:** owner tries the desktop shortcut (DB backup, then migrations up to 012 run). Then whatever the owner asks next.

## 2026-10-30 (6) — Phase 3.6 done: Audio, Page tools, Exam + perf + AI merged
- **Merged:** Audio (009_lecture_audio), Page tools (010_page_tools; its 009 placeholder deleted), Exam (011_page_flags). Migrations `[001 … 011]`. New deps katex (MIT), highlight.js (BSD-3). e2e chain ends with e2e-audio, e2e-pagetools, e2e-exam. `npm run perf:bigpdf` (500 pages, ~2 min, not in the chain).
- **Checks on main:** svelte-check 0, vitest 134 passed, full `npm run e2e` passed. README features and ROADMAP updated.
- **Perf (500-page PDF):** live thumbnail bitmaps 500 → 4, canvas pixels after scroll 11.3 → 2.5 MP, A0 at 400% capped at 16 MP, scroll back to page 1 11.4 → 3.5 s, heap 40 → 31 MB.
- **Known limits:** no ▶ on PageNav thumbnails; an annotation's ▶ still uses the old player (the two pause each other); silence analysis decodes the whole file once (~58 MB for 1 h); scanned pages without text cannot make AI cards; nothing tried on a real tablet; new features not clicked in the real Tauri window.
- **Worktree tip:** a worktree whose node_modules is a junction needs a Vite config with `resolve.preserveSymlinks: true`, or pdf.js fails with "Invalid workerSrc type".
- **Next step:** owner tries the desktop shortcut (it backs up the DB, then migrations 006–011 run on the real library); then Phase 3 tablet builds or Phase 4.

## 2026-10-30 (5) — AI merged, README, Phase 3.6 running
- **Merged:** built-in AI engine (fad4b04, then the Kaliteli switch to Qwen3-8B). README.md written (Turkish, screenshots). Recording delete, speed, seek and laser 3.6 s (e26de01). Desktop shortcut `Nito.lnk` runs `scripts/launch.ps1` (rebuilds when HEAD changes, backs up the DB first).
- **Running:** Phase 3.6 agents (Audio 009, Page tools 010, Exam/perf/AI 011) in `.claude/worktrees/agent-a09f…`, `agent-a6fc…`, `agent-a611…`. They hit the 5-hour limit; their work was saved as wip commits 639bafe, 5a4e6b9, c677a60 (branches pushed), then resumed.
- **Next step:** merge Audio, Page tools, Exam; migrate.ts `[… m008, m009, m010, m011]`; e2e chain gets e2e-audio, e2e-pagetools, e2e-exam; full checks; update README features and ROADMAP 3.6 icons; push.

## 2026-10-30 (4) — Built-in AI engine, no Ollama needed; no AI on mobile (branch worktree-agent-a1e058a9e021599cc)
- **Why:** Nito is sold; buyers will not install Ollama.
- **Engine:** llama.cpp `llama-server` (MIT), pinned release b11849 (2026-10-24) `llama-b11849-bin-win-cpu-x64.zip`, 24 MB, sha256 checked. Rust `src-tauri/src/ai.rs` (desktop only): `ai_status`, `ai_setup(model)` (download + progress channel + cancel + free-disk check + sha256), `ai_cancel_setup`, `ai_start(model)` → `{url, key}` (127.0.0.1, free port, random `--api-key`, `-c 8192 -np 1 --no-webui`, waits for /health), `ai_stop`, `ai_delete(model)`. Files in `<app data>/ai/{bin,models}`, log `ai/server.log`. Server killed on `RunEvent::Exit` and by a Windows job object (KILL_ON_JOB_CLOSE) after a crash. Download code shared with Whisper in `fetch.rs` (Turkish network errors).
- **Models (Apache-2.0, checked on the HF cards, URLs pinned to a repo commit, sha256 checked):** "Hızlı" = Qwen3-4B-Instruct-2507 Q4_K_M (unsloth GGUF, 2.33 GB); "Kaliteli" = Qwen3-8B Q4_K_M (official Qwen GGUF, 4.68 GB, run with `--reasoning-budget 0`). Qwen2.5-7B-Instruct was tried first and dropped: without a system prompt it slipped into Chinese. Suggested from RAM: ≥15 GB → Kaliteli.
- **TS:** `src/core/ai/engine.ts` (Engine, EngineDown, SSE, OpenAI-compatible client), `builtin.ts` (model labels, suggestModel, formatGb), `ollama.ts` (`pickModel` now skips coder/embedding/vision and non-permissive families, e.g. deepseek-coder, llama, gemma, qwen2.5:3b/72b). `Platform.ai?: AiHost` (`src/platform/ai.ts`; Tauri `tauri/ai.ts`; web `web/ai.ts` with `window.__NITO_FAKE_AI__` for e2e). Undefined on Android/iOS → Sidebar hides "Yapay zekâ", App never renders AiView. `ui/aiClient.ts` removed. `Ai` state: checking/setup/installing/starting/ready/down/failed; Ollama only when the user picks it in Ayarlar and it runs. Ai getters replace `$derived` fields (deriveds created inside the first AiView went stale after it unmounted).
- **UI (AiView):** "Yapay zekâyı kur" card (Hızlı/Kaliteli, suggested badge, needed/free space, progress bar, İptal, Turkish errors), "Yapay zekâ başlatılamadı" card, "Ayarlar" panel (engine choice when Ollama runs, use/download/delete model with inline confirm). http capability scope: `http://127.0.0.1:*/*`, `http://localhost:*/*` (desktop only).
- **Really ran on this PC (Ryzen 5 5600H, 23 GB, no GPU):** real download of engine + Hızlı into `%APPDATA%/com.ibrahimtaskiran.nito/ai` (cargo ignored test `ai::tests::real_setup_start_chat`), server up 2.9 s, Turkish answer in 6.7 s; e2e-ai against the real server: Turkish chat with [s. 1] citation (5.2 s) and summary (31 s). Kaliteli (Qwen3-8B): sha256 OK, server up 4–6.5 s, ~7 tok/s; real chat 8.3 s and summary 26 s in correct Turkish. `npm run smoke:tauri-ai` (new) in a real Tauri debug window, with both models: Rust start, streaming through the http plugin, other hosts refused, llama-server gone after a hard kill of the app.
- **Checks:** svelte-check 0 errors; vitest 97 passed; cargo test 13 passed (+2 ignored real tests); `cargo check --target x86_64-linux-android` clean; full `npm run e2e` passed. `npm run licenses`: all 447 crates OK; npm fails only on extraneous packages in the shared main `node_modules` (no npm or Cargo dependency changed here).
- **Not done:** engine builds for macOS/Linux (setup says "yalnız Windows"), GPU (Vulkan) build, the Tauri UI setup flow with a real download from the window (same Rust `setup` as the cargo test), real tablet check.
- **Next step:** merge into main; run `npm run smoke:tauri-ai` once on main (needs a dev server on the build's devUrl and an installed model).

## 2026-10-30 (3) — Phase 3.5 done: Library, Home + Plan, Reader merged into main
- **Merged:** Library (merge after 04a1a62), Home + Plan (c5babf6), Reader (e468064). Migrations `[001 … 005, 006_ink_kinds, 007_reading, 008_plan]`. The e2e chain ends with e2e-library, e2e-home and e2e-reader.
- **Checks on main:** svelte-check 0, tsc 0, vitest 92 passed, `cargo check` ok, `npm run e2e` (all 10 scripts) passed.
- **Owner rule (2026-10-30):** one app for Windows, Android and iOS. Every feature must work with touch and pen (long press next to right click, 40px targets, nothing hover-only, tablet widths). Only publishing (store, signing, APK release) is postponed.
- **Known limits:** a search word split across two text-layer pieces is counted but not highlighted; the thickness slider has 3 steps; a one-page PDF is marked Okundu on open; image insert on mobile depends on the dialog plugin `open`; nothing tried on a real tablet yet.
- **Not verified in the real Tauri window:** the new migrations 006–008 on the owner's real DB (at v5). Run `npm run smoke:tauri` with a DB copy kept first.
- **Next step:** ask the owner what to polish next; then the Tauri window check above.

## 2026-10-30 — Phase 3.5 reader tools (branch worktree-agent-ac58affee2bb8af17)
- **Done:** two-row icon + text toolbar (lucide): "Ses kaydı" with mic icon, Ara (Ctrl+F), page number box (hidden `.pages` "N / M" kept for tests), zoom, Sayfalar (left panel: lazy thumbnails + pdf.js outline), Vurgular, Yan yana. Tool row: Tükenmez, Kurşun kalem, Fosforlu, Lazer (fades, not saved), Silgi, Resim ekle (Platform `pickImage`, move/resize/delete). Pen palette (10 per kind), custom colour, width slider. Search bar with count, next/prev, current hit marked and scrolled into view. All controls ≥40px, toolbar wraps at tablet width (checked at 800px, no sideways scroll).
- **Files:** src/ui/views/ReaderView.svelte, PageNav.svelte (new), PdfPage.svelte, ImageLayer.svelte, RecordBar.svelte, RecordingList.svelte, src/ui/components/ToolButton.svelte (new), src/core/reader.ts (parsePageInput, flattenOutline, hitOnPage), tests/reader-tools.test.ts, scripts/e2e-reader.mjs (new, in `npm run e2e`), e2e-record/transcribe/touch/ai label updates.
- **Checks:** svelte-check 0 errors; vitest 80 passed; e2e-reader, touch, record, notes, transcribe, ai, study pass.
- **Next step:** merge into main (m006 goes before m007 in migrate.ts); try on a real Android tablet once the APK builds.
- **Known:** search marks are found per text-layer span, so a word split across spans is counted in the bar but not marked on the page.

## 2026-10-30 — Phase 3.5 Library (branch worktree-agent-a0b6e32675cf7d6c2: e74dda8, 30a1a90, c3dc845, 04a1a62)
- **Done:** migration 007 (`last_page`, `page_count`, `last_opened_at`), repo rename/move/week/delete, `core/library/browse.ts` (Turkish-folding search, sort, progress, parseWeek). `LibraryView`: search box (Ctrl+K), sort select, grid/list toggle (saved per device), course chips, cover cards (first page via `ui/thumbs.ts`, cached `thumbs/<hash>.png`), progress bar + badges, detail panel with "Kaldığın yerden devam et". Reader saves the position (debounced 1 s). Menu (⋯ button, right click, 500 ms long press via `ui/longpress.ts`): open, rename, move to course (or new course), week, read/unread, favourite, delete with confirm. Tablet: ⋯ always visible, 40px targets, tap opens the doc when the detail panel is hidden (<1024px).
- **Checks:** svelte-check 0, vitest 70, all e2e scripts incl. new `scripts/e2e-library.mjs` passed.
- **Next:** merge into main (watch `migrate.ts` list, `package.json` e2e chain, App.svelte, ReaderView `$effect` for savePosition).

## 2026-10-30 (2) — Phase 3.5 resumed after token limit
- **Saved:** the three agents' uncommitted work as wip commits: Library 30a1a90, Home + Plan 7dfa2a5, Reader 67c0724. Branches pushed to origin.
- **Running:** three new agents finish each branch in the same worktrees (dev ports 1441 Reader, 1442 Library, 1443 Home).
- **Next step:** unchanged from the entry below (merge Library, Reader, Home; fix migrate.ts order and e2e chain; run all checks).

## 2026-10-30 — Phase 3.5 richer UI started (wip)
- **Why:** the owner said the UI looks empty and could not find audio recording (the "● Kaydet" button reads as "Save").
- **Done:** `@lucide/svelte` (ISC) added for icons (d3719a1). Owner-only todos saved to Claude memory (asked at the next session start).
- **Running:** three worktree agents (branches under `.claude/worktrees/`): Reader (migration 006), Library (007), Home + Plan (008). Scope in ROADMAP Phase 3.5. The Home agent also adds a copy of 007 to its branch: keep the Library one at merge.
- **Next step:** merge the three branches in order Library, Reader, Home; fix `migrate.ts` order `[..., m005, m006_ink_kinds, m007_reading, m008_plan]`, the package.json e2e chain and e2e selectors; run svelte-check, vitest, `npm run e2e`; update this entry; push. If the agent branches are lost, redo from the ROADMAP Phase 3.5 list.
- **Owner asked:** shut down the PC when the work is done.

## 2026-10-30 — Android set up (APK blocked), backup/restore, real Tauri smoke test
- **Android (975fbf8):** cmdline-tools + NDK 27.2.12479018 installed, Rust Android targets added, user env vars ANDROID_HOME / NDK_HOME / JAVA_HOME set. `tauri android init` done (`src-tauri/gen/android`), RECORD_AUDIO + MODIFY_AUDIO_SETTINGS in the manifest. Whisper Rust module and its crates are desktop-only (`#[cfg(desktop)]`, target-specific deps). See `docs/android.md`.
  - **Blocked:** `tauri android build` fails with "Creation symbolic link is not allowed for this system". The owner must turn on Windows Developer Mode (Settings > System > For developers). Then: `npx tauri android build --apk --debug --target x86_64` (emulator image android-37 x86_64 is installed) or `--target aarch64` for a device.
- **Backup / restore (Phase 4, free part):** `src-tauri/src/backup.rs`: `VACUUM INTO` copy of the DB + recursive copy of `storage/` into `<folder>/Nito-yedek-<time>/`; restore checks the folder, saves the current state to `<app data>/backups/` first, then uses the SQLite backup API and copies files back. Commands `backup_to`, `restore_from`; `Platform.backup` (Tauri only); sidebar buttons "Yedekle" / "Geri yükle" with a confirm dialog; app reloads after restore. Rust tests: round trip and bad folder (cargo test 9 passed).
- **Real Tauri smoke test:** `npm run smoke:tauri` starts the debug build with the WebView2 DevTools port and checks it read-only: `tauri=true | schema=v5 | library has documents | backup buttons | AI: Ollama reachable`, no console errors. It ran on the owner's real library (migrations 002–005 applied); a copy of the DB from before was kept in the session scratchpad. The screenshot goes to `test-results/` (gitignored) because it shows real data.
- **Next step (needs the owner):** Developer Mode for the APK; Phase 4 code signing, update server and store listings are paid or need accounts, so they wait for the owner's decision.

## 2026-10-30 — Phase 3: tablet input (9b95b27)
- **Done:**
  - Ink: `src/core/ink.ts` (RDP simplify, smooth SVG path, pressure width, eraser hit test), `src/core/inkRepo.ts`, migration `005_ink.ts` (`ink_stroke` table). `InkLayer.svelte` per page (rendered through a new `children` snippet in PdfPage). Toolbar: Kalem (3 colours), Silgi. After a stylus is seen, fingers scroll instead of drawing.
  - Touch: two-finger pinch zoom and quick horizontal swipe to the next/previous page (only when nothing scrolls sideways), "Genişliğe sığdır" button.
  - `Platform.mobile` (`src/platform/device.ts`): on Android/iOS the Tauri adapter drops the transcriber and the sidebar hides "Yapay zekâ".
  - `scripts/e2e-touch.mjs` (in `npm run e2e`): pen stroke saved and still there after reopen, eraser removes it, CDP pinch 110% → 330%, swipe 1 → 2.
- **Checks:** svelte-check 0, vitest 65, `npm run e2e` all 7 scripts passed.
- **Running:** an agent installs the Android NDK/cmdline-tools, gates desktop-only Rust (Whisper) for mobile, runs `tauri android init` and builds an APK. Its `src-tauri/` edits are not committed yet.
- **Not possible here:** iOS (`tauri ios init` needs a Mac with Xcode). When done on a Mac, add `NSMicrophoneUsageDescription` to the generated Info.plist.
- **Known problems:** after the dependency changes Vite needed `--force` once ("Outdated Optimize Dep" 504).

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
