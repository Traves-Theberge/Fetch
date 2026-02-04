# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
| 2.0.0 | 2026-02-03 | V2 Orchestrator Architecture |
| 1.1.0 | 2026-02-02 | 4-Mode Architecture & Zod Validation |
| 0.2.0 | 2026-02-02 | TUI Redesign |
| 0.1.0 | 2026-02-01 | Initial beta release |

[2.0.0]: https://github.com/Traves-Theberge/Fetch/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/Traves-Theberge/Fetch/compare/v0.2.0...v1.1.0
[0.2.0]: https://github.com/Traves-Theberge/Fetch/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Traves-Theberge/Fetch/releases/tag/v0.1.0
