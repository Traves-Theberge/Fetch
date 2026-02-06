# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.1] - 2026-02-05 (Runtime Fixes, Security Hardening & Dead Code Purge 🔒)

### 🔴 Runtime Crash Fixes (P0)
- **Session Store DDL:** Fixed `conversation_threads` table DDL that had completely mismatched columns vs prepared statements (would crash on first thread operation). Added missing `meta` table DDL. Removed dead `memory_facts` and `working_context` tables (zero readers/writers).
- **Harness Executor:** `sendInput()` and `kill()` were reading from a `processes` Map that the pool-based execution path never populated — every call threw "Harness not found". Rewired both through `pool.sendInput()` → `spawner.sendInput()` using the actual ChildProcess stdin.
- **Task Respond:** `handleTaskRespond()` had a `// TODO: Send response to harness via stdin` — it resumed task state but never actually delivered the user's response. Now wired through `executor.sendInput()`.
- **Env Validation Order:** `validateEnvironment()` ran *after* 3 subsystems had already started. Moved to first line of `main()` so missing API keys fail fast.

### 🔒 Security Hardening (P1)
- **Shell Injection — Custom Tools:** `tools/registry.ts` `createShellHandler()` did raw `{{param}}` string interpolation into shell commands. Now escapes values with single-quote wrapping.
- **Shell Injection — Workspace Manager:** Workspace names passed directly into `sh -c` strings. Added `^[a-zA-Z0-9._-]+$` validation and switched to heredoc-based template creation.
- **Shell Injection — Command Parser:** Git commit SHAs passed unsanitized to `exec()`. Added `/^[0-9a-f]{7,40}$/i` validation. Git clone switched from `exec()` to `execFile()` with args array.
- **Unauthenticated Logout:** `POST /api/logout` had zero authentication — any HTTP client on the Docker network could disconnect WhatsApp. Added bearer token auth (auto-generated or via `ADMIN_TOKEN` env var).
- **Validator Blocks Code:** The backtick pattern `/`.*`/` in `SUSPICIOUS_PATTERNS` rejected any message containing inline code. Removed — Docker isolation is the real protection.

### 🧹 Dead Code Purge (~880 lines)
- **`whatsapp-format.ts`:** Removed 8 dead exports (`formatMobileResponse`, `formatCode`, `formatDiff`, `formatCompactDiff`, `formatError`, `formatFileList`, `formatProgressBar`, `formatToolAction`) plus 5 helper functions. Kept only `formatForWhatsApp()`. File: 628 → 96 lines (−532).
- **`harness/executor.ts`:** Removed `spawnAndWait()` (130-line dead method), `getOutputBuffer()`, `processes` Map, unused `child_process`/`output-parser` imports. File: 596 → 403 lines (−193).
- **`utils/logger.ts`:** Removed 4 unused background color constants and dead `box()` function.
- **`config/paths.ts`:** Removed `MEMORY_DIR` export (no memory system exists).

### 📦 Infrastructure
- **Test Scripts:** Added `test`, `test:run`, `test:unit`, `test:e2e`, `test:integration` to package.json.
- **Pool stdin:** Added `sendInput()` to `HarnessSpawner` and `HarnessPool` for proper stdin passthrough.

### Files Changed (25 files, +227/−880)
- `session/store.ts`, `harness/executor.ts`, `harness/spawner.ts`, `harness/pool.ts`, `tools/task.ts`, `index.ts`, `tools/registry.ts`, `workspace/manager.ts`, `commands/parser.ts`, `api/status.ts`, `security/validator.ts`, `agent/whatsapp-format.ts`, `utils/logger.ts`, `config/paths.ts`, plus 11 doc files

## [3.2.0] - 2026-02-05 (Identity & Skills Pipeline Unification 🧬)

### 🧬 Unified Identity Pipeline
- **Single Source of Truth:** `IdentityManager.buildSystemPrompt()` is now the only system prompt builder. Deleted the static `CORE_IDENTITY`, `CAPABILITIES`, `TOOL_REFERENCE`, `UNDERSTANDING_PATTERNS` constants and 5 dead prompt functions (`buildOrchestratorPrompt`, `buildIntentPrompt`, `buildSummarizePrompt`, `buildErrorRecoveryPrompt`, `buildConversationPrompt`) from `agent/prompts.ts` — 418 lines of dead code removed.
- **Session Context Wired:** `buildContextSection()` (workspace, task, git state, summaries, repo map) was defined but never called in a live code path. Now injected into both `handleConversation()` and `handleWithTools()` so the LLM always sees session state.

