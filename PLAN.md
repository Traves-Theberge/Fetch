# Fetch V3.1.2 — Comprehensive Audit & Deployment Plan

> Generated from full project audit: source code, Go TUI, documentation, project structure, Docker configs.

---

## Executive Summary

The V3.1.1 codebase is **TypeScript-clean** (0 tsc errors, 0 ESLint errors) but has critical issues in:
1. **Project structure** — path resolution bugs that break identity/skills/tools in Docker
2. **Go TUI** — config editor has a data-loss bug, whitelist manager is disconnected from actual trust system
3. **Documentation** — 4 dead/stale docs, 3 duplicated files, 6+ V2 references in current docs
4. **Missing docs** — no glossary, architecture deep-dive, or unified configuration reference

---

## Phase 1: Critical Bug Fixes (P0)

### 1.1 — Identity Loader Filename Mismatch 🔴
**Bug:** `identity/loader.ts` looks for `SYSTEM.md` and `USER.md`, but actual files are `COLLAR.md` and `ALPHA.md`.
**Impact:** Identity system silently falls back to hardcoded defaults. All personality customization is dead.
**Fix:** Update loader to use `COLLAR.md` and `ALPHA.md` filenames.

### 1.2 — Data Path Resolution Bug in Docker 🔴
**Bug:** Three modules compute paths as `path.resolve(process.cwd(), '../data/...')`:
- `identity/manager.ts` → `../data/identity`
- `skills/manager.ts` → `../data/skills`
- `tools/registry.ts` → `../data/tools`

In Docker, `process.cwd()` = `/app`, so `../data` resolves to `/data/identity` — but the volume mount is `./data:/app/data`, making the correct path `/app/data/identity`.

**Fix:** Create a centralized `src/config/paths.ts` module:
```typescript
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
export const IDENTITY_DIR = path.join(DATA_DIR, 'identity');
export const SKILLS_DIR = path.join(DATA_DIR, 'skills');
export const TOOLS_DIR = path.join(DATA_DIR, 'tools');
export const MEMORY_DIR = path.join(DATA_DIR, 'memory');
```

### 1.3 — Ghost `fetch-app/data/` Directory 🔴
**Bug:** `fetch-app/data/identity/` contains 0-byte `ALPHA.md` and `COLLAR.md`. These are tracked in git but never used.
**Fix:** Delete entire `fetch-app/data/` directory. Real data lives at root `data/`.

---

## Phase 2: Project Structure Cleanup (P1)

### 2.1 — Orphaned Root `package.json`
The root `package.json` + `package-lock.json` contain ~100+ installed packages including `mongodb`, `mongoose`, `pg`, `redis`, `http-server` — **none of which are used by the project**. The actual app is in `fetch-app/package.json`.
**Fix:** Delete root `package.json`, `package-lock.json`, and `node_modules/`.

### 2.2 — Triple Changelog / Double README
| File | Status | Action |
|------|--------|--------|
| `CHANGELOG.md` (root) | ✅ Canonical (3.1.1, 18 versions) | **Keep** |
| `docs/markdown/CHANGELOG.md` | ⚠️ Missing v2.4.3/v2.4.4, stale footer | **Replace with root copy** |
| `fetch-app/CHANGELOG.md` | ⚠️ Missing v3.1.1, stale footer | **Delete** |
| `README.md` (root) | ✅ Canonical (V3.1) | **Keep** |
| `docs/markdown/README.md` | 🔴 Frozen at V2 | **Replace with root copy** |

### 2.3 — `.gitignore` / `.dockerignore` Fixes
- Root `.gitignore` should ignore root-level `node_modules/` (from the orphan package.json cleanup)
- Root `.dockerignore` should exclude `manager/`, `kennel/`, `.git/` to speed Docker builds
- `fetch-app/.dockerignore` is unused (build context is repo root) — delete it

### 2.4 — Missing Directories
- `data/skills/` — code expects this to exist for user skills; create with `.gitkeep`
- `data/tools/` — code expects this for custom tool definitions; create with `.gitkeep`

---

## Phase 3: Go TUI Fixes (P1–P2)

### 3.1 — Config Editor Data-Loss Bug 🔴
**Bug:** `saveToFile()` in `config/editor.go` rewrites the entire `.env` with only 6 known fields, **deleting all other entries** (`OPENAI_API_KEY`, `ENABLE_COPILOT`, `ENABLE_CLAUDE`, `ENABLE_GEMINI`, `TZ`, comments).
**Fix:** Implement a proper `.env` parser that preserves unknown keys and comments during save.

