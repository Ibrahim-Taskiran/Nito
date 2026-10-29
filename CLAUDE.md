# Rules for every agent working on Nito_01

1. Read [ROADMAP.md](ROADMAP.md) first, then the latest entries in [PROGRESS.md](PROGRESS.md). Continue from where the last agent stopped.
2. Keep progress on record while you work. The user's token budget can run out at any moment, and work must never be lost.
   - After each finished step (and at least every ~30 minutes), add a dated entry at the top of PROGRESS.md:
     - what you finished
     - files touched
     - commit hash
     - what is half done
     - the exact next step
     - known problems
   - Update the matching status icon in ROADMAP.md (⬜ → 🟨 → ✅).
   - Commit and push (`git push origin main`, or your feature branch) after each entry, so the next agent can pick up from GitHub.
   - Write a work-in-progress commit (`wip: …`) rather than leave changes uncommitted.
3. Follow the fixed decisions and architecture rules in ROADMAP.md: permissive licences only, no paid tools, DRY, pure `src/core`, platform adapters, a calm UI.
4. Never write to `C:\Users\ibrah\Nito` and never commit user data (PDFs, `nito.sqlite`, `storage/`, recordings).
5. Logs: read only `tail -n 40` or the error lines. Tests: read only the summary and the failing tests.
6. End every commit message with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