### 🧩 Skill Discovery → Activation Pattern
- **Two-Phase Skills:** Available skills are listed in `<available_skills>` XML (discovery). When a skill's triggers match the user's message, its full instruction body is injected as `<activated_skill>` (activation). Previously, skill `.instructions` were loaded but never surfaced to the LLM.
- **`<location>` Field:** Each skill summary now includes `<location>` pointing to its `SKILL.md` file, following the AgentSkills spec pattern.

### 🐺 Pack Agent Sub-Files
- **Individual Agent Profiles:** Monolithic `data/identity/AGENTS.md` replaced by individual files in `data/agents/` — `claude.md`, `gemini.md`, `copilot.md` — each with YAML frontmatter parsed by gray-matter.
- **Structured Pack Data:** New `PackMember` interface (13 fields: name, alias, emoji, harness, cli, role, fallback_priority, triggers, avoid, body, sourcePath). System prompt now includes `<available_agents>` XML with routing info.
- **Routing Rules:** `data/agents/ROUTING.md` documents cross-cutting routing behavior (manual override, fallback chain, delegation protocol).
- **Hot-Reload:** `IdentityManager` now watches `data/agents/` for changes alongside `data/identity/`.

### 🧹 Legacy Cleanup
- **Dead Code Removed:** `agent/prompts.ts` gutted from 571 → 153 lines. Removed `SystemPromptConfig` interface (unused). Deleted 2 dead commented-out functions (`getCurrentMode`, `buildConversationPrompt`) from `agent/core.ts`.
- **JSDoc Updated:** All modified files have current `@fileoverview` and `@see` references. Removed stale references to `AGENTS.md`, `buildOrchestratorPrompt`, legacy tool wrapper comments.
- **Tests Fixed:** Rewrote `tool-registry.test.ts` to use actual ToolRegistry API (`list()`, `get()`, `execute()`). Was calling nonexistent methods (`getToolNames`, `has`, `getAll`, `toClaudeFormat`) and using `new ToolRegistry()` against a private constructor. Fixed `identity-loader.test.ts` "Canid" → "Orchestrator" assertion and parameterized `agentsDir` for test isolation. Added pack member loading test. All **109 tests pass**.
- **Deprecated:** `data/identity/AGENTS.md` — kept as human-readable reference with deprecation header.

### Files Changed
- `agent/core.ts` — Wired skill activation + session context into both LLM code paths, removed dead functions
- `agent/prompts.ts` — 571 → 153 lines, kept only `buildTaskFramePrompt()` + `buildContextSection()`
- `identity/manager.ts` — Accepts `activatedSkillsContext` + `sessionContext`, builds pack XML, watches agents dir
- `identity/loader.ts` — `loadAgents()` reads `data/agents/*.md` via gray-matter, configurable `agentsDir`
- `identity/types.ts` — Added `PackMember` interface, `pack` field on `AgentIdentity`, removed `SystemPromptConfig`
- `skills/manager.ts` — `<available_skills>` XML with `<location>`, new `buildActivatedSkillsContext()`
- `config/paths.ts` — Added `AGENTS_DIR`
- `tools/registry.ts` — Updated JSDoc, removed legacy comments
- `tests/unit/tool-registry.test.ts` — Full rewrite against actual API
- `tests/unit/identity-loader.test.ts` — Fixed assertions, added pack test
- `data/agents/claude.md`, `gemini.md`, `copilot.md` — New agent profiles with YAML frontmatter
- `data/agents/ROUTING.md` — Pack routing rules reference

## [3.1.1] - 2026-02-05 (Code Audit & State Architecture 🧹)

### 🧹 Comprehensive Code Audit
- **20 dead files removed:** Entire `memory/` module (3 files), `retrieval/` module (6 files), `executor/docker.ts`, `utils/stream.ts`, `utils/sanitize.ts`, `tools/types.ts` (rebuilt), 7 dead barrel `index.ts` files, and empty `executor/` directory.
- **Dead code cleaned from live files:** Removed unused `cron_jobs` table DDL from `task/store.ts`, 10 dead exports from `utils/id.ts`, 6 dead functions from `agent/format.ts`, dead `SessionSummary` and `Database` interfaces from `session/types.ts`.
- **`tools/types.ts` rebuilt:** Kept only `ToolResult` and `DangerLevel` (removed ~30 dead exports).

### 📐 State Management Architecture Doc
- Created `docs/markdown/STATE_MANAGEMENT.md` documenting all 22 stateful singletons across 6 layers.
- Mapped 9 SQLite tables across 2 databases, filesystem watchers, and in-memory stores.
- Catalogued 7 EventEmitter chains, 3 singleton patterns, and initialization order.
- Identified 5 redundancies: dual task tracking, two ThreadManagers, dead cron_jobs table, dual process maps, mode naming collision.

