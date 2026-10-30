# Nito_01 — Roadmap

Nito_01 is a new study app written from scratch: course PDFs, highlights, notes, lecture recordings and study tools.
It runs on Windows first, then on iPad and Android tablets from the same code.
All code is ours (proprietary, see LICENSE). No code is copied from Zotero or from the earlier plugin's template.

Every agent working on this project must follow [CLAUDE.md](CLAUDE.md) and record its progress in [PROGRESS.md](PROGRESS.md).

## Fixed decisions

| Topic | Decision |
|---|---|
| Shell | Tauri 2 (Rust). One codebase for Windows, iOS and Android |
| UI | Svelte 5, TypeScript and Vite |
| PDF | pdf.js (`pdfjs-dist`, Apache-2.0) |
| Database | SQLite through rusqlite with bundled SQLite. File `nito.sqlite` in the app data folder |
| Tests | vitest for `src/core`, Playwright for screenshots and e2e |
| Licences | Only MIT, Apache-2.0, BSD, ISC, Zlib and MPL-2.0 (plus public-domain-like CC0, Unlicense, 0BSD, BSL-1.0 and the Unicode data licences used by Rust crates). Never GPL, LGPL, AGPL, SSPL or non-commercial licences |
| Cost | No paid libraries or services |
| Look | Calm and plain: neutral greys, one muted accent (slate blue around `#4f6d8f`), 8–12 px corners, light and dark themes |
| Icon | `C:\Users\ibrah\Desktop\nito.ico` (really a JPEG on white). Make clean PNGs, then run `npx tauri icon` |
| Language | Turkish UI text |

## Architecture rules

- **`src/core/`** holds pure TypeScript domain logic. No Tauri and no DOM imports. Everything here gets unit tests.
- **`src/platform/`** has one adapter interface (db, files, audio, dialogs) with two implementations:
  - Tauri, for the real app.
  - In-memory/web, for tests and for `npm run dev` in a browser.
- **`src/ui/`** holds shared components (Button, IconButton, Card, List, Dialog, Toolbar) and the design tokens. Write each thing once and reuse it (DRY).
- **Performance:**
  - Virtualise long lists.
  - Render only the visible PDF pages ± 1.
  - Keep the JS bundle small.
- **Touch first:** hit targets at least 40 px, pointer events, layouts from 768 px upwards.

## Library content (decided 2026-10-29)