### 3.2 — Whitelist Manager Disconnected 🔴
**Bug:** `config/whitelist.go` writes to `config/trusted_numbers.json` — a file nobody reads. V3.1 trust uses `OWNER_PHONE_NUMBER` env var + `/trust` commands via `security/whitelist.ts`.
**Fix:** Either rewire to write to `.env`'s `TRUSTED_PHONE_NUMBERS` field, or replace with a screen that sends HTTP commands to the bridge API.

### 3.3 — Config Editor Field Mismatch
Currently shows: `OWNER_PHONE_NUMBER`, `TRUSTED_PHONE_NUMBERS`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `LOG_LEVEL`.
Should show: `OWNER_PHONE_NUMBER`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ENABLE_COPILOT`, `ENABLE_CLAUDE`, `ENABLE_GEMINI`, `LOG_LEVEL`, `TZ`.

### 3.4 — Stale Model Recommendations
**Issue:** `models/openrouter.go` hardcodes models like `anthropic/claude-3-5-sonnet`, `google/gemini-2.0-flash-exp:free`, `openai/gpt-4-turbo` — all renamed/deprecated.
**Fix:** Update model list to current OpenRouter IDs.

### 3.5 — Version Info Never Injected
`build.sh` doesn't use `-ldflags` to inject version/commit/date. Binary always shows `v1.0.0-dev`.
**Fix:** Add ldflags to build script.

### 3.6 — Unused Components (Dead Code)
Never used: `LogViewer` (525 lines), `Menu`, `Spinner`, `Progress`, most of `layout/`. The `update/update.go` feature is never called from any menu.
**Fix:** Either wire these up to replace inline implementations, or delete them.

### 3.7 — Dependency Updates
| Package | Current | Latest |
|---------|---------|--------|
| `bubbletea` | v1.3.4 | v1.3.10 |
| `golang.org/x/net` | v0.3.8 | v0.33.0 🔴 (security) |
| `golang.org/x/sys` | v0.30.0 | v0.40.0 |
| `golang.org/x/sync` | v0.11.0 | v0.19.0 |

### 3.8 — Hardcoded Development Path
`paths/paths.go` defaults to `/home/traves/Development/1. Personal/Fetch` — won't work elsewhere.
**Fix:** Auto-detect from executable location or require `FETCH_ROOT` env var.

### 3.9 — Kennel Description Stale
Version screen says "Kennel: Multi-Model AI Orchestrator" — should be "CLI Execution Sandbox".

---

## Phase 4: Documentation Overhaul (Deep-Wiki Style)

### 4.1 — Delete Dead Documentation
| File | Reason |
|------|--------|
| `docs/markdown/RETRIEVAL.md` | Documents deleted `src/retrieval/` module (6 files removed in 3.1.1) |
| `fetch-app/CHANGELOG.md` | Stale duplicate of root CHANGELOG |
| `fetch-app/docs/markdown/CODE_AUDIT_CHECKLIST.md` | Superseded by `docs/markdown/` version |
| `fetch-app/docs/markdown/IMPLEMENTATION_CHECKLIST.md` | Historical only (V3.0) |
| `fetch-app/docs/markdown/IMPLEMENTATION_PLAN_V3_1.md` | Historical only (V3.1, completed) |
| `data/memory/MEMORY.md` | Memory module was deleted; verify no code reads this |

### 4.2 — Update Existing Documentation

#### DOCUMENTATION.md — Major Rewrite 🔴
- Remove all V1 tool references (file tools, code tools, shell tools, git tools, control tools)
- Update "V2 Intent System" → V3.1 four-layer architecture (Instinct→Mode→Skill→Agent)
- Fix project structure (remove deleted files: `agent/conversation.ts`, `agent/inquiry.ts`, `executor/docker.ts`)
- Update footer version from "v0.2.0" to "v3.1.2"

#### API_REFERENCE.md — Moderate Update 🟡
- Remove Section 8 (Retrieval API) — code is deleted
- Update Section 9 (Instinct API) with full instinct registry
- Remove `FETCH_V2_ENABLED` from env vars
- Update footer version from "v2.1.0" to "v3.1.2"

#### SETUP_GUIDE.md — Moderate Update 🟡
- Fix identity file references: `SYSTEM.md` → `COLLAR.md`, `USER.md` → `ALPHA.md`
- Update "V2 Intent System" → V3.1 four-layer architecture
- Standardize security layer count (pick one: 6 or 7, and be consistent everywhere)
- Update model recommendations

#### AGENTIC_PLAN.md — Light Update 🟢
- Clean orphaned V2 fragments in bottom half
- Update session type references

#### STATE_MANAGEMENT.md — Light Update 🟢
- Remove `MemoryManager` reference (module deleted)

#### COMMANDS.md — Verify 🟢
- Verify context management commands (`@fetch add`, `@fetch drop`) still work
- Ensure "Reflex" heading matches "Instinct" code terminology

### 4.3 — Create New Documentation

#### `docs/markdown/GLOSSARY.md` — Dog-Themed Nomenclature 🔴
Essential for onboarding. Maps every dog term to its technical meaning:
- **Fetch** — The orchestrator agent
- **Bridge** (fetch-bridge) — WhatsApp client + Node.js orchestration container
- **Kennel** (fetch-kennel) — CLI execution sandbox container
- **Pack** — The collection of AI harnesses (Claude, Gemini, Copilot)
- **Harness** — An AI CLI wrapper (leash metaphor)
- **Collar** — Fetch's core identity/personality rules
- **Alpha** — The user/owner profile
- **Instincts** — Fast-path pre-processing layer (like a dog's trained instincts)
- **Skills** — Pluggable expertise modules
- **Modes** — State machine: ALERT 🟢 / WORKING 🔵 / WAITING ⏳ / GUARDING 🔴
- **Workspace** — The shared directory for file operations

#### `docs/markdown/ARCHITECTURE.md` — Deep Architecture 🟡
Detailed component map showing:
- Initialization sequence (22 singletons, boot order)
- Message flow: WhatsApp → Bridge → Instincts → Mode Handler → Agent → Harness → Kennel → Response
- Data flow: SQLite persistence, session/thread model, task scheduling
- Docker architecture: Bridge + Kennel container relationship
- Security model: Trust chain from phone number → whitelist → rate limiter → safety instinct

#### `docs/markdown/CONFIGURATION.md` — Unified Config Reference 🟡
Every configurable aspect in one place:
- All `.env` variables with types, defaults, and descriptions
- `docker-compose.yml` volume mounts and their purposes
- Identity files (`COLLAR.md`, `ALPHA.md`, `AGENTS.md`) format and fields
- Skill definition files (`SKILL.md` frontmatter format)
- Custom tool definitions (`data/tools/*.json` schema)
- Polling configuration (`data/POLLING.md` format)

### 4.4 — Update Docs Site
- Add GLOSSARY, ARCHITECTURE, CONFIGURATION to sidebar in `docs/index.html`
- Remove RETRIEVAL from sidebar (if present)
- Add CODE_AUDIT_CHECKLIST to sidebar

### 4.5 — Fix Root README
- Fix clone URL: `yourusername` → `Traves-Theberge`
- Verify default model reference

---

## Phase 5: Build & Deploy

### 5.1 — Build Docker Images
```bash
docker compose build fetch-bridge fetch-kennel
```

### 5.2 — Build Go TUI
```bash
cd manager && go mod tidy && go build -ldflags "-X main.version=3.1.2 -X main.buildDate=$(date -u +%Y-%m-%dT%H:%M:%SZ)" -o fetch-manager .
```

### 5.3 — Verify Startup
```bash
docker compose up -d
./manager/fetch-manager
```

---

## Execution Order

| # | Phase | Priority | Estimated Scope |
|---|-------|----------|----------------|
| 1 | Critical Bug Fixes (1.1–1.3) | P0 | 4 files modified, 1 dir deleted |
| 2 | Project Structure Cleanup (2.1–2.4) | P1 | 5 files deleted, 2 dirs created |
| 3 | Go TUI Critical Fixes (3.1–3.3) | P1 | 3 Go files modified |
| 4 | Dead Documentation Cleanup (4.1) | P1 | 5–6 files deleted |
| 5 | Doc Sync (4.2 updates) | P1 | 5 files updated |
| 6 | Go TUI Polish (3.4–3.9) | P2 | 4 Go files modified |
| 7 | New Documentation (4.3) | P2 | 3 new files created |
| 8 | Docs Site Update (4.4) | P2 | 1 file updated |
| 9 | .gitignore/.dockerignore (2.3) | P2 | 3 files modified |
| 10 | Build & Deploy (5.1–5.3) | P3 | Infrastructure only |

---

## Terminology Consistency Standard

These terms are **canonical** (code wins over docs):

| Term | Meaning | Wrong Variants |
|------|---------|---------------|
| **Instincts** | Fast-path pre-processing layer | "Reflexes" (planned rename never executed) |
| **COLLAR.md** | Fetch's personality/rules file | "SYSTEM.md" |
| **ALPHA.md** | User/owner profile file | "USER.md" |
| **Bridge** | WhatsApp + orchestration container | "Brain" (legacy) |
| **Kennel** | CLI execution sandbox | "Multi-Model AI Orchestrator" (wrong) |
| **Pack** | Collection of AI harnesses | — |
| **Harness** | AI CLI wrapper | "Model", "Provider" |