### 📝 Documentation
- Updated `CODE_AUDIT_CHECKLIST.md` — all deleted/cleaned files annotated.
- Added State Management link to docs site sidebar.
- Updated README.md — fixed project structure, removed dead module references, corrected V2→V3 terminology.
- Synced root and docs CHANGELOGs to parity.

## [3.1.0] - 2026-02-05 (The Responsive Orchestrator)

### 🎭 Dynamic Identity System
- **Filesystem Hot-Reloading:** Fetch's personality is now fully customizable via Markdown files in `data/identity/`.
- **Live Updates:** Editing `SYSTEM.md` (Core rules) or `USER.md` (User info) instantly updates the system prompt without a restart.
- **New Commands:** `/identity reset` and `/identity <section>` to manage the agent's persona on the fly.

### 🧠 Runtime Skill Teaching
- **Dynamic Skills:** Skills (in `data/skills/`) are now hot-reloaded. You can "teach" Fetch new capabilities by dropping a Markdown file.
- **Skill Management:** Added `/skill` command suite to list, enable, disable, and manage skills at runtime.

### 💾 Robust Persistence & Recovery
- **Crash Recovery:** Fetch now persists its exact state (WORKING, WAITING, etc.) to the database.
- **Resurrection:** If the server crashes during a task, Fetch wakes up, checks the DB, restores the state, and resumes work (or alerts the user).
- **Thread Management:** Introduction of `/thread` commands for switching contexts and manually archiving conversations.

## [3.0.0] - 2026-02-04 (The Orchestrator Architecture)

### 🏗️ Core Architecture Overhaul
- **Orchestrator Philosophy:** Re-architected Fetch to be an *orchestrator* of specialized "sub-agents" (Claude, Gemini, Copilot) rather than just a chatbot.
- **New Mode System:** Introduced formal state machine modes: `ALERT` (Listening), `WORKING` (Executing), `WAITING` (Input), `GUARDING` (Safety), `RESTING` (Idle).
- **Instincts Layer:** Deterministic "fast-path" reactions that bypass the LLM for immediate control (e.g., `stop`, `status`).

### 🛡️ Safety
- **Safety Mode:** High-risk operations (file deletion, large refactors) now trigger a `GUARDING` mode that locks the context until approved.
- **Impact Analysis:** (Beta) Pre-execution diff reviews for critical changes.

### 🧩 Skills Framework
- **Modular Capabilities:** Created a plugin-like system for "Skills" (Git, Docker, React, etc.) defined in Markdown files.
- **Auto-Loading:** Skills are automatically discovered and loaded on startup.

## [2.4.4] - 2026-02-04 (Stability & Voice Fix 🎙️)

### 🔧 Bug Fixes

#### Message Deduplication
- Fixed **triple message response** bug where WhatsApp's `message_create` event fired multiple times
- Added `MessageDeduplicator` class with 30-second TTL to prevent duplicate processing
- Messages are now tracked by ID and processed exactly once

#### Voice Transcription (Local Whisper)
- Fixed **whisper binary path** mismatch in Dockerfile (`whisper-cli` → `whisper-cpp`)
- Voice notes now transcribe correctly using local `whisper.cpp` (100% free, no API)
- Added proper binary permissions and verification logging

#### Help & Capabilities
- Updated `CAPABILITIES` prompt to include all slash commands and aliases
- Now shows consistent information when asking "what can you do" or "what commands do you have"
- Commands now show aliases (e.g., `/status` shows `/st`, `/gs`)

### 📝 Changed Files
- `bridge/client.ts` - Added MessageDeduplicator for event deduplication
- `agent/prompts.ts` - Rewrote CAPABILITIES to include all commands
- `Dockerfile` - Fixed whisper binary copy command

## [2.4.3] - 2026-02-04 (Zero Trust Bonding 🔐)

### 🔐 Phone Number Whitelist (Issue #13)
- Implemented **Zero Trust Bonding** security model for group chat access control.
- Created `WhitelistStore` class for managing trusted phone numbers with file persistence.
- Added `/trust` commands for owner to manage whitelist via WhatsApp:
  - `/trust add <number>` - Add a phone number to the whitelist
  - `/trust remove <number>` - Remove a phone number from the whitelist
  - `/trust list` - Show all trusted numbers
  - `/trust clear` - Clear all trusted numbers (dangerous!)
- Added `TRUSTED_PHONE_NUMBERS` environment variable for startup configuration.
- Updated TUI config editor to include trusted numbers field.
- Owner is always exempt from whitelist checks (cannot be locked out).
- Unauthorized `@fetch` messages are silently dropped (no information leakage).