- Nito_01 starts with an **empty library**. Users add their own PDFs.
- There is **no importer** for the old library. `C:\Users\ibrah\Nito\` holds the owner's personal PDFs for the Zotero-based fork. It is not app content. Do not read it, ship it, seed from it or test against it.
- Test with small generated PDFs only, e.g. made with pdf-lib (MIT), and keep them in `tests/fixtures/`.
- Never commit user PDFs, `nito.sqlite`, `storage/` or recordings.

## Logic we may port (we wrote it)

These pure modules are in `..\Nito\plugin\src\modules\`. Port the ideas and logic from them:

- `format.ts`: `weekNumber`, `compareByWeek`, `cleanTitle`, colour labels
- `study.ts`: flashcards, Leitner boxes, quiz, Cornell layout
- `aiCore.ts`: chunking, BM25, prompts
- `audioFormat.ts`: offsets, WAV encoder, whisper JSON

Do **not** copy these, because they come from an AGPL template:
- `src/utils/`
- `addon/bootstrap.js`
- the template configuration

## Phases

Status values: ⬜ not started, 🟨 in progress, ✅ done. Update the status here when a step finishes.

### Phase 0: Tooling ✅
- ✅ Node 24 and npm 11, Rust 1.99.1 (`%USERPROFILE%\.cargo\bin`), MSVC Build Tools 2022, WebView2.
- ✅ GitHub repo: https://github.com/Ibrahim-Taskiran/Nito_01 (private, branch `main`).

### Phase 1: Foundation ✅
1. ✅ Scaffold: Tauri 2, Svelte 5, TypeScript and Vite. README covering dev, test and build, plus notes for `tauri ios init` / `tauri android init`.
2. ✅ Our own schema with versioned migrations (`src/core/db/migrations/`):
   - course
   - document: title, week, file, hash, read status, favourite
   - annotation: page, rects, colour label, text, comment
   - note: kind = live / template / digest / ai / transcript / free
   - recording, recording_mark (annotation ↔ offset in seconds)
   - tag, document_tag
3. ✅ Adding PDFs (`src/core/library/addDocuments.ts` plus the UI):
   - **Single add:** a "PDF ekle" button with a file picker.
   - **Bulk add:**
     - Pick many files at once.
     - Pick a folder (optionally with subfolders: each subfolder becomes a course).
     - Drag and drop many files or folders onto the window.
   - Shared rules, written once in `src/core` and used by every path (DRY):
     - Hash each file. Skip duplicates and report them.
     - Copy the file into app storage.
     - Clean the title and read the week from the file name ("Hafta N: …").
     - New documents start as Okunmadı.
     - Optionally choose a target course.
   - Progress bar with a cancel button for big batches. At the end, show a summary: "X eklendi, Y zaten vardı, Z hatalı".
   - First run: an empty-state screen with "PDF ekle" and "Klasör ekle".
   - Removed: the old `src/core/importer/legacyLibrary.ts` (importer for the owner's personal library).
4. ✅ Platform adapters: Tauri (rusqlite commands, files, dialogs) and web/in-memory.
5. ✅ Library UI:
   - Sidebar: courses, Tümü, Okunmamış, Favoriler.
   - Document list grouped by week, with a read-status dot and a favourite star.
   - Detail panel.
6. ✅ PDF reader:
   - pdf.js with lazy page rendering and smooth zoom.
   - Select text to highlight it with one of 5 colour labels: Önemli, Sınav, Tanım, Örnek, Soru.
   - Comments on highlights, and an annotation list panel.
7. ✅ **Audio recording while a PDF is open (must have):**
   - MediaRecorder: webm/opus on Windows, mp4/aac on iPad.
   - Timer and level meter, with pause and resume.
   - Each highlight made during a recording gets a `recording_mark`.
   - In the annotation list, a "▶ mm:ss" control plays the recording from that moment.
   - Microphone permission:
     - Windows: WebView2 prompts by itself.
     - Later for iPad: add `NSMicrophoneUsageDescription`.
     - Later for Android: add `RECORD_AUDIO`.
8. ✅ App icon from nito.ico, and light and dark themes.
9. ✅ Tests and checks:
   - vitest for `src/core`.
   - Playwright screenshots of the main screens in light and dark, saved to `docs/screenshots/`.
   - `npm run licenses`: one script checks shipped npm packages and every Rust crate (`cargo metadata`) against the allow list. No `cargo deny` install needed.
10. ✅ `tauri build` produces a Windows installer. Smoke test it.

### Phase 2: Study tools ✅
These four groups are independent and can run in parallel, each in its own git worktree.

- ✅ **2A Study:**
  - Flashcards from Tanım and Soru highlights, with Leitner boxes at 1/2/4/8/16 days.
  - Multiple-choice quiz.
  - Study Center: due cards, Sınav highlights, unread PDFs and progress, grouped by week.
  - Cornell note template.
  - Course pack export: PDFs with annotations, Markdown notes and colour digests, zipped.
- ✅ **2B Notes** (folder watch reuses the add logic from Phase 1 step 3):
  - Live note per PDF built from its highlights.
  - Colour digest note per course.
  - Markdown export.
  - Links from a note back to the highlight's place in the PDF.
  - Clean titles from file names ("Hafta N: …").
  - Watch course folders: rescan at start and every 10 minutes, skip duplicates by hash.
- ✅ **2C Transcription:**
  - whisper.cpp (MIT) as a Tauri sidecar on desktop. Setup script downloads it into the app data folder.
  - Recording is converted to 16 kHz WAV, then transcribed.
  - The transcript becomes a note with mm:ss headings and is searchable.
  - Larger optional model for better Turkish: large-v3-turbo.
- ✅ **2D AI and side-by-side:**
  - Ollama (local, free) for summaries and "chat with notes", using BM25 retrieval over course texts.
  - Choose a model whose licence allows commercial use, e.g. `qwen2.5:7b` (Apache-2.0). Note: `qwen2.5:3b` is research-only.
  - Side-by-side reading of two PDFs in one window (split view).

### Phase 3: Tablets 🟨
- `tauri android init` and `tauri ios init`.
- Platform adapters for mobile storage and for the microphone.
- ✅ Pencil and stylus: handwriting and ink annotations with pointer events and pressure.
- ✅ Touch gestures: pinch zoom and swipe between pages.
- ✅ Whisper and Ollama are desktop-only at first. Hide them on mobile, or offer a "send to desktop" option later.

### Phase 3.5: Richer UI (owner request 2026-10-30) ✅
The owner found the UI too empty next to similar apps. Three parallel worktree agents:
- ✅ **Reader:** icon + text toolbar, "Ses kaydı" (renamed from "Kaydet"), page number box, search (Ctrl+F), left panel (page thumbnails, outline), pen kinds (tükenmez, kurşun kalem, fosforlu) with 10+ colours, custom colour and width, laser pen (not saved, fades), insert image from gallery (move, resize, delete). Migration 006.
- ✅ **Library:** cover cards, search (Ctrl+K), sort, grid/list, course chips, reading progress + "Kaldığın yerden devam et", right-click menu (rename, move to course, week, delete). Migration 007 (`last_page`, `page_count`, `last_opened_at`).
- ✅ **Home "Bugün" + weekly plan "Program":** start screen (continue reading, today's plan, due cards, recent highlights and recordings), week planner with repeat, drag to another day. Migration 008 (`plan_item`).

### Phase 3.6: Lecture tools (owner request 2026-10-30) ⬜
Chosen from the owner's product list. Three parallel agents:
- ⬜ **Audio:** slide–audio sync (page changes during recording; tap a page to jump to that moment), note replay while listening, silence skip, noise reduction, 0.75–2.5× speed, transcript paragraphs linked to slides, spoken cues ("sınavda çıkar", "önemli") marked on the slide. Migration 009.
- ⬜ **Page tools:** tape mode (cover an area, tap to reveal), layer show/hide (highlights, pen, images, text), text boxes and sticky notes with LaTeX (KaTeX) and code blocks (highlight.js), margin expansion, lower pen latency (coalesced/predicted pointer events). Migration 010.
- ⬜ **Exam + performance:** page flags ("Hoca vurguladı", "Sınav adayı", "Anlaşılmadı") and an exam view that lists only flagged pages, 300–500 page PDF test and fixes, AI flashcards and questions from slides (desktop), AI chat that also cites lecture transcripts. Migration 011.
- Postponed: OCR, vector search on images and handwriting, Moodle/Canvas/Drive import, cloud sync.

### Phase 4: Release 🟨
- Code signing (free options first), installer, and an auto-update channel we control.
- 🟨 Sync between devices: file-based (folder or cloud drive) or our own small server later. Done: manual backup / restore of the whole library to a folder (Yedekle / Geri yükle). Not done: automatic two-way sync.
- Store listings for Microsoft Store, Google Play and the App Store. These have fees, so the user decides first.

## Commands
```sh
npm install
npm run dev          # browser dev with the web adapter
npm test             # vitest (src/core)
npm run tauri dev    # native window
npm run tauri build  # Windows installer
npm run licenses     # dependency licence check
```
