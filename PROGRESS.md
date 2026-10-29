# Progress log

Newest entry first. Each entry records: what was finished, the files touched, the commit, what is half done, the next step and any problems.

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