### 🛡️ Security Flow
```
Incoming @fetch message
    ↓
Is sender the owner? → Yes → ALLOW
    ↓ No
Is sender in whitelist? → Yes → ALLOW
    ↓ No
DROP (silent)
```

## [2.4.2] - 2026-02-04 (Repo Maps & Media Intelligence 🗺️👀)

### 🗺️ Smart Repo Maps (Issue #9)
- Implemented **Repository Mapping** to give the agent architectural awareness of large projects.
- Added `repo-map.ts` to generate a tree-based summary of the workspace, including symbols (classes, functions, exports).
- Added `symbols.ts` for regex-based symbol extraction for TypeScript, Python, and Go.
- Maps are automatically cached in session storage and refreshed if older than 5 minutes.
- The agent now understands project structure *before* taking action, reducing "blind" file searches.

### 🎙️ Voice & Vision (Issues #6 & #7)
- **Voice Notes:** Built-in Whisper integration automatically transcribes voice notes and PTT into text commands.
- **Image Intelligence:** Send screenshots or diagrams! Fetch now uses OpenAI Vision to analyze images and provide context (e.g., "Fix this error" + screenshot).
- Added multimedia support to the WhatsApp Bridge, allowing seamlessly mixing voice, text, and images.

### 🌊 Live Progress Streaming (Issue #8)
- Added real-time feedback for long-running tasks.
- Fetch now streams progress updates (e.g., "📝 Editing file...", "🧪 Running tests...") directly to WhatsApp.
- Implemented intelligent throttling to prevent message spans.

### 🔧 Core Improvements
- **Unified Command Parser:** Consolidated all slash command logic (`/status`, `/select`, etc.) into a single robust parser.
- **Session Sync:** Fixed state synchronization issues where agent-initiated workspace changes weren't persisting.
- **Self-Healing:** The agent now detects and automatically recovers from 429 Rate Limits and 500 errors.

## [2.4.1] - 2026-02-04 (Harness Alignment & Diagnostics 🛠️)

### 🧩 Harness Interface Alignment
- Unified `HarnessAdapter` interface across Claude, Gemini, and Copilot.
- Implemented `extractFileOperations` in Copilot CLI adapter for consistent task summaries.
- Refined output parsing to accurately detect interactive questions vs completion summaries.

### 🛡️ System Diagnostics & Hardening
- Resolved "Cannot redeclare block-scoped variable" shadowing issues in tool layer.
- Fixed import naming collisions in main orchestrator handler (`getTaskManager` vs singleton).
- Added strict null safety checks and type-safe manager accessors.
- Cleaned up Go TUI diagnostics and optimized QR code rendering logic.

### 🧹 Code Quality
- Migrated to Flat Config (`eslint.config.js`) for ESLint 9 compatibility.
- Fixed useless regex escape characters and unused variable warnings.
- Achieved 100% test pass rate (104/104 tests) across Unit, E2E, and Integration suites.

## [2.4.0] - 2026-02-04 (Reliability & Persistence 🔄 💾)

### 🔄 Better Error Recovery & Retry Logic
- Implemented robust retry strategy with backoffs [0s, 1s, 3s, 10s].
- Added user-facing progress reporting during retries ("Hold on, fetching again... 🐕").
- Added specialized handling for `400 Bad Request`, retrying once with simplified context history.
- Consolidated all LLM calls (conversation, tools, task framing) into a unified retry handler.

### 💾 Persistent Task Management
- Created SQLite-based `TaskStore` for reliable task state preservation.
- Implemented automatic state loading on application startup.
- Ensured all task transitions and progress updates are persisted in real-time.
- Synchronized `TaskQueue` with stored active tasks to prevent data loss across restarts.

### ⚡ Docker Kennel Performance
- Optimized `Kennel` Dockerfile with multi-language runtimes (Python, Go, Rust).
- Added essential developer tools (`jq`, `tree`, `build-essential`) to the sandbox.
- Reduced image layers by grouping installations.

## [2.3.0] - 2026-02-04 (Auto-scaffold Templates 🛠️)

### 🛠️ Workspace Scaffolding Improvements

Auto-scaffolding for new workspaces using popular project templates.

### Added

**Templates:**
- `empty`: Basic directory with README and .gitignore
- `node`: Scaffolds with `npm init -y` and creates a sample `index.js`
- `python`: Creates basic structure and initializes a virtual environment (`venv`)
- `rust`: Scaffolds using `cargo init`
- `go`: Scaffolds using `go mod init` and creates a sample `main.go`
- `react`: Scaffolds a React app using Vite (`npm create vite@latest`)
- `next`: Scaffolds a Next.js app using `create-next-app` (non-interactive)

**Features:**
- Real-time progress events for workspace scaffolding
- Generous timeouts for heavy scaffolders (Next.js, Vite)
- Automatic git initialization for all scaffolded projects

### Changed

**Kennel Container:**
- Updated `kennel/Dockerfile` to include essential runtimes:
  - Python 3 + venv
  - Go 1.21+
  - Rust (cargo + rustc)

**Workspace Manager:**
- Refactored `WorkspaceManager.createWorkspace` to use actual CLI scaffolders instead of manual file creation where possible
- Added `workspace:scaffolding` events to track process lifecycle

### Technical Notes

- Uses non-interactive flags for all scaffolders (e.g., `npm init -y`, `npx create-next-app --use-npm`)
- Cleans directory before scaffolding for Next.js and React to prevent conflicts
- Addresses GitHub Issue #3: Auto-scaffold workspace_create templates

---

## [2.2.0] - 2026-02-04 (Test Harness Integration 🧪)

### 🧪 Harness Integration Testing

Comprehensive integration test suite for the CLI harness adapters (Claude, Gemini, Copilot).

### Added

**Test Coverage:**
- Created `/fetch-app/tests/integration/harness.test.ts` with 34 comprehensive tests
- OutputParser tests: question detection, progress indicators, file operations, completion detection, error handling
- Adapter integration tests: ClaudeAdapter, GeminiAdapter, CopilotAdapter output parsing
- HarnessExecutor tests: timeout handling, error recovery, event emission

**Test Categories:**
- Question Detection (4 tests): `?` endings, `[y/n]` prompts, yes/no patterns
- Progress Detection (2 tests): spinner indicators, percentage progress
- File Operation Detection (4 tests): created/modified/deleted files, Gemini bracket format
- Completion Detection (2 tests): "Done" messages, Copilot completion phrases
- Error Detection (2 tests): error messages, fatal errors
- ANSI Stripping (2 tests): strip/preserve ANSI codes
- Streaming Buffer (2 tests): partial lines, buffer flushing
- Adapter Output Parsing (10 tests): ClaudeAdapter, GeminiAdapter, CopilotAdapter
- HarnessExecutor (6 tests): timeout, invalid command, invalid cwd, unregistered adapter, events

### Technical Notes

- Tests use mock CLI output samples that match actual CLI output patterns
- Executor tests use real shell commands with proper timing for output buffering
- Addresses GitHub Issue #2: Test Harness Integration

---

## [2.1.2] - 2026-02-03 (SQLite Cleanup 🗄️)

### 🗄️ Database Cleanup

Removed all remnants of the old lowdb/JSON-based session storage.

### Fixed

**Documentation:**
- Updated API_REFERENCE.md with correct SQLite-based SessionStore API
- Updated SETUP_GUIDE.md to reference `sessions.db` instead of `sessions.json`
- Updated PLAN.md file structure to show SQLite database

**Configuration:**
- Updated .dockerignore to exclude SQLite files (sessions.db, sessions.db-wal, sessions.db-shm)

### Removed

- Deleted old `data/sessions.json` file (no longer used)
- Removed outdated `tasks.json` reference from PLAN.md

---

## [2.1.1] - 2026-02-03 (Documentation & Diagrams Update 📊)

### 📊 Architecture Visualization Improvements

Enhanced documentation with better diagrams and clearer intent classification.

### Changed

**README.md:**
- Redesigned architecture diagram with emoji icons and better visual hierarchy
- Updated message flow diagram to show 4-mode intent classification (Chat, Inquiry, Action, Task)
- Added interactive diagrams link pointing to docs server
- Improved ASCII art formatting for better readability

**Documentation:**
- Updated DOCUMENTATION.md with 4-mode intent classification system:
  - 💬 Conversation — Greetings, thanks, general chat (direct response)
  - 🔍 Inquiry — Questions about code (read-only tools)
  - ⚡ Action — Single edits/changes (full tools, 1 cycle)
  - 📋 Task — Complex multi-step work (full tools, ReAct loop)
- Corrected tool count to 11 tools
- Added diagram placeholders for message flow, harness system, and tools

**Styling:**
- Enhanced diagram container styles with better spacing and shadows
- Added responsive SVG support with max-width and auto height
- Improved dark mode diagram appearance with elevated card background

---

## [2.1.0] - 2026-02-03 (Good Boy Update 🐕)

### 🐕 "Good Boy" Personality Enhancement

Fetch is now a proper good boy who just wants to help! Woof!

### Added

**New Tools:**
- `workspace_create` - Create new projects with templates (empty, node, python, rust, go, react, next)
- `workspace_delete` - Delete projects with required confirmation

**Tool Count:** 9 → 11 tools total (5 workspace + 4 task + 2 interaction)

**Personality:**
- Full good boy energy with tail wags and woofs
- Lobster hatred 🦞 - Fetch DESPISES lobsters (weird ocean bugs with claws!)
- "Guard dog mode" for security concerns
- "Let me fetch that!" and "Good boy reporting back!" expressions
- Error messages: "Ruff, hit a snag!" instead of cold errors

**Project Templates:**
- `empty` - Just README
- `node` - package.json, index.js, .gitignore
- `python` - main.py, requirements.txt
- `rust` - Cargo.toml, src/main.rs
- `go` - go.mod, main.go
- `react` - Vite React scaffold
- `next` - Next.js scaffold

### Changed

**Prompts Rewritten:**
- `CORE_IDENTITY` - Now a loyal coding companion, not just a tool
- `CAPABILITIES` - "What I Can Fetch For You 🦴" with dog personality
- `TOOL_REFERENCE` - Complete table of all 11 tools
- Response examples with *wags tail* and enthusiasm
- Error recovery with "Good dogs don't give up!"

**Documentation:**
- Updated PROMPT_ENGINEERING.md with cleaner structure
- Removed excessive dog metaphors from code comments (kept in user-facing prompts)

### Fixed

- Can now create new projects (was missing workspace_create tool)
- Can now delete projects with proper confirmation flow
- Tool listing when user asks "what can you do?"

---

## [2.0.1] - 2026-02-03 (Prompt Engineering Update)

### 🐕 "Good Sniffer Dog" Prompt Engineering

Major prompt engineering improvements to make Fetch a better companion.

### Added

**Prompt System:**
- `CORE_IDENTITY` - Enhanced personality with "good sniffer dog" metaphor
- `UNDERSTANDING_PATTERNS` - Smart interpretation of vague requests
- `CAPABILITIES` - Clear, scannable list of what Fetch can do
- [docs/PROMPT_ENGINEERING.md](docs/PROMPT_ENGINEERING.md) - Complete prompt engineering guide

**Ethical Guidelines:**
- "DO no evil, protect and serve" philosophy
- Explicit confirmation for destructive operations
- Safety-first approach to data changes
- Secret protection (never log credentials)

**Intent Classification:**
- Reorganized patterns into semantic categories
- Added entity extraction (file paths, actions, destructive flag)
- Improved confidence scoring with better thresholds
- Added `ExtractedEntities` type for richer classification results
- Better LLM fallback logic for ambiguous cases

### Changed

**Orchestrator Prompt:**
- Added "Understanding Your Human" section for vague requests
- Added emotional signal handling (frustration, urgency, uncertainty)
- Improved edge case examples with dog personality
- Added smart interpretation examples ("fix it", "make it work", "the usual")

**Intent Patterns:**
- Split `CONVERSATION_PATTERNS` into subcategories (greetings, thanks, farewells, help, reactions)
- Split `WORKSPACE_PATTERNS` into subcategories (list, select, status, context)
- Split `TASK_PATTERNS` into subcategories (create, modify, refactor, destructive, test, debug)
- Added extensive file extension patterns for code context detection
- Added code indicator patterns (keywords, syntax markers)

**Response Style:**
- More consistent dog personality ("Let me fetch that!", "Sniffing around...")
- Better error recovery messages with supportive tone
- Confirmation prompts for destructive operations
- Clearer next-step suggestions

### Security

- Added `isDestructive` flag in entity extraction
- Destructive actions always require explicit confirmation
- Added backup/branch suggestions for risky changes

---

## [2.0.0] - 2026-02-03 (Fetch-v2-demo)

### 🚀 Major Architecture Change: Orchestrator Model

Fetch V2 transforms from a **24-tool coding assistant** to an **8-tool orchestrator** that delegates work to specialized harnesses (Claude Code, Gemini CLI, Copilot CLI).

### Added

#### 🎯 V2 Orchestrator Architecture

**Core Components:**
- `agent/core-v2.ts` - V2 agent with 3-intent classification and tool execution loop
- `agent/intent-v2.ts` - Simplified intent classifier (conversation, workspace, task)
- `agent/prompts-v2.ts` - Orchestrator prompts for routing, framing, summarizing, error recovery
- `handler/v2.ts` - V2 message handler with feature flags for gradual rollout

**Task Management:**
- `task/types.ts` - Complete task domain types (Task, TaskStatus, TaskResult, TaskProgress)
- `task/manager.ts` - Task lifecycle management with state machine
- `task/queue.ts` - Single-task queue with capacity management
- `task/integration.ts` - Task-harness integration layer with event routing

**Harness Execution:**
- `harness/types.ts` - Harness types (HarnessConfig, HarnessExecution, HarnessResult, HarnessEvent)
- `harness/executor.ts` - Process spawning, output streaming, question detection
- `harness/claude.ts` - Claude Code adapter with `--print` mode
- `harness/output-parser.ts` - Output parsing for questions, errors, and completion

**Workspace Management:**
- `workspace/types.ts` - Workspace and project context types
- `workspace/manager.ts` - Workspace discovery, selection, git status

**Validation:**
- `validation/common.ts` - Common Zod schemas (SafePath, PositiveInt, etc.)
- `validation/tools.ts` - Tool-specific input/output schemas for all 8 V2 tools

**Utilities:**
- `utils/id.ts` - ID generators with prefixes (tsk_, hrn_, ses_, prg_)
- `utils/docker.ts` - Docker utilities for container operations
- `utils/stream.ts` - Stream utilities for output handling

#### 🛠️ New V2 Tools (8 total)

**Workspace Tools:**
| Tool | Description |
|------|-------------|
| `workspace_list` | List available workspaces in /workspace |
| `workspace_select` | Select active workspace |
| `workspace_status` | Get workspace git status and info |

**Task Tools:**
| Tool | Description |
|------|-------------|
| `task_create` | Create a coding task for harness execution |
| `task_status` | Get task status, progress, and pending questions |
| `task_cancel` | Cancel a running task |
| `task_respond` | Respond to a task's pending question |

**Interaction Tools:**
| Tool | Description |
|------|-------------|
| `ask_user` | Ask user a question during task execution |
| `report_progress` | Report task progress with percentage and files |

#### 🔧 Feature Flags

```bash
# Enable V2 orchestrator (default: false)
FETCH_V2_ENABLED=true

# Gradual rollout percentage (0-100)
FETCH_V2_ROLLOUT_PERCENT=100
```

#### 📦 New Dependencies

- `dockerode@4.0.9` - Docker API for container operations
- `nanoid@5.1.5` - ID generation

### Changed

#### 🏗️ Architecture Transformation

| Aspect | V1 | V2 |
|--------|----|----|
| Tools | 24 direct file/git/shell tools | 8 orchestrator tools |
| Execution | Fetch executes directly | Delegates to harnesses |
| Intent | 4 modes (conversation/inquiry/action/task) | 3 intents (conversation/workspace/task) |
| File operations | Fetch reads/writes files | Harness reads/writes files |
| Git operations | Fetch commits directly | Harness commits directly |
| Code analysis | Fetch analyzes code | Harness analyzes code |

#### 📁 Legacy Tool Migration

- Moved legacy tools to `tools/legacy/`:
  - `file.ts`, `code.ts`, `shell.ts`, `git.ts`, `control.ts`, `schemas.ts`
- Updated imports across codebase to use legacy paths
- Re-exported git utilities (`getCurrentCommit`, `resetToCommit`) for backward compatibility

#### 🔄 Updated Modules

- `agent/index.ts` - Exports both V1 and V2 agent APIs
- `tools/index.ts` - Exports V2 tools and legacy utilities
- `tools/registry.ts` - Updated to import from legacy folder
- `commands/parser.ts` - Updated git utility imports

### Fixed

#### 🛡️ Error Handling

- Added error tracking to prevent runaway responses on repeated failures
- Implemented circuit breaker pattern (MAX_CONSECUTIVE_ERRORS = 3)
- Added exponential backoff for retriable errors
- Proper handling of 400/401/404 errors (no retry)

#### 🏷️ Type Safety

- Fixed OpenAI tool call type handling for custom tool formats
- Fixed Session.messages vs conversationHistory field usage
- Fixed Message type requiring id field
- Added task:paused and task:resumed events to TaskEventType

### Security

- Feature flags allow controlled V2 rollout
- User ID hashing for consistent rollout bucketing
- Maintained whitelist authentication
- Rate limiting preserved

---

## [1.1.0] - 2026-02-02

### Added

#### 🛠️ Zod Runtime Validation
- **Tool argument validation** using Zod schemas for all 24 tools
- **Type-safe schemas** with runtime constraint checking
- **Validation function** `validateToolArgs()` with detailed error messages
- **Schema registry** `toolSchemas` mapping tool names to Zod schemas

#### 📚 Comprehensive JSDoc Documentation
- **36 TypeScript files** with full `@fileoverview` documentation
- Module-level documentation with `@module` identifiers
- Cross-references with `@see` tags between related modules

#### 🧠 4-Mode Architecture
- **Conversation Mode** - Quick chat without tools
- **Inquiry Mode** - Read-only code exploration
- **Action Mode** - Single edit cycle with approval
- **Task Mode** - Full multi-step task execution

#### 🎯 Intent Classification
- Automatic intent detection based on message patterns
- Routes to appropriate mode without user intervention

#### 📁 Project Management
- `/projects` - List all git repositories in workspace
- `/project <name>` - Switch active project context
- `/clone <url>` - Clone repositories into workspace

### Fixed
- **WhatsApp Self-Chat Message Handling** - Messages sent to yourself now properly processed
- **Naming Convention Cleanup** - Renamed `ValidationResult` → `ToolValidationResult`

---

## [0.2.0] - 2026-02-02

### Added
- **TUI Redesign** - Complete visual overhaul using Charmbracelet ecosystem
- **Model Selector** - Interactive OpenRouter model browser
- **@fetch trigger system** - All messages must now start with `@fetch` prefix
- **Enhanced logging system** - Beautiful, human-readable logs
- **QR code in TUI** - ASCII QR code rendering directly in terminal
- **Documentation site** - Beautiful HTML docs with HLLM design system

### Changed
- **Manager Menu Streamlined** - Reduced from 11 to 9 items
- Status API port changed from 3001 to **8765**
- Security gate completely rewritten for @fetch trigger support

### Fixed
- Group messages now properly supported with owner verification

---

## [0.1.0] - 2026-02-01

### Added
- Initial release of Fetch - Your Faithful Code Companion
- WhatsApp bridge using `whatsapp-web.js` for messaging interface
- Go TUI Manager with Bubble Tea framework for service management
- Agentic framework powered by GPT-4.1-nano via OpenRouter
- 24 built-in tools for file, code, shell, git, and control operations
- ReAct (Reason + Act) loop for multi-step autonomous tasks
- Session memory with persistent conversation context
- Docker-based architecture with Bridge and Kennel containers
- Multi-agent support: Claude Code, Gemini CLI, GitHub Copilot

### Security
- Whitelist-only authentication (OWNER_PHONE_NUMBER)
- Rate limiting (30 requests/minute)
- Input validation and sanitization
- Docker isolation for command execution

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 3.1.1 | 2026-02-05 | Code Audit & State Architecture |
| 3.1.0 | 2026-02-05 | Dynamic Identity, Skills, Crash Recovery |
| 3.0.0 | 2026-02-04 | Orchestrator Architecture & Mode System |
| 2.4.4 | 2026-02-04 | Stability & Voice Fix |
| 2.4.3 | 2026-02-04 | Zero Trust Bonding |
| 2.4.2 | 2026-02-04 | Repo Maps & Media Intelligence |
| 2.4.1 | 2026-02-04 | Harness Alignment & Diagnostics |
| 2.4.0 | 2026-02-04 | Reliability & Persistence |
| 2.3.0 | 2026-02-04 | Auto-scaffold Templates |
| 2.2.0 | 2026-02-04 | Test Harness Integration |
| 2.1.2 | 2026-02-03 | SQLite Cleanup |
| 2.1.1 | 2026-02-03 | Documentation & Diagrams |
| 2.1.0 | 2026-02-03 | Good Boy Update |
| 2.0.1 | 2026-02-03 | Prompt Engineering |
| 2.0.0 | 2026-02-03 | V2 Orchestrator Architecture |
| 1.1.0 | 2026-02-02 | 4-Mode Architecture & Zod Validation |
| 0.2.0 | 2026-02-02 | TUI Redesign |
| 0.1.0 | 2026-02-01 | Initial beta release |

[3.1.1]: https://github.com/Traves-Theberge/Fetch/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/Traves-Theberge/Fetch/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/Traves-Theberge/Fetch/compare/v2.4.4...v3.0.0
[2.4.4]: https://github.com/Traves-Theberge/Fetch/compare/v2.4.3...v2.4.4
[2.4.3]: https://github.com/Traves-Theberge/Fetch/compare/v2.4.2...v2.4.3
[2.4.2]: https://github.com/Traves-Theberge/Fetch/compare/v2.4.1...v2.4.2
[2.0.0]: https://github.com/Traves-Theberge/Fetch/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/Traves-Theberge/Fetch/compare/v0.2.0...v1.1.0
[0.2.0]: https://github.com/Traves-Theberge/Fetch/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Traves-Theberge/Fetch/releases/tag/v0.1.0
