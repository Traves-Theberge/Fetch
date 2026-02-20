# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.95] - 2026-02-20

### Added

- **Semantic Memory Recall** — Memory retrieval now uses OpenAI vector embeddings and cosine similarity alongside traditional keyword matching. This allows Fetch to understand the *meaning* of past interactions even if keywords don't match exactly.
- **Dynamic Token-Based Compaction** — Session compaction now triggers based on estimated token counts (using a 4:1 character-to-token ratio) in addition to message count, preventing context window overflow in high-density conversations.
- **LLM Tool Loop Bailout** — Implemented a hard safety break in the tool execution loop. If a single turn exceeds the maximum iteration limit, Fetch will automatically stop calling tools and provide a final summary.
- **Model Specialization** — Complex turns or bailout scenarios now use the `SUMMARY_MODEL` (configurable) for the final response, ensuring higher-quality summaries for long execution paths.
- **Improved Cautious Mode Guidance** — Tool registry now provides explicit instructions to the LLM when a tool requires confirmation, guiding it to use the `ask_user` tool correctly.

### Fixed

- **Thread Reply Resilience** — Re-enabled thread replies with a localized `botRecentMessageIds` cache to prevent infinite self-reply loops.
- **Persistent Rate Limiting** — Rate limit timestamps are now persisted in SQLite, ensuring they survive application restarts.

## [0.0.94] - 2026-02-18

### Fixed

- **On-demand WhatsApp pairing startup** — Bridge runtime now keeps WhatsApp disconnected at boot and starts pairing only when explicitly requested from Setup WhatsApp (`/api/whatsapp/start`), preventing pre-setup QR retry exhaustion.
- **In-TUI QR refresh without full Fetch restart** — Added WhatsApp restart control endpoint (`/api/whatsapp/restart`) and wired Setup-screen `r` to request a fresh pairing cycle directly.
- **Stop verification hardening** — Manager stop flow now performs post-down wait/cleanup checks and force-removes lingering fixed-name containers before reporting failure.
- **Version bump** — Bumped project/runtime package versions to `v0.0.94`.

## [0.0.93] - 2026-02-18

### Changed

- **Unified conversational response rendering** — Added a shared structured response pipeline (`ResponseEnvelope` + composer + WhatsApp formatter) for both normal replies and deterministic NL command routes.
- **Proactive task update consistency** — Task lifecycle notifications now use the same envelope rendering path across `started`, `progress`, `file_op`, `question`, `completed`, and `failed` updates.
- **Documentation parity update** — Updated README, Architecture, Command Reference, API Reference, and Testing Guide to reflect the unified envelope-based response flow.
- **Envelope rendering deduplication** — Consolidated handler-side envelope rendering into a single shared helper to remove duplicate compose/chunk/prefix logic paths.
- **Lifecycle history consistency** — Task completion/failure session-history assistant entries now persist the same composed envelope output style sent to WhatsApp.
- **Progress fallback consistency hardening** — Progress notification fallback now remains in the envelope/composer path instead of reverting to raw text.
- **Version bump** — Bumped project/runtime package versions to `v0.0.93`.

## [0.0.92] - 2026-02-18

### Fixed

- **Workspace status recovery after reconnect/reset** — `workspace_status` now auto-targets the only available workspace when no active workspace is set, reducing false "no workspace selected" failures.

### Changed

- **Version bump** — Bumped project/runtime package versions to `v0.0.92`.

## [0.0.91] - 2026-02-18

### Fixed

- **Stale task-status leak in conversational turns** — Expanded action-intent heuristics (e.g. `make`, `update`, `codex`) so requests like “make it blue use codex” no longer route through generic fallback.
- **General-tool fallback hardening** — Removed `task_status` from generic conversational tool fallback to prevent repeated stale task lookups on non-status chat turns.
- **Task summary sanitization** — `task_status` now strips embedded structured lifecycle JSON (`thread.*`, `turn.*`, `item.*`) and bounds summary length, preventing old task trace payloads from leaking into user replies.

### Changed

- **Version bump** — Bumped project/runtime package versions to `v0.0.91`.

## [0.0.90] - 2026-02-18

### Fixed

- **WhatsApp QR retry loop control** — Bridge now pauses automatic reconnect when disconnection reason is `Max qrcode retries reached`, preventing repeated background QR churn and immediate re-timeouts before manual setup.

### Changed

- **Version bump** — Bumped project/runtime package versions to `v0.0.90`.

## [0.0.89] - 2026-02-18

### Changed

- **Docker build log cleanup** — Disabled npm update/funding notifier output in bridge Docker build/runtime stages to avoid repeated “new npm version available” noise during `fetch up`.
- **Production install flag cleanup** — Switched bridge production dependency install from `npm ci --only=production` to `npm ci --omit=dev`.
- **Version bump** — Bumped project/runtime package versions to `v0.0.89`.

## [0.0.88] - 2026-02-18

### Fixed

- **Dependency audit cleanup** — Removed vulnerable ESLint dev dependency chain (`eslint`, `@typescript-eslint/*`, `typescript-eslint`) that was pulling `ajv@6` advisories, resolving the reported 9 moderate vulnerabilities.

### Changed

- **Lint command update** — `npm run lint` now runs `tsc --noEmit` for strict TypeScript static checks.
- **Version bump** — Bumped project/runtime package versions to `v0.0.88`.

## [0.0.87] - 2026-02-17

### Changed

- **Docs/version parity sweep** — Updated docs shell version labels (`docs/index.html`) and runtime examples to the current release line.
- **README tagline alignment** — Updated top-line README tagline to `Unleash Multi-agent Orchestration.` for consistency with TUI/docs branding.
- **Install docs pin update** — Updated self-pin examples to `v0.0.87`.
- **Version bump** — Bumped project/runtime package versions to `v0.0.87`.

## [0.0.86] - 2026-02-17

### Changed

- **Intent-gated tool routing** — Added a two-stage intent gate (deterministic then heuristic) and per-turn tool subset selection so capability/tool-summary chatter no longer exposes the full toolset to the model by default.
- **Lower-noise conversational turns** — Greeting/capability/tool-inventory intents now run with no tool schema attached, reducing accidental tool loops and improving response consistency.
- **Tool registry targeting** — `ToolRegistry.toOpenAIFormat()` now supports filtered tool-name lists for strict per-turn routing.
- **Version bump** — Bumped project/runtime package versions to `v0.0.86`.

## [0.0.85] - 2026-02-17

### Fixed

- **GitHub sync truthfulness hardening** — `workspace_sync` now fails when push/publication cannot be proven (push failures, missing remote after local commit), preventing false-positive “synced to GitHub” responses.
- **GitHub auth fallback in kennel** — GitHub availability checks now try token auth first and automatically fall back to mounted `gh` auth state when `GH_TOKEN` is stale, with clearer diagnostics.
- **Structured log suppression** — Added stronger filtering of Codex/harness JSON lifecycle traces from task progress, task failure messages, and WhatsApp formatting output.

### Changed

- **Version bump** — Bumped project/runtime package versions to `v0.0.85`.

## [0.0.84] - 2026-02-17

### Fixed

- **WhatsApp completion spam guard** — Task completion summaries now use adapter-extracted summaries instead of raw harness output, with structured JSONL lifecycle lines stripped and length-capped to prevent giant event dumps in user chats.

### Changed

- **Version bump** — Bumped project/runtime package versions to `v0.0.84`.

## [0.0.83] - 2026-02-17

### Fixed

- **Codex skills symlink resilience** — Added automatic cleanup of broken symlinks under `/root/.codex/skills` during kennel startup and immediately before Codex task execution, preventing task failures caused by dangling skill links.
- **Task failure clarity** — Added a user-facing failure message mapping for broken Codex skill-link errors so WhatsApp users get actionable guidance instead of a raw runtime stack message.

### Changed

- **Version bump** — Bumped project/runtime package versions to `v0.0.83`.

## [0.0.82] - 2026-02-17

### Changed

- **WhatsApp task progress filtering** — Suppressed structured harness JSON lifecycle events (`thread.*`, `turn.*`, `item.*`) from proactive WhatsApp progress messages so users only receive human-readable updates.
- **Version bump** — Bumped project/runtime package versions to `v0.0.82`.

## [0.0.81] - 2026-02-17

### Changed

- **GitHub publish failure clarity** — `workspace_publish` now returns the actual underlying failure reason instead of a generic auth-only message.
- **Safe-directory recovery retry** — GitHub repo creation now retries once after re-applying workspace `safe.directory` when git reports ownership/repository ambiguity.
- **Version bump** — Bumped project/runtime package versions to `v0.0.81`.

## [0.0.80] - 2026-02-17

### Changed

- **Git workspace ownership hardening** — Workspace git/GitHub flows now auto-register each workspace path as git `safe.directory` inside kennel to prevent false failures caused by Docker bind-mount ownership checks.
- **Version bump** — Bumped project/runtime package versions to `v0.0.80`.

## [0.0.79] - 2026-02-17

### Changed

- **Compose project consistency** — `fetch` CLI now forces a stable Docker Compose project name (`fetch`) to prevent path-dependent project drift (`repo_` vs `fetch_`) and reduce container-name conflicts after update/path switches.
- **Conflict retry efficiency** — On stale container-name conflicts, `fetch up` now retries with `up -d` (without a second rebuild) after cleanup.
- **GitHub auth bootstrap on startup** — `fetch up` now auto-syncs `GH_TOKEN` from host `gh auth token` into repo `.env` when missing, so kennel GitHub operations can use the host-authenticated account.
- **Workspace sync truthfulness** — `workspace_sync` now fails explicitly when no remote is configured/authenticated and nothing was pushed, preventing false-positive “synced to GitHub” outcomes.
- **Version bump** — Bumped project/runtime package versions to `v0.0.79`.

## [0.0.78] - 2026-02-17

### Changed

- **CLI temp-file cleanup crash fix** — Fixed `fetch up` post-start crash (`output_file: unbound variable`) by removing function-scope `RETURN` trap usage under `set -u`.
- **Version bump** — Bumped project/runtime package versions to `v0.0.78`.

## [0.0.77] - 2026-02-17

### Changed

- **CLI startup UX** — `fetch up` now streams Docker Compose progress in real time instead of buffering output until completion, with explicit startup/success status lines.
- **Version commit source fallback** — Manager build scripts now read `INSTALL_GIT_REF` from `.fetch-install-meta` when `.git` is unavailable (release tarball installs), so TUI Version shows the actual release commit.
- **Version screen commit fallback label** — TUI now shows `unknown` instead of misleading `local` when commit metadata cannot be resolved.
- **Version bump** — Bumped project/runtime package versions to `v0.0.77`.

## [0.0.76] - 2026-02-16

### Changed

- **TUI layout gap fix** — Removed oversized dynamic padding in main/settings menu rendering to keep pinned utility rows compact and visually aligned.
- **Global sessions identity formatting** — Normalized session user identifiers to readable phone-style values instead of raw WhatsApp JID strings.
- **Tagline refresh** — Updated manager and docs tagline text to `Unleash Multi-agent Orchestration`.
- **Version bump** — Bumped project/runtime package versions to `v0.0.76`.

## [0.0.75] - 2026-02-16

### Changed

- **TUI menu consistency** — Added bottom-pinned menu sections so utility navigation stays anchored: `Global Sessions`/`Version`/`Exit` on Main Menu and `Back` on Settings sub-menu.
- **Version bump** — Bumped project/runtime package versions to `v0.0.75`.

## [0.0.74] - 2026-02-16

### Changed

- **TUI action-state model** — Replaced scattered action flags with explicit `idle/loading/success/error/info` state handling, including auto-clear for transient feedback.
- **Unified toast feedback** — Added a reusable toast renderer used across menu, setup, sessions, and harness screens for consistent success/error/info messaging.
- **Action UX hardening** — Menu actions now use centralized loading state and block duplicate submit while an action is in flight.
- **Documentation refresh** — Updated TUI guide for unified loading/toast feedback behavior.
- **Version bump** — Bumped project/runtime package versions to `v0.0.74`.

## [0.0.73] - 2026-02-16

### Changed

- **Intent-aware conversational policy** — Added response-intent classification and deterministic capability/tool inventory routing to keep WhatsApp responses concise, structured, and predictable.
- **Persistent response preferences** — Added natural-language preference updates (`brief/standard/deep`, `direct/conversational`, `emoji low/normal`) stored per session and applied in future conversational replies.
- **WhatsApp formatting telemetry** — Added formatter/chunking counters (`normalizedCount`, `chunkedCount`, `fallbackSplitCount`) and exposed them on `GET /api/status`.
- **Rendering improvements** — Added intent-aware WhatsApp chunking for long outputs (especially tool inventories) while preserving normalized formatting.
- **Conversation contract coverage** — Added integration suite for capability responses, tool inventory structure, preference persistence, and preference carry-over.
- **Documentation refresh** — Updated command/testing/API docs for conversational preferences, new integration test workflow, and response-format metrics.
- **Version bump** — Bumped project/runtime package versions to `v0.0.73`.

## [0.0.72] - 2026-02-16

### Changed

- **Container conflict hardening** — Renamed the SearXNG container to `fetch-searxng` to avoid generic `/searxng` name collisions with non-Fetch stacks.
- **CLI lifecycle recovery** — `fetch up` now auto-recovers once from stale fixed-name container conflicts and retries startup.
- **Simpler shutdown semantics** — `fetch down` now uses `--remove-orphans`; added `fetch down --all` (legacy global cleanup) and `fetch down -v` (remove volumes).
- **Documentation shell overhaul** — Removed docs-side changelog/uninstall pointer pages, renamed install lifecycle docs, upgraded theme toggle UI, and added sidebar GitHub link.
- **Comprehensive docs-source traceability** — Added `DOCS_MAINTENANCE_MAP.md` with full page-to-runtime/config/test mapping and drift-check commands.
- **Page-level maintenance references** — Added `Implementation References` sections across all docs pages to tie each page directly to source files and tests.
- **Docs and diagram refresh** — Updated stale container/tool-count wording, refreshed glossary and skills guide, and added/expanded mermaid diagrams across operational docs.
- **Version bump** — Bumped project/runtime package versions to `v0.0.72`.

## [0.0.71] - 2026-02-16

### Changed

- **Setup-mode docs/status availability hardening** — Fixed bridge runtime setup loop so the process remains alive while env is incomplete, keeping `http://localhost:8765/docs` and `/api/status` reachable during configuration.
- **Repo-aware service lifecycle commands** — Updated `fetch` CLI service commands (`up`, `down`, `status`, `logs`) to target the Fetch repo in the current working directory when present, preventing accidental control of a different installed stack.
- **Troubleshooting documentation refresh** — Updated README/setup/install/testing docs with explicit guidance for docs endpoint failures, required env validation (`OWNER_PHONE_NUMBER`), and service command targeting behavior.
- **Version bump** — Bumped project/runtime package versions to `v0.0.71`.

## [0.0.70] - 2026-02-16

### Changed

- **Tooling layer documentation model** — Reframed docs and README around three intent-first layers (`Delegation`, `Interactive`, `Execution`) to clarify when to use task delegation, live web/browser exploration, and deterministic runtime checks.
- **Workflow guidance clarity** — Updated workflow automation docs to emphasize deterministic execution steps (`app_run`, `app_test`, `browser_test`) and keep reasoning-heavy work in delegation flows.
- **Version bump** — Bumped project/runtime package versions to `v0.0.70`.

## [0.0.69] - 2026-02-16

### Changed

- **Session run lifecycle orchestration** — Added explicit per-session run phases with single-active-run locking, persisted runtime state snapshots, and archive history for completed/failed/cancelled runs.
- **Prompt mode runtime selection** — Added turn-level `minimal` vs `full` prompt modes, with lightweight mode selection for short conversational turns and full mode for execution-heavy requests.
- **Interrupt semantics hardening** — `/stop` and `/cancel` now abort active in-flight agent runs in addition to delegated tasks.
- **Agent telemetry capture** — Added per-turn telemetry (retries, tool totals, per-tool duration/success) and persisted last-run telemetry metadata.
- **Memory tier expansion** — Added short-term turn summaries and durable note tracking in session runtime metadata, plus durable memory writes for stable preferences/decisions.
- **Documentation refresh** — Updated README, systems deep dive, and context pipeline docs to reflect lifecycle/prompt/telemetry/memory-tier behavior.
- **Version bump** — Bumped project/runtime package versions to `v0.0.69`.

## [0.0.68] - 2026-02-16

### Changed

- **Agent core safety test expansion** — Added direct unit coverage for recursive sensitive-arg redaction, tool-call budget bounds, user-facing error sanitization, retry classification, and progress rewrite output sanitization.
- **Workflow/cron reliability test expansion** — Added workflow manager coverage for cron expression validation, run/tool summarizers, cron success/failure metadata updates, and startup overdue-cron catch-up behavior.
- **Core test-hook exports** — Exposed targeted internal `agent/core` helper hooks used by unit tests to validate safety behavior deterministically.
- **Coverage uplift** — Full V8 coverage run improved overall line coverage and substantially increased coverage of `agent/core.ts` and `workflow/manager.ts`.
- **Documentation refresh** — Updated README and testing guide with release regression checks and safety/cron coverage notes.
- **Version bump** — Bumped project/runtime package versions to `v0.0.68`.

## [0.0.67] - 2026-02-16

### Changed

- **Registry-level autonomy safety policy** — Added hard enforcement for dangerous tools in the tool registry: supervised mode blocks dangerous tools; cautious mode requires explicit `confirm: true`.
- **Per-session iteration limit enforcement** — Agent tool-call loops now honor session `maxIterations` (bounded by pipeline max), enabling user-specific autonomy control.
- **Sensitive argument redaction** — Tool-call argument payloads are now sanitized before logging and session persistence to reduce secret leakage risk.
- **Workflow persistence hardening** — Workflow/cron state writes now use temp-file + atomic rename semantics.
- **Cron startup catch-up** — Workflow manager now initializes missing `nextRunAt` values and executes overdue cron jobs on startup.
- **Manager test baseline** — Added Go unit tests for path resolution behavior in manager internals.
- **Version bump** — Bumped project/runtime package versions to `v0.0.67`.

## [0.0.66] - 2026-02-16

### Changed

- **Deterministic stop/cancel process termination** — `/stop` and `task_cancel` now terminate active harness executions when present, instead of only marking task state as cancelled.
- **Workflow safety guardrails** — `workflow_create` now validates every step tool at creation time, blocks recursive orchestration tools (`workflow_*` / `cron_*`) and interactive task-only tools (`ask_user`, `report_progress`) from workflow steps.
- **Concurrent workflow recursion protection** — workflow execution now fails fast when the same workflow is already running, preventing accidental recursive/racing runs.
- **Autonomy hardening tests** — Added unit coverage for stop/cancel termination behavior and workflow guardrails.
- **Version bump** — Bumped project/runtime package versions to `v0.0.66`.

## [0.0.65] - 2026-02-15

### Added

- **Workflow orchestration tools** — Added `workflow_create`, `workflow_list`, `workflow_run`, and `workflow_delete` for reusable multi-step automation flows.
- **Cron scheduling tools** — Added `cron_create`, `cron_list`, `cron_delete`, and `cron_run` with persisted UTC cron schedules and background execution loop.
- **Runtime execution tools** — Added `app_run`, `app_test`, and `browser_test` so Fetch can run app commands/tests and browser smoke checks inside Kennel without changing existing browser tools.

### Changed

- **Bridge lifecycle wiring** — Workflow scheduler now initializes on bridge startup and shuts down cleanly during runtime teardown.
- **Validation and registry contracts** — Added full Zod schemas and registry wiring for 11 new tools (total orchestrator tools: 40).
- **Documentation refresh** — Updated README and docs tool references for workflow/cron/runtime capabilities and practical usage.
- **Version bump** — Bumped project/runtime package versions to `v0.0.65`.

## [0.0.64] - 2026-02-15

### Changed

- **WhatsApp Setup live status refresh** — Manager now continuously polls bridge status while on the Setup screen, so disconnected/QR/authenticated transitions update without requiring restart.
- **TUI stop action feedback hardening** — Stop now verifies container state post-action and reports clear outcomes (`stopped`, `already stopped`, or still-running container names).
- **Version bump** — Bumped project/runtime package versions to `v0.0.64`.

## [0.0.63] - 2026-02-15

### Changed

- **Conversational capability routing** — Natural-language capability prompts (for example, "what can you do?") now flow through the normal LLM path instead of being hard-routed to static `/help` output.
- **Safety-gate behavior clarified** — Parser JSDoc now explicitly documents slash-command determinism and conversational pass-through for non-slash input.
- **Identity tone guidance expanded** — Updated identity directives to emphasize conversational, operator-style responses with concrete next actions over template-like command dumps.
- **Testing guidance updated** — `TESTING_GUIDE.md` now validates conversational capability responses while preserving deterministic `/help`.
- **Version bump** — Bumped project/runtime package versions to `v0.0.63`.

## [0.0.62] - 2026-02-15

### Changed

- **GitHub Copilot compatibility across `gh` variants** — Harness install/status logic now treats Copilot as available when `gh copilot` is built in, while still supporting legacy `github/gh-copilot` extension installs.
- **TUI GitHub readiness detection update** — Manager GitHub auth status now reports Copilot command availability instead of requiring extension-only detection, eliminating repeated false "extension missing" prompts on newer GitHub CLI.
- **Kennel build install guard** — Docker build now checks for built-in `gh copilot` before attempting extension install to avoid noisy name-conflict loops.
- **Version bump** — Bumped project/runtime package versions to `v0.0.62`.

## [0.0.61] - 2026-02-15

### Changed

- **Harness screen action visibility** — TUI now renders action feedback inline on the Harness screen, so key actions (`i/n/u/d`) show immediate success/failure messages.
- **Harness no-op feedback** — Added explicit messages for GitHub-only install key usage on non-GitHub rows and logout attempts when a harness is not authenticated.
- **Version bump** — Bumped project/runtime package versions to `v0.0.61`.

## [0.0.60] - 2026-02-15

### Changed

- **TUI GitHub install precheck** — Harness install action (`n`) now performs a local GitHub auth precheck and blocks repeated installer subprocess runs until `gh auth login` or `GH_TOKEN` is configured.
- **Version bump** — Bumped project/runtime package versions to `v0.0.60`.

## [0.0.59] - 2026-02-15

### Changed

- **GitHub harness install flow hardening** — `manage_harnesses.sh` now pre-checks GitHub auth/token before `gh-copilot` installation and can load `GH_TOKEN` from `.env` automatically to avoid repeated noisy install failures.
- **GitHub harness status accuracy** — TUI now treats installed `gh` as host-installed and reports extension readiness separately (`Extension Missing`) instead of incorrectly showing `Not Installed`.
- **Version bump** — Bumped project/runtime package versions to `v0.0.59`.

## [0.0.58] - 2026-02-14

### Changed

- **TUI harness package management** — Harness screen now supports per-harness install/uninstall actions (`n` install, `u` uninstall) and refreshes status immediately after action completion.
- **GitHub harness readiness detection** — GitHub harness status now requires `gh-copilot` extension presence (not just `gh` binary), with explicit inline guidance when missing.
- **CLI harness manager commands** — Added `fetch harness status`, `fetch harness install <name|all>`, and `fetch harness uninstall <name|all>` wrappers for host harness lifecycle management.
- **Guided prerequisite packaging** — Added `scripts/install_prereqs.sh` and wired `fetch setup --install-prereqs` for one-command host bootstrap of core dependencies.
- **Guided harness packaging** — Added `scripts/manage_harnesses.sh` and wired `fetch setup --install-harnesses`; legacy `scripts/update_harnesses.sh` now delegates to the new manager.
- **Docs refreshed for guided setup** — Setup/install/TUI/README flows now document full bootstrap path: `fetch setup --install-prereqs --install-gh-cli --install-harnesses`.
- **Version bump** — Bumped project/runtime package versions to `v0.0.58`.

## [0.0.57] - 2026-02-14

### Changed

- **Dedicated GitHub auth menu flow** — Added a `🔑 GitHub Auth` entry on the TUI main menu that opens harness authentication focused on GitHub/Copilot setup.
- **GitHub token auto-sync** — After successful `gh auth login`, manager now syncs `gh auth token` into `.env` as `GH_TOKEN` automatically.
- **In-TUI GitHub CLI install action** — Added `i` key action on the GitHub harness row to run `scripts/install_gh_cli.sh` directly from the manager.
- **TUI docs updated** — Updated menu and harness auth controls documentation to include dedicated GitHub auth flow and install keybinding.
- **Version bump** — Bumped project/runtime package versions to `v0.0.57`.

## [0.0.56] - 2026-02-14

### Changed

- **GitHub CLI host prerequisite automation** — Added `scripts/install_gh_cli.sh` and `fetch setup --install-gh-cli` to install `gh` on supported host package managers (apt/dnf/yum/pacman/zypper/Homebrew) with clear fallback guidance.
- **Doctor/setup visibility for `gh`** — `fetch self doctor` and `fetch config doctor` now check/report GitHub CLI presence and provide install hints when missing.
- **Install docs updated** — Setup/install/README documentation now explicitly includes GitHub CLI as a host prerequisite and wires recommended setup flow through `fetch setup --install-gh-cli`.
- **Version bump** — Bumped project/runtime package versions to `v0.0.56`.

## [0.0.55] - 2026-02-14

### Changed

- **Installer backup cleanup automation** — Installer now attempts automatic backup-directory cleanup silently, and when root-owned files block removal it retries with non-interactive `sudo` (when available) before falling back to a manual cleanup hint.
- **Version bump** — Bumped project/runtime package versions to `v0.0.55`.

## [0.0.54] - 2026-02-14

### Changed

- **Reaction approval safety** — Bridge now ignores reaction-triggered approvals during startup warmup, deduplicates repeated reaction events, and only applies emoji approvals when a task is actually in `waiting_input`.
- **Version bump** — Bumped project/runtime package versions to `v0.0.54`.

## [0.0.53] - 2026-02-14

### Changed

- **Owner authorization hot-reload** — Security gate now reads `OWNER_PHONE_NUMBER` dynamically from runtime env, so config reload updates owner trust without requiring bridge restart.
- **Runtime env source-of-truth** — `.env` loading now uses override semantics so mounted `.env` values win over stale container env on startup.
- **Automatic `.env` parity reload** — Bridge status API now watches `/app/.env` and auto-applies validated runtime env updates on file change; `/api/config/reload` uses the same reload path.
- **Version bump** — Bumped project/runtime package versions to `v0.0.53`.

## [0.0.52] - 2026-02-14

### Changed

- **Setup-mode bridge bootstrap** — Bridge now starts the status API before strict env gating and stays alive in setup mode when required keys are missing, allowing TUI configuration without crash-looping.
- **TUI config input UX** — Manager config editor now accepts pasted multi-character input for fields like API keys and phone numbers.
- **TUI project-dir resolution** — Manager now resolves the real Fetch project root more reliably (including installed `~/.fetch/repo` layouts), so Start/Stop/Restart actions target the correct compose project.
- **Installer/setup token provisioning** — `scripts/install.sh` and `fetch setup` now auto-generate `ADMIN_TOKEN` when missing; `.env.example` now includes `ADMIN_TOKEN`.
- **Status API admin auth behavior** — Protected status/session/config routes now support local admin access when `ADMIN_TOKEN` is intentionally unset, preventing TUI session/config 401 drift.
- **CLI update ergonomics** — `fetch self update` now accepts `--manifest-url <url>` directly.
- **CLI update cache hardening** — `fetch self update` now auto-pins the manifest to the current `main` commit SHA (via GitHub API) to avoid stale `raw` branch-cache responses.
- **CLI version reporting** — Installer writes `.fetch-install-meta` and `fetch self version` now falls back to installed metadata when `.git` is unavailable (tarball installs).
- **TUI Docker lifecycle resilience** — Manager start flow now self-recovers from stale container-name collisions (`fetch-bridge`, `fetch-kennel`, `searxng`) and stop flow now uses `docker compose down --remove-orphans`.
- **Release/update manifest corrections** — `v0.0.52` manifest metadata was refreshed to point to current archive commits and checksums used by `fetch self update`.
- **Version bump** — Bumped project/runtime package versions to `v0.0.52`.

## [0.0.51] - 2026-02-14

### Added

- **Uninstall command in CLI** — Added `fetch uninstall` to execute a supported host uninstall flow.
- **Dedicated uninstall script** — Added `scripts/uninstall.sh` (and root `uninstall.sh` wrapper) for non-interactive and scripted removal.

### Changed

- **Uninstall docs and runbook** — Updated install/update and uninstall documentation with command-first workflows and deep cleanup flags.
- **Version bump** — Bumped project/runtime package versions to `v0.0.51`.

### Changed

- **Installer flow unified** — Removed legacy root installer logic and made `install.sh` a wrapper to `scripts/install.sh`.
- **New bootstrap installer** — Added `scripts/install.sh` for user-mode install/update wiring and `fetch` CLI symlink setup.
- **Unified local management CLI** — Added `scripts/fetch-cli.sh` with `self doctor|update|pin|version` and `up|down|restart|status|logs|tui` commands.
- **Manifest-driven updates** — Added `release-manifest.json` and wired installer/update flows to resolve channel/version targets from manifest metadata.
- **Checksum verification** — Installer now verifies SHA-256 checksums for downloaded release archives before activation.
- **Install/update docs refreshed** — Updated README and setup docs to use curl installer and `fetch self` workflows.
- **Harness install docs linked** — Added direct official install/setup links for Copilot CLI, Claude Code, Gemini CLI, OpenCode, Codex, plus Node/npm prerequisite links.
- **Doctor prerequisite checks expanded** — `fetch self doctor` now reports missing `node`/`npm` as optional warnings for harness CLI installation.
- **Doctor Docker-access remediation** — `fetch self doctor` now checks `docker ps` permissions and prints exact `systemctl/usermod/newgrp` fix commands when daemon access fails.
- **Doctor JSON output** — `fetch self doctor --json` now emits machine-readable health data (critical/optional checks + remediation hints).
- **Guided setup command** — Added `fetch setup` to run bootstrap checks, ensure `.env` exists, run doctor/config diagnostics, and print next-step actions.
- **Config diagnostics commands** — Added `fetch config validate` and `fetch config doctor` for required env validation and integration-readiness checks.
- **TUI in-app update action** — Main menu now includes `Update Fetch`, which runs `fetch self update` from the manager and exits on successful completion so the operator can relaunch on the updated install.
- **TUI start error guidance** — Start Fetch now detects Docker socket permission-denied failures and returns actionable remediation commands in the TUI error message.
- **Backup cleanup resilience** — Installer no longer fails the update when removing old backup directories hits permission-denied files; it logs a warning and continues.
- **Production doc cleanup** — Removed personal attribution/footer text, corrected legacy service placeholders, and tightened setup wording.
- **GitHub setup clarified** — Documentation and `.env.example` now explicitly support GitHub repo operations with `GH_TOKEN` while `ENABLE_COPILOT=false`.
- **Repo slug centralization** — Installer/update scripts now derive canonical URLs from `FETCH_REPO_SLUG` (with optional `FETCH_MANIFEST_URL` override) instead of duplicating hardcoded repo strings.
- **Installer rollback safety** — `scripts/install.sh` now keeps a pre-update backup until post-install steps succeed and restores the previous install on failure.
- **Installer PATH onboarding** — Installer now auto-adds the CLI bin directory to shell profile PATH files (bash/zsh/fish/profile fallback) and prints immediate-shell fallback instructions.
- **Installer CLI activation hardening** — Install now fails if Fetch CLI script is missing and validates symlink/`fetch help` before reporting success.
- **CI install/update smoke coverage** — Added GitHub Actions workflow that validates installer syntax, local manifest install, `self doctor`, `self pin`, and `self update`.
- **CI manager cross-arch builds** — Added GitHub Actions matrix build for `linux/amd64` and `linux/arm64` manager binaries on PR/push.
- **Release automation** — Added tag-triggered release workflow that builds manager archives, publishes checksums + release notes, and updates `release-manifest.json` on `main`.
- **Release preflight validation** — Release workflow now verifies required files exist in the source archive before generating/publishing manifest metadata.

### Documentation

- Added `INSTALL_UPDATE_PLAN.md` to track install/update modernization phases and acceptance criteria.
- Added `docs/markdown/INSTALL_UPDATE.md` runbook for install, update, pin, and legacy migration.
- Added `docs/markdown/UNINSTALL.md` with default uninstall, optional Docker purge, and shell PATH cleanup steps.
- Added `docs/markdown/SECURITY_RUNBOOK.md` with production hardening, token scope guidance, and incident recovery commands.

## [0.0.48] - 2026-02-14

### Changed

- **Manual verification scripts moved** — Ad-hoc root verification scripts were reorganized into `fetch-app/scripts/manual/` to separate manual checks from Vitest CI coverage.
- **Import path fixes for moved scripts** — Updated manual script imports to reference `fetch-app/src/*` from their new location.
- **Undo-all git safety** — `/undo all` now validates git repo state and runs `git reset` with explicit workspace `cwd` instead of implicit process cwd.
- **Version output normalization** — `/version` and related formatters now use one version source string (no duplicate `v` prefix rendering).
- **Harness output pipeline** — Executor now parses line-level output and emits `harness:progress`, `harness:file_op`, and `harness:question`; integration now maps output payloads using a normalized `line` contract.
- **Delete-path hardening** — Workspace delete operations now normalize/resolve paths and enforce workspace-root boundary checks to block traversal/sibling-prefix escapes.
- **Thinking timer safety** — Message handler now clears delayed progress timers in `finally`, preventing stale post-error progress sends.
- **Secret redaction hardening** — Harness command arg redaction now matches sensitive env keys case-insensitively (covers lowercase/mixed-case `api_key`/`token` patterns).
- **Status API session-id consistency** — All session routes now enforce one shared session-id grammar (`[A-Za-z0-9_-]+`) for GET/DELETE/CLEAR endpoints.
- **Spawner terminal-state precedence** — Harness kill status now remains terminal (`killed`) and is no longer overwritten by close-event `failed`.
- **Identity owner context reload** — Identity manager now merges loaded `ALPHA.md` context fields into in-memory identity on reload.
- **Whitelist persistence resilience** — Whitelist write lock now recovers after write failures, and singleton initialization retries after failed init attempts.
- **Runtime config validation gate** — `/api/config/reload` now validates updated env keys/values against config schema and rejects invalid updates before mutating runtime state.
- **Session write coordination** — Session manager now serializes writes per session and compaction re-reads latest persisted state before trimming history.
- **Session manager init retry safety** — `getSessionManager()` now resets cached init promise after failure so transient startup errors can recover without process restart.
- **Skill availability consistency** — Skill load/reload now enforces requirement checks and disabled-skill gating before registry insertion, keeping summary and activation behavior aligned.
- **Skill reload stale-entry cleanup** — When a skill becomes unavailable on reload, the existing in-memory skill entry is removed immediately.
- **Activated skill context escaping** — Skill summary/activation XML blocks now escape dynamic content to prevent prompt-structure breakage from tag-like instructions.
- **Task persistence health signal** — Task manager now exposes degraded persistence initialization state/error for observability when store init fails.
- **Custom-tool reload rename safety** — Tool registry now removes stale prior tool names when a JSON file renames its tool definition.
- **Custom-tool validation hardening** — Custom tool definitions now use strict schema validation (including parameter shape) and invalid reloads unload stale mappings safely.
- **Browser action contract enforcement** — `browser_action` now validates action-specific required fields (`click` requires ref or x/y pair, `type` requires ref + non-empty text).
- **Dynamic ambiguous-agent choices** — `task_create` ambiguity payload now lists currently enabled agents (with schema-aligned fallback) instead of hardcoded choices.
- **Web fetch SSRF hardening** — `web_fetch` now enforces `http/https`, validates DNS-resolved IPs against private ranges, and re-validates each redirect hop before fetching.
- **Transcription exec safety** — Voice transcription now executes `ffmpeg` and `whisper-cpp` via argument arrays (`execFile`), validates model path existence, and avoids shell interpolation.
- **Docker timeout cancellation** — Timed-out docker exec paths now attempt process termination in-container and keep timeout as terminal result (with late-stream suppression via finished-state guards).
- **Docker stdin contract alignment** — `dockerExec`/`dockerExecStream` now honor `DockerExecOptions.stdin`.
- **Repo-map determinism** — Repo-map file discovery is now normalized/sorted before `maxFiles` truncation.
- **Symbol extraction dedupe** — Symbol extractor now deduplicates by `(name,type)` and returns stable sorted output.
- **Vision input guardrails** — Vision analysis now enforces MIME allowlist and payload-size limits before provider calls.
- **Session row corruption tolerance** — Session store now catches malformed session JSON rows and rebuilds safe fallback session objects.
- **Task row corruption tolerance** — Task store now skips malformed task rows during load instead of failing whole initialization.
- **Security teardown hooks** — Added explicit `shutdown()` for rate limiter and whitelist store resources.
- **Watcher teardown integration** — Bridge/index shutdown now closes skill, identity, custom-tool, and whitelist watchers during graceful exit.
- **Notification anti-repeat scoping** — Template anti-repeat cache now keys by session scope with TTL/cap pruning to avoid cross-user coupling.
- **Harness history retention bounds** — Spawner/executor now prune terminal in-memory records using TTL + max-count policies.
- **Identity readiness contract** — Identity manager now exposes `whenReady()` and promise-returning reload sequencing; agent/notification paths await readiness before prompt/voice usage.
- **Path sanitizer hardening** — `sanitizePath` now normalizes backslashes, strips Windows drive/UNC prefixes, and removes traversal segments consistently.
- **Session store singleton test isolation** — Added explicit singleton reset hook and db-path mismatch guard to prevent silent path override coupling.
- **Deterministic session ID strategy** — Session/message IDs now use an injectable generator with reset hook for deterministic tests.
- **Import-safe entrypoint runtime** — `src/index.ts` now exports a testable runtime (`createRuntime`/`main`/`shutdown`) and only auto-starts when executed as the CLI entry module.
- **Notification telemetry counters** — Added runtime metrics for notification formatting path selection (LLM success, template fallback, rewrite disabled/errors/timeouts, duplicate suppression).
- **Status API telemetry surface** — `/api/status` now includes notification formatter metrics for operational visibility.
- **Pipeline rewrite controls** — Added typed `FETCH_NOTIFICATION_REWRITE`, `FETCH_NOTIFICATION_REWRITE_TIMEOUT_MS`, `FETCH_PROGRESS_REWRITE`, and `FETCH_PROGRESS_REWRITE_TIMEOUT_MS` flags.

### Removed

- **Legacy JS duplicates** — Removed `fetch-app/error-handling-verify.js` and `fetch-app/interaction-tool-verify.js` to eliminate redundant, non-CI script variants.

### Documentation

- Added `fetch-app/scripts/manual/README.md` with run commands, prerequisites, and side-effect warnings (notably GitHub remote operations).
- Updated root and docs readmes to point contributors to manual verification scripts separately from automated test commands.
- Updated `ENGINEERING_GAP_BACKLOG.md` to mark P0 GAP-001/002/003/007/008/037 as done.

### Tests

- Added/updated targeted coverage for:
  - command parser version output and undo-all command behavior
  - handler timer cleanup on thrown `processMessage`
  - harness executor parsed event emission
  - task integration output payload mapping and question pause path
  - workspace delete-path traversal/sibling-prefix blocking
  - status API session-id validation helper and route grammar
  - spawner killed-vs-close status precedence
  - identity context merge on reload
  - whitelist lock recovery and singleton init retry behavior
  - runtime env-update validation (valid/unknown/invalid-value cases)
  - session compaction stale-state protection and singleton init retry
  - skills manager requirement-gated load parity, reload removal, and XML escaping in activated context
  - task manager persistence-health visibility on init failure
  - custom tool loader strict validation and rename/unload reload behavior
  - browser action schema action-specific validation
  - task tool ambiguity choices sourced from runtime enabled agents
  - web fetch DNS/redirect SSRF protections (including private-resolution and redirect-chain blocking tests)
  - transcription model-path argument safety and missing-model failure path
  - docker timeout cancellation and stdin option behavior in docker exec helpers
  - deterministic repo-map truncation ordering
  - symbol dedupe contract enforcement
  - vision MIME/payload-size guardrails
  - interaction tool auto-approval/question/progress paths
  - github tool workspace-error and search output paths
  - session/task store malformed-row guardrails
  - teardown coverage for whitelist watcher, rate limiter shutdown, and tool-registry watcher shutdown
  - notification anti-repeat cache scoped isolation behavior
  - spawner/executor terminal record retention pruning (TTL + cap)
  - identity readiness (`whenReady`) and reload sequencing paths
  - Windows/backslash/UNC path normalization in security sanitizer
  - session store singleton reset/mismatch behavior and deterministic session ID injection
  - import-safe index runtime startup/shutdown behavior without module-import side effects
  - notification telemetry counters and status payload exposure
  - pipeline bool parsing and rewrite feature-flag/timeout settings

## [0.0.47] - 2026-02-13

### Security

- **Log Redaction** — Fixed a critical vulnerability where harness execution commands (including API keys in `-e` flags) were logged verbatim. Implemented `redactCommandArgs` to mask sensitive values (`API_KEY`, `TOKEN`, `SECRET`) in logs.
- **Log Cleanup** — Removed compromised log files (`bridge_logs.txt`, `bridge_logs_full.txt`) from the repository and added them to `.gitignore`.

### Fixed

- **Sensitive Data Leak** — `spawner.ts` no longer logs raw environment variables during container spawning.

### Documentation

- Synced tool inventory to 29 across architecture, systems deep dive, and glossary.
- Added missing `folder_delete` docs and clarified `file_delete` parameters in the API reference.
- Updated docker compose docs with the correct volumes (`./docs`, `./.env`) and kennel auth mounts.
- Corrected pipeline tuning count to 42 and clarified `DATA_DIR` resolution behavior.

## [0.0.46] - 2026-02-13

### Added

- Dedicated `folder_delete` tool for recursive directory removal.
- Safety checks in `WorkspaceManager` to prevent root or file deletion via `folder_delete`.
- Explicit confirmation requirement for all folder deletions.
- Automatic tool capability awareness in `IdentityManager`.

## [0.0.45] - 2026-02-13

### Improved

- **Tool Routing & Selection**: Refined tool descriptions for `task_create` and `file_delete` to prevent misclassification of simple requests.
- **Autonomy Rules**: Updated high-priority prompt rules to skip agent selection for simple file operations, reducing clarification loops.

## [0.0.44] - 2026-02-13

### Added

- **Session History View in TUI**: Users can now view, delete, and clear message history of past sessions directly from the Fetch Manager.
- **Individual File Deletion**: New `file_delete` tool allows agents to delete specific files in the workspace (safely gated with confirmation).
- **Session API**: Added `/api/sessions` endpoints for listing, retrieving, deleting, and clearing session history.

### Fixed

- Resolved duplicate keybindings in the Session History screen of the TUI.
- Improved role-based coloring for message history in the TUI (User, Assistant, Tool).
- Fixed markdown formatting and alignment across all documentation files.
- Corrected tool counts to 28 across architecture diagrams and feature lists.

## [0.0.43] - 2026-02-12

### Version Centralization & Agency Polish

#### Added

- **Centralized Versioning** — Single `VERSION` file in project root serves as the source of truth for all components
- **Dynamic Manager Builds** — `scripts/build_manager.sh` injects version, commit, and build date into the Go binary at build time
- **Runtime Versioning** — Fetch Bridge now reads the explicit version on startup instead of hardcoded fallback

#### Changed

- **Install Script** — Updated `install.sh` to use the new build script for consistent versioning
- **Status API** — `/api/status` now reports the actual running version from the `VERSION` file

#### Fixed

- **Codex Agent Selection** — Fixed issue where Codex harness selection was ambiguous or failed
- **Group Chat Logic** — Fixed regression causing unsolicited responses in group chats
- **Documentation** — Updated all static documentation to reflect the new versioning strategy

#### Files Changed (11)

| Area | Files |
|------|-------|
| Root | `VERSION` (new), `install.sh` |
| App | `src/utils/version.ts` (new), `src/index.ts`, `src/api/status.ts`, `Dockerfile` |
| Manager | `scripts/build_manager.sh` (new), `manager/internal/components/version.go` |
| Docs | `README.md`, `docs/index.html`, `CHANGELOG.md` |

---

## [0.0.42] - 2026-02-12

### Unified Harness Auth Screen + Codex Config + Docker Mount Fixes

#### Added

- **Unified Harness Auth screen** in the Go TUI — single screen to authenticate all 5 CLI harnesses (GitHub/Copilot, Claude Code, Gemini CLI, OpenCode, Codex) via interactive OAuth/login flows
  - `l` to login (suspends TUI, runs CLI's native login), `d` to logout, `r` to refresh status
  - Per-harness status detection: CLI installation check via `exec.LookPath`, credential file existence, CLI status commands
  - Three visual states: `◌ Not Installed`, `○ Not Authenticated`, `● Authenticated`
  - GitHub retains multi-account support with sub-account navigation (`←/→`, `s` to switch)
  - Context-sensitive help bar adapts when GitHub is selected
- **Codex config fields** in the TUI config editor — `ENABLE_CODEX`, `CODEX_API_KEY`, `OPENAI_API_KEY` (Core Settings) and `CODEX_MODEL` (Harness Models)
- **Docker volume mount** for Claude OAuth credentials — `~/.claude:/root/.claude:ro` (OAuth tokens live at `~/.claude/.credentials.json`, separate from the existing `~/.config/claude-code` config mount)

#### Changed

- **Menu label** — "GitHub Auth" renamed to "Harness Auth" with `[X/5 auth]` badge showing authenticated count
- **TUI Guide** — Complete rewrite with full documentation for every screen, key binding, and harness auth flow

#### Fixed

- **Kennel Dockerfile** — Added `mkdir -p /root/.claude` to ensure the mount target directory exists

#### Files Changed (7)

| Area | Files |
|------|-------|
| TUI | `manager/main.go` (refactored), `manager/internal/config/editor.go` |
| Docker | `docker-compose.yml`, `kennel/Dockerfile` |
| Docs | `CHANGELOG.md`, `README.md`, `docs/markdown/TUI_GUIDE.md` |

---

## [0.0.41] - 2026-02-11

### Codex CLI — Fifth Harness (OpenAI Codex)

#### Added

- **Codex harness adapter** (`harness/codex.ts`) — Full integration of OpenAI's open-source Codex CLI as the fifth coding agent
  - Headless execution via `codex exec --json --ephemeral --full-auto`
  - JSON Lines output parsing for structured event streaming (turn lifecycle, item events, file changes)
  - `extractFileOperations()` parses JSONL `file_change` events with plain-text fallback
  - `extractSummary()` extracts `agent_message` from JSONL events
- **Environment variables** — `ENABLE_CODEX`, `CODEX_API_KEY`, `CODEX_MODEL` added to env schema
- **Kennel Dockerfile** — `@openai/codex` installed globally via npm
- **CLI config** — `data/cli-configs/CODEX.md` with Fetch Kennel instructions
- **Validation** — `AgentSelectionSchema` updated to include `'codex'` alongside `'opencode'`
- **Docker Compose** — `CODEX_API_KEY` and `OPENAI_API_KEY` passthrough to kennel container
- **Unit tests** — CodexAdapter test suite covering `buildConfig`, `parseOutputLine`, `extractFileOperations`, `detectQuestion`

#### Files Changed (15)

| Area | Files |
|------|-------|
| Harness | `harness/codex.ts` (new), `harness/registry.ts`, `harness/index.ts`, `harness/types.ts` |
| Types | `task/types.ts` (AgentType union) |
| Config | `config/env.ts`, `.env.example` |
| Validation | `validation/tools.ts` (AgentSelectionSchema) |
| Tools | `tools/task.ts` (description + error choices) |
| Docker | `kennel/Dockerfile`, `docker-compose.yml` |
| Data | `data/cli-configs/CODEX.md` (new) |
| Tests | `tests/unit/harness-adapters.test.ts` |
| Docs | `README.md`, `CHANGELOG.md`, `CLAUDE.md` |

---

## [0.0.40] - 2026-02-11

### `/trust` Command — Owner-Only Whitelist Management via WhatsApp

#### Added

- **`/trust` command** — Owner-only safety escape for managing trusted phone numbers directly from WhatsApp
  - `/trust add <number>` — Add a trusted phone number
  - `/trust remove <number>` — Remove a trusted phone number
  - `/trust list` — Show all trusted numbers
  - Non-owner users receive a rejection message
- **Owner gating pattern** — Compares `session.userId` against `OWNER_PHONE_NUMBER` with digit normalization

#### Files Changed (6)

| Area | Files |
|------|-------|
| Commands | `commands/trust.ts` (new), `commands/parser.ts` |
| Agent | `agent/format.ts` (help text) |
| Tests | `tests/unit/command-parser.test.ts` (+3 tests) |
| Docs | `COMMANDS.md`, `TESTING_GUIDE.md` |

---

## [0.0.39] - 2026-02-11

### `/usage` Command, Whitelist Hot-Reload, Duplicate Message Fix

#### Added

- **`/usage` command** — New safety escape command (`/usage` or `/u`) that calls the OpenRouter API and displays usage stats (total, daily, weekly, monthly spend, limit, remaining) formatted for WhatsApp
- **Whitelist hot-reload** — `WhitelistStore` now watches `data/whitelist.json` via chokidar; numbers added in the TUI take effect immediately without restarting the bridge container

#### Fixed

- **Duplicate task completion messages** — Suppressed the LLM's conversational response when a task is delegated, since the event system (`task:started`, `task:completed`) already handles all notifications

#### Files Changed (5)

| Area | Files |
|------|-------|
| Commands | `commands/parser.ts` (added `/usage` case) |
| Agent | `agent/format.ts` (added `formatUsage()`, updated help text) |
| Security | `security/whitelist.ts` (added chokidar file watcher) |
| Handler | `handler/index.ts` (suppress duplicate response on task delegation) |
| Docs | `COMMANDS.md`, `TESTING_GUIDE.md` |

---

## [0.0.38] - 2026-02-11

### Project Intelligence, Hybrid Notifications, Narrative Tool Outputs

Three work streams that make Fetch smarter about the projects it works on, more natural in how it communicates, and more LLM-friendly in how tools report results.

#### Work Stream A: Project Detection Enrichment

- **Project profiler** — New `workspace/profiler.ts` module detects framework (Next.js, Express, Django, FastAPI, Laravel, Rails, Spring Boot), package manager (npm, yarn, pnpm, pip, poetry, cargo, bundler, go), test runner (vitest, jest, pytest, cargo test, go test, maven), entry points, and build/test commands for all 10 project types
- **ProjectProfile type** — New interface in `workspace/types.ts` with `framework`, `packageManager`, `testRunner`, `entryPoints`, `buildCommand`, `testCommand`, `language`, `description` fields
- **Profile-aware system prompt** — System prompt now shows framework, test/build commands, and entry points instead of just "Type: node"
- **Harness project context** — All 4 harness adapters receive a `--- Project Context ---` section in the goal with language, framework, and relevant commands
- **Extended symbol extraction** — Added Rust, Java, Ruby, PHP, and .NET patterns to `workspace/symbols.ts` (was only TypeScript, Python, Go)
- **Dynamic repo-map extensions** — `workspace/repo-map.ts` now filters file extensions per project type instead of using a hardcoded list
- **Session type sync** — Fixed `ProjectType` union from 6 to 10 members, added `profile` to `ProjectContext`

#### Work Stream B: Hybrid LLM Notifications

- **Notification formatter** — New `agent/notifications.ts` module with `formatNotification()` entry point
- **LLM path** — Task completion and failure notifications are generated by a cheap LLM call (configurable model) with identity voice injected, producing natural 2-4 line WhatsApp messages
- **Template path** — Started and progress events use expanded template pools (8-12 variations each) with varied sentence structures
- **Fallback** — LLM failures gracefully fall back to template path
- **Pipeline config** — 3 new params: `FETCH_NOTIFICATION_MODEL`, `FETCH_NOTIFICATION_MAX_TOKENS`, `FETCH_NOTIFICATION_TEMPERATURE`
- **Identity integration** — Added `getVoiceTone()` getter to IdentityManager for notification prompt injection
- **Expanded progress messages** — `generateProgressMessage()` now has 8+ action keyword groups and 10+ prefix variations with multiple sentence structures

#### Work Stream C: Narrative Tool Outputs

- **All 21 tool handlers** converted from `JSON.stringify()` dumps to human-readable narrative text
- **Workspace tools (7)** — e.g. `"3 workspaces: my-app (active, TypeScript, main), api (Go, dev, uncommitted changes)"`
- **Task tools (4)** — e.g. `"Task tsk_Xy7z running (45s) — 'Add error handling'. Last: installing deps"`
- **GitHub tools (8)** — e.g. `"Created draft PR #5: 'Fix auth' → main"`, `"3 open PRs: #1 'title' (open, by user)..."`
- **Interaction tools (2)** — Added `summary` fields for WhatsApp display hints
- **Metadata migration** — Full structured data moved to `result.metadata`, session sync reads from metadata instead of parsing output
- **Dead code cleanup** — Removed `formatTaskOutput` helper and unused `Task` type import from task tools

#### Tests (48 new, 355 total)

- **`tests/unit/project-profiler.test.ts`** (37 tests) — Framework, package manager, test runner, entry point, description, and build command detection across all project types
- **`tests/unit/notifications.test.ts`** (11 tests) — LLM path, template path, fallback behavior, template variety
- **Updated `workspace-tools.test.ts`** — All assertions migrated from JSON.parse to narrative text checks

#### Files Changed (22)

| Area | Files |
|------|-------|
| Workspace | `workspace/profiler.ts` (new), `workspace/types.ts`, `workspace/manager.ts`, `workspace/symbols.ts`, `workspace/repo-map.ts` |
| Agent | `agent/notifications.ts` (new), `agent/core.ts`, `agent/prompts.ts` |
| Harness | `harness/types.ts`, `harness/executor.ts`, `harness/claude.ts`, `harness/gemini.ts`, `harness/copilot.ts`, `harness/opencode.ts` |
| Tools | `tools/workspace.ts`, `tools/task.ts`, `tools/github.ts`, `tools/interaction.ts` |
| Config | `config/pipeline.ts` |
| Session | `session/types.ts` |
| Identity | `identity/manager.ts` |
| Task | `task/integration.ts` |
| Tests | `tests/unit/project-profiler.test.ts` (new), `tests/unit/notifications.test.ts` (new), `tests/unit/workspace-tools.test.ts` |

---

## [0.0.37] - 2026-02-11

### OpenCode Harness, Memory System Overhaul, TUI Cleanup

Three major work streams: a 4th AI harness adapter, a structured memory system with cross-session recall, and TUI polish with boolean toggle fields.

#### Work Stream A: OpenCode Harness

- **New harness adapter** — Added OpenCode as the 4th harness alongside Claude, Gemini, and Copilot. OpenCode is a Go-based open-source coding agent that supports OpenRouter natively
- **Adapter implementation** — `opencode.ts` follows the Claude adapter pattern: `opencode run --quiet` for non-interactive execution, model override via `--model`, env passthrough for API keys
- **Kennel installation** — OpenCode CLI installed via `npm i -g opencode-ai@latest` in the kennel Dockerfile
- **CLI config** — Added `data/cli-configs/OPENCODE.md` with kennel instructions matching the existing Claude/Gemini configs
- **Docker integration** — Added `OPENCODE_API_KEY` and `OPENROUTER_API_KEY` env passthrough to kennel, config volume mount
- **Registry** — OpenCode registered in harness registry, `AgentType` union extended, identity manager capabilities updated

#### Work Stream B: Memory System Overhaul

- **Structured memory table** — New `memory` table in SQLite with category (fact/preference/decision/file_operation/compaction_summary), keyword-based search, importance scoring, and recall tracking
- **Memory CRUD** — `addMemory()` and `recallMemories()` methods on SessionStore and SessionManager with BM25-style keyword matching
- **Chained compaction** — Previous compaction summaries are saved as memory entries before overwriting, and the new summary prompt includes the previous summary for continuity
- **Tool result compression** — Tool outputs exceeding `FETCH_TOOL_RESULT_MAX_PERSIST` (default: 2000 chars) are truncated before persisting to session history, preventing context bloat from large GitHub PR content or web fetches
- **Recalled context injection** — `buildContextSection()` now queries the memory store using keywords from the current user message and injects up to `FETCH_RECALL_LIMIT` recalled memories into the system prompt
- **Auto-cleanup** — `SessionStore.init()` now runs `cleanup()` on startup to purge expired sessions
- **Legacy table migration** — Dropped unused `conversation_summaries` and `conversation_threads` tables, removed `currentThreadId` from Session interface
- **Pipeline params** — Added `recallLimit`, `recallSnippetTokens`, `recallDecay`, `toolResultMaxPersist`

#### Work Stream C: TUI Cleanup

- **Boolean toggle fields** — Added `IsToggle` field type to the Go TUI config editor. Boolean fields now render as `[✓]`/`[ ]` checkboxes and toggle on Enter/Space instead of opening a text editor
- **Toggle styles** — Added `ToggleOn` (green bold) and `ToggleOff` (gray) styles to the theme
- **Applied to 7 fields** — `ENABLE_COPILOT`, `ENABLE_CLAUDE`, `ENABLE_GEMINI`, `ENABLE_OPENCODE`, `ENABLE_WEB_FETCH`, `ENABLE_WEB_SEARCH`, `ENABLE_BROWSER`
- **OpenCode in TUI** — Added `ENABLE_OPENCODE`, `OPENCODE_API_KEY`, and `OPENCODE_MODEL` fields to the config editor

#### Files Changed (20)

| Area | Files |
|------|-------|
| Harness | `harness/opencode.ts` (new), `harness/registry.ts`, `task/types.ts` |
| Config | `config/env.ts`, `config/pipeline.ts` |
| Session | `session/store.ts`, `session/types.ts`, `session/manager.ts` |
| Agent | `agent/core.ts`, `agent/prompts.ts` |
| Identity | `identity/manager.ts` |
| CLI Config | `data/cli-configs/OPENCODE.md` (new) |
| Docker | `kennel/Dockerfile`, `docker-compose.yml` |
| TUI | `manager/internal/config/editor.go`, `manager/internal/theme/styles.go` |
| Docs | `data/identity/COLLAR.md`, `README.md`, `CHANGELOG.md` |
| Tests | `tests/unit/command-parser.test.ts`, `tests/unit/task-manager.test.ts` |

---

## [0.0.36] - 2026-02-11

### 🐕 Conversational & Tool Response Quality Improvements

8 targeted fixes to how Fetch formats responses, handles errors, tracks progress, and communicates with users via WhatsApp.

#### Response Formatting

- **Fixed double truncation** — Removed redundant 1500-char hard cap in handler. WhatsApp formatter (4000 chars) is now the single source of truth for message length, giving responses 2.7x more space
- **Improved repetition detection** — Replaced fragile byte-level regex with sentence-level deduplication that catches both exact duplicates and near-repeats. Stops after 3 detected duplicates to prevent loops
- **Fixed system prompt formatting** — Cleaned up stray spaces, broken markdown bold markers, and inconsistent indentation in the LLM system prompt template

#### Error Handling

- **Error message sanitization** — All error messages sent to WhatsApp are now sanitized: API keys, file paths, stack traces, and HTTP headers are stripped before reaching the user. Messages are capped at 200 chars
- **Dual-layer sanitization** — Applied in both handler.ts (message-level) and core.ts (agent-level) error paths

#### Tool Results

- **Tool result summaries** — Added optional `summary` field to `ToolResult` interface. `web_fetch` and `web_search` now provide concise summaries (title + snippet) so the LLM can produce better WhatsApp-formatted answers
- **Tool execution progress** — Slow tools (web_fetch, web_search, browser_open, task_create) now send a progress message to WhatsApp after 4 seconds. Users no longer think the bot is frozen during long operations

#### Task Notifications

- **Enriched task completions** — Task completion messages now include file change counts (created/modified/deleted) and execution duration alongside the summary

#### Files Changed (8)

| Area | Files |
|------|-------|
| Handler | `handler/index.ts` |
| Agent | `agent/core.ts` |
| Identity | `identity/manager.ts` |
| Tools | `tools/types.ts`, `tools/web.ts` |
| Config | `config/env.ts` |
| Docs | `CHANGELOG.md`, `docs/markdown/README.md` |

---

## [0.0.35] - 2026-02-11

### 🛡️ Comprehensive Codebase Hardening — 50 Issues Resolved

Full codebase audit identified 55 issues across 12 clusters. 50 resolved across security, process lifecycle, concurrency, resilience, Docker, agent core, task system, tools, harness adapters, session management, and configuration. 5 test coverage items deferred.

#### Security & Shell Injection (Cluster 1)

- **Shell injection prevention** — Quoted all `${path}` variables in `sh -c` commands across 10+ locations in workspace manager
- **Sed injection fix** — Replaced unsafe `sed`-based JSON editing with `npm pkg set`
- **Heredoc file creation** — Replaced `echo '${content}'` (literal `\n`) with `cat << 'HEREDOC'` pattern
- **Git safety** — Added length guard for status line parsing, improved detached HEAD detection with `git rev-parse --short HEAD` fallback
- **Branch detection** — Replaced hardcoded `origin/main` with `@{upstream}..HEAD` for correct default branch detection
- **GitHub rollback** — Graceful handling when GitHub repo creation fails during workspace create

#### Process Lifecycle (Cluster 2)

- **Timer cleanup** — Store timeout IDs in Map, `clearTimeout` on process completion
- **Listener cleanup** — Remove stdout/stderr listeners in close handler
- **Execution isolation** — Added `settled` flag per-execution to prevent cross-fire between concurrent harness instances
- **Race condition fix** — Timer-map guard pattern prevents timeout/close race condition

#### Concurrency (Cluster 3)

- **Singleton races** — Promise-lock pattern for `getSessionManager()`, `getTaskManager()`, `getWhitelistStore()` singletons
- **Persistence mutex** — Promise-chain serialization for whitelist `add()`/`remove()` writes
- **Rate limiter consistency** — Extracted shared `prune()` method used by both `isAllowed()` and `getRemaining()`

#### Watcher & Loader Resilience (Cluster 4)

- **Error handlers** — Added `.on('error')` to chokidar watchers (identity + skills)
- **Async I/O** — Converted `IdentityLoader.load()` to async with `fs.promises`
- **Structured logging** — Replaced `console.warn`/`console.error` with `logger` in loader
- **Shutdown methods** — Added `shutdown()` to close watcher file descriptors in identity and skills managers

#### Docker Hardening (Cluster 5)

- **Health checks** — Added `HEALTHCHECK` to fetch-bridge (curl /api/status) and fetch-kennel (test -f /tmp/kennel-ready)
- **Resource limits** — Memory (2G) and CPU (2.0) limits on fetch-bridge container
- **Log rotation** — `json-file` driver with 50m max-size, 3 max-files for both services

#### Handler & Agent Core (Cluster 6)

- **Async safety** — Fixed fire-and-forget async setTimeout callback with `.then()/.catch()` pattern
- **Input validation** — Empty/whitespace message rejection before LLM processing
- **State sync validation** — Added field validation after `JSON.parse` in tool call state sync (workspace_select, workspace_create, task_create)
- **Event handler safety** — Added `.catch()` to unhandled async promises in task event handlers
- **Parser improvement** — Word boundary regex for capability trigger matching
- **Context simplification** — Clarified retry context reduction on 400 errors

#### Task & Pool System (Cluster 7)

- **Unused AbortController removed** — Changed `activeExecutions` from `Map<TaskId, AbortController>` to `Set<TaskId>`
- **Persistence safety** — Try/catch around store save operations in TaskManager
- **Queue resilience** — Wrapped recursive `processQueue()` in try/catch
- **Defensive cleanup** — Try-finally per cleanup op in `executeTask` finally block
- **Goal validation** — Reject empty task goals before creation
- **Helper extraction** — `isActiveStatus()` helper for status comparisons

#### Tool System (Cluster 8)

- **Workspace validation** — Check workspace exists in `handleWorkspaceSync` before proceeding
- **Configurable timeout** — Browser timeout via `FETCH_BROWSER_TIMEOUT` pipeline param
- **Output cap** — Shell handler output capped at 100K characters
- **Custom tool lifecycle** — Implemented `unloadCustomTool()` with file-to-name tracking

#### Harness Adapters (Cluster 9)

- **Shared constant** — Extracted `KENNEL_CONTAINER` from hardcoded `'fetch-kennel'` strings
- **Path validation** — Workspace path existence check before spawning harness
- **Cross-platform errors** — Added timeout string matching alongside Linux exit code 124/137
- **Shutdown methods** — Added `shutdown()` to HarnessPool, HarnessExecutor, TaskIntegration
- **Execution metadata** — Populated `HarnessExecution.pid` and `exitCode` fields

#### Session & Security (Cluster 10)

- **Compaction tracking** — Track consecutive compaction failures, escalate after 3
- **Atomic clear** — Only mutate session after confirmed DB write in `/clear` command

#### Config & Cleanup (Cluster 11)

- **API key docs** — Added `ANTHROPIC_API_KEY` to `.env.example`
- **Centralized version** — Single `VERSION` constant in `config/env.ts`, used by parser, format, and identity manager
- **Emoji reactions** — Implemented approval/rejection handling for WhatsApp emoji reactions in bridge client

#### Files Changed (30+)

| Area | Files |
|------|-------|
| Workspace | `workspace/manager.ts`, `workspace/repo-map.ts` |
| Harness | `harness/spawner.ts`, `harness/executor.ts`, `harness/pool.ts`, `harness/types.ts`, `harness/claude.ts`, `harness/gemini.ts`, `harness/copilot.ts` |
| Agent | `agent/core.ts`, `handler/index.ts`, `commands/parser.ts` |
| Identity | `identity/loader.ts`, `identity/manager.ts` |
| Skills | `skills/manager.ts` |
| Security | `security/whitelist.ts`, `security/rateLimiter.ts` |
| Session | `session/manager.ts` |
| Task | `task/manager.ts`, `task/integration.ts` |
| Tools | `tools/registry.ts`, `tools/browser.ts`, `tools/workspace.ts` |
| Config | `config/env.ts`, `config/pipeline.ts` |
| Bridge | `bridge/client.ts` |
| Docker | `docker-compose.yml` |
| Docs | `.env.example`, `docs/index.html` |

## [0.0.34] - 2026-02-11

### 🔧 Harness, Identity, Skills & Tool System Hardening

10 targeted fixes across the harness adapters, identity/prompt builder, skills manager, tool registry, spawner, pool, and workspace repo-map. No new modules — all changes strengthen existing systems.

- **CLI Config Injection (CRITICAL)** — `data/cli-configs/` templates are now wired into each harness adapter:
  - Claude: `--append-system-prompt /app/data/cli-configs/CLAUDE.md`
  - Gemini: `GEMINI_SYSTEM_MD=/app/data/cli-configs/GEMINI.md` env var
  - Copilot: `COPILOT_CUSTOM_INSTRUCTIONS_DIRS=/app/data/cli-configs` env var

- **Context Budget Enforcement (CRITICAL)** — System prompt now tracks estimated token usage:
  - New `FETCH_CONTEXT_BUDGET` pipeline param (default: 6000 tokens)
  - Heuristic estimator: `Math.ceil(text.length / 4)`
  - When over budget: truncates session context first, then activated skills
  - Logged warning on truncation

- **Error Classification (HIGH)** — Harness failures now carry a typed `errorCategory`:
  - New `ErrorCategory` type: `timeout | network | permission | syntax | process | unknown`
  - `classifyError()` in executor.ts checks exit codes, stderr patterns, and process status
  - Category is logged alongside the error for observability

- **Pool/Task Concurrency Alignment (HIGH)** — `HarnessPool.maxConcurrent` changed from 2 to 1:
  - Matches `TaskManager`'s intentional single-task-at-a-time model
  - Pool queueing still works for serializing concurrent requests

- **Skill-to-Harness Routing Hints (HIGH)** — Skills now suggest which harness to use:
  - New optional `harnessHint` field on `Skill` interface and SKILL.md frontmatter
  - Rendered as `harness_hint` XML attribute on `<activated_skill>` blocks
  - Built-in hints: git → `copilot`, docker/typescript/react/testing/debugging → `claude`

- **Tool Input Validation (MEDIUM)** — Zod `safeParse` now runs before every tool execution:
  - Invalid args return structured error messages to the LLM for self-correction
  - Valid args are cleaned/defaulted via `validation.data` before reaching the handler
  - Replaces the previous skip-validation comment

- **Pack Body in System Prompt (MEDIUM)** — Agent profile markdown bodies are now included:
  - `buildPackContext()` adds `<strengths>` section from each pack member's body
  - Truncated to 200 chars to stay within token budget
  - Previously loaded by `IdentityLoader` but silently discarded

- **Repo Map Trimming (MEDIUM)** — `formatRepoMap()` now respects a character budget:
  - New `maxOutputChars` option in `RepoMapOptions` (default: 3000)
  - Stops adding entries when approaching the limit
  - Appends `... (truncated, N files omitted)` with remaining count

- **Spawner Question Detection Fix (MEDIUM)** — Removed naive `text.includes('?')` check:
  - Previously any stdout containing `?` set status to `waiting_input`
  - Triggered on URLs, ternary operators, code comments
  - Proper detection already handled by adapter `detectQuestion()` methods

#### Files Changed

| File | Change |
|------|--------|
| `fetch-app/src/harness/claude.ts` | Added `--append-system-prompt` arg for CLI config |
| `fetch-app/src/harness/gemini.ts` | Added `GEMINI_SYSTEM_MD` env var for CLI config |
| `fetch-app/src/harness/copilot.ts` | Added `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` env var |
| `fetch-app/src/harness/spawner.ts` | Removed naive `?` question detection |
| `fetch-app/src/harness/executor.ts` | Added `classifyError()` function, `ErrorCategory` import |
| `fetch-app/src/harness/types.ts` | Added `ErrorCategory` type, `errorCategory` to `HarnessResult` |
| `fetch-app/src/harness/pool.ts` | Changed `maxConcurrent` default from 2 to 1 |
| `fetch-app/src/identity/manager.ts` | Pack body inclusion, context budget enforcement |
| `fetch-app/src/tools/registry.ts` | Zod `safeParse` validation before tool execution |
| `fetch-app/src/workspace/repo-map.ts` | `maxOutputChars` parameter, truncation logic |
| `fetch-app/src/skills/types.ts` | Added `harnessHint` to `Skill` interface |
| `fetch-app/src/skills/loader.ts` | Parse `harnessHint` from SKILL.md frontmatter |
| `fetch-app/src/skills/manager.ts` | Render `harness_hint` attribute in activated skill XML |
| `fetch-app/src/config/pipeline.ts` | Added `contextBudget` param (env: `FETCH_CONTEXT_BUDGET`) |
| `fetch-app/src/skills/builtin/*/SKILL.md` | Added `harnessHint` to 6 built-in skills |

## [0.0.33] - 2026-02-11

### 🎛️ TUI Layout Overhaul & Dead Code Cleanup

Major TUI improvements for the Fetch Manager, including a shared screen layout system, dynamic menu badges, section navigation in the config editor, responsive layout, and style consolidation. Followed by a comprehensive dead code audit removing ~800 lines across 12 files.

- **ScreenLayout Scaffold** (`layout/screen.go`):
  - New shared `ScreenLayout` struct standardizing the Title > Breadcrumb > Content > HelpBar pattern
  - Breadcrumb navigation trail with styled separators
  - Refactored all 7 `view*()` methods in `main.go` to use the scaffold, eliminating ~120 lines of duplicated boilerplate

- **Menu Component with Dynamic Badges**:
  - Replaced raw `choices []string` + `cursor int` with proper `components.Menu` using `MenuItem` structs
  - Added `Badge` field to `MenuItem` for dynamic status (e.g., `[Running]`, `[2 acct]`)
  - `buildMenuBadges()` method queries live Docker/GitHub state for badge content

- **Config Editor Section Navigation**:
  - Tab key opens section picker overlay listing all 13 config sections
  - Number keys 1-9 jump directly to sections
  - Section indicator at top: `Section N/13: Name`
  - `sectionInfo` struct caches separator positions for instant jumps

- **Responsive Layout**:
  - Compact mode (<60 cols) hides ASCII dog art, uses `CompactHeader`
  - `viewMenu()` adapts layout based on terminal width

- **Style Consolidation**:
  - Added 11 new style variables to `theme/styles.go` (EditorLabel, EditorInput, EditorFocused, EditorHelp, EditorSeparator, EditorDefault, SelectorNormal, SelectorDim, SelectorContext, SelectorModality, SelectorToolsBadge)
  - Replaced hardcoded inline `lipgloss.Color()` literals in `editor.go` (6 vars), `whitelist.go` (6 vars), `selector.go` (10 vars)

- **Dead Code Removal (~800 lines across 12 files)**:
  - Removed unreachable `screenModels` state, `updateModels()`, `viewModels()` from `main.go`
  - Removed 11 unused functions from `layout/frame.go` (kept only `SectionHeader`)
  - Removed 13 unused functions from `layout/responsive.go` (kept only `IsCompact`)
  - Removed 18 unused style vars + 4 unused style funcs from `theme/styles.go`
  - Removed 7 unused border styles from `theme/borders.go` (kept only `PanelBorder`)
  - Removed unused `Menu.View()` framed version, `SimpleProgress()`, `DownloadProgress()`, `SplashCompact()`, `SplashFull()`, `VersionCompact()`
  - Removed unused `IsHealthy()`, `Logout()`, `LogoutResponse` from status client
  - Removed unused `GetRecentLogsFormatted()`, `StreamLogs()` from logs
  - Deleted entire unused `update/update.go` package

- **`fetch` Command Installed to PATH**:
  - Built `fetch-manager` v4.1.1 via `build.sh` with ldflags (version, commit, build date)
  - Symlinked `manager/fetch-manager` to `~/.local/bin/fetch`
  - Running `fetch` from any terminal now launches the TUI

- **Documentation Site Overhaul**:
  - 3-column layout: sidebar | content | right-side Table of Contents
  - TOC with IntersectionObserver scroll spy, auto-highlights current section
  - Copy buttons on all code blocks with language labels
  - Syntax highlighting via Highlight.js (One Dark / One Light themes)
  - Professional typography with Inter + JetBrains Mono fonts
  - Back-to-top button, heading anchor links, improved tables
  - Responsive breakpoints: mobile (<768px), mid (769-1399px), wide (>1400px)

## [0.0.32] - 2026-02-11

### 🌐 Web Fetch, Web Search & Browser Automation

Fetch gains 6 new tools for web content retrieval, search, and browser automation — all 100% free with no API keys required, adapted for Fetch's dual-container architecture.

- **Web Tools (2 new):**
  - `web_fetch` — Fetches a URL and extracts readable content as markdown using jsdom + Mozilla Readability + Turndown. Blocks private/internal URLs (localhost, 10.x, 192.168.x, etc.). Supports CSS selector extraction. 50k char limit, 30s timeout.
  - `web_search` — Searches the web via self-hosted SearXNG meta search engine. Returns structured results with title, URL, snippet, and engine source. Supports categories (general, images, news, science, it).

- **Browser Tools (4 new):**
  - `browser_open` — Navigate to a URL and return an accessibility tree snapshot with numbered element refs
  - `browser_snapshot` — Get current page accessibility tree snapshot without navigating
  - `browser_action` — Perform actions (click, type, scroll, back, forward) using numbered element refs
  - `browser_screenshot` — Capture a screenshot of the current browser page

- **SearXNG Integration:**
  - Added `searxng` as a third Docker container (`searxng/searxng:latest`)
  - Aggregates Google, DuckDuckGo, Bing, Wikipedia, GitHub, StackOverflow, npm
  - Configuration in `config/searxng/settings.yml`
  - Accessible at `http://localhost:8888` (host) or `http://searxng:8080` (Docker network)

- **Playwright in Kennel:**
  - Added Playwright + Chromium to the Kennel Dockerfile
  - Browser agent script at `kennel/browser-agent.mjs`
  - Accessibility tree snapshots reduce token usage by 60-93% vs raw HTML
  - Persistent browser state via `/tmp/fetch-browser-state.json`

### 🔧 Configuration

- **6 new TUI config fields** in the "Web / Browser" section:
  - `ENABLE_WEB_FETCH` (default: true), `ENABLE_WEB_SEARCH` (default: true), `ENABLE_BROWSER` (default: false)
  - `FETCH_SEARXNG_URL`, `FETCH_WEB_FETCH_MAX_LENGTH`, `FETCH_BROWSER_TIMEOUT`
- **3 new pipeline parameters:** `searxngUrl`, `webFetchMaxLength`, `browserTimeout`
- **3 new dependencies:** `jsdom`, `@mozilla/readability`, `turndown` (+ type defs)

### 🧪 Tests

- New `tests/unit/web-tools.test.ts` with 17 tests covering:
  - Input validation, URL format validation, private URL blocking (localhost, 127.x, 10.x, 192.168.x)
  - Live page fetching, CSS selector extraction, non-existent selector handling
  - HTTP error handling, metadata verification
  - Search input validation, empty query rejection, SearXNG connection handling, count/category params
- Full suite: 179/190 tests passing (same 11 pre-existing failures)

### 📊 Stats

- **Tool count:** 21 → **27** (6 new tools)
- **Docker services:** 2 → **3** (added SearXNG)
- **Feature flags:** 3 → **6** (added web/browser toggles)
- **Pipeline params:** 31 → **34** (added web/browser config)
- **Dependencies:** 10 → **13** (added jsdom, readability, turndown)

#### Files Changed

| File | Change |
|---|---|
| `src/tools/web.ts` | **NEW** — web_fetch and web_search handlers |
| `src/tools/browser.ts` | **NEW** — 4 browser tool handlers |
| `kennel/browser-agent.mjs` | **NEW** — Playwright browser script for Kennel |
| `config/searxng/settings.yml` | **NEW** — SearXNG engine configuration |
| `src/validation/tools.ts` | +6 Zod schemas, type exports, registry entries |
| `src/tools/registry.ts` | Import + register 6 web/browser tools as builtins |
| `src/tools/index.ts` | Export new web and browser modules |
| `src/config/env.ts` | +3 feature flags (ENABLE_WEB_FETCH, ENABLE_WEB_SEARCH, ENABLE_BROWSER) |
| `src/config/pipeline.ts` | +3 pipeline params (searxngUrl, webFetchMaxLength, browserTimeout) |
| `docker-compose.yml` | Added searxng service |
| `kennel/Dockerfile` | Added Playwright + Chromium + browser-agent.mjs |
| `manager/internal/config/editor.go` | +6 TUI config fields in "Web / Browser" section |

#### Safety

- `web_fetch` and `web_search` are gated as `DangerLevel.SAFE`
- `browser_open` and `browser_action` are gated as `DangerLevel.MODERATE` (navigate/interact)
- `browser_snapshot` and `browser_screenshot` are gated as `DangerLevel.SAFE` (read-only)
- Private URL blocking prevents SSRF attacks (localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, ::1, fe80:)
- Browser tools default to disabled (`ENABLE_BROWSER=false`) since Playwright adds ~250MB to Kennel image

## [0.0.31] - 2026-02-11

### 📖 Documentation & UX Overhaul

- **Agentic Workflow Rebrand**:
  - Renamed `AGENTIC_PLAN.md` to `AGENTIC_WORKFLOW.md`.
  - Rewrote content to align with the core ReAct loop, the 5 Autonomy Rules, and "The Pack" architecture.
- **Documentation Site Redesign**:
  - Overhauled the sidebar navigation in `index.html` for a cleaner "Code Companion" aesthetic.
  - Implemented theme-aware Mermaid rendering with a dedicated `mermaid-wrapper` for consistent dark mode visibility.
  - Added real-time error reporting to the document loader to aid in debugging broken markdown files.

### 🏗️ Architectural Standardization

- **Diagram Refactoring**:
  - Standardized "System Overview" in `ARCHITECTURE.md` using `flowchart TB` for better readability.
  - Added visibility into Harness host-mounts (`~/.config/gh`, `~/.gemini`, etc.) and Adapter logic.
  - Corrected Mermaid syntax errors in `STATE_MANAGEMENT.md` (ER diagrams) and `ARCHITECTURE.md`.
- **Capability Scanner RFC**:
  - Published `RFC_CAPABILITY_SCANNER.md` proposing a shift from static project detection to a weighted Capability scoring system.

### 🧹 Fixes & Alignment

- **Accuracy Fix**: Updated outdated references stating Gemini Pro 1.5 as the default model; normalized documentation to point to `openai/gpt-4o-mini` per `src/config/env.ts`.
- **Mermaid Reliability**: Fixed unhandled promise rejections in the diagram rendering engine.

## [0.0.30] - 2026-02-10

### 🐙 GitHub Tools Expansion (8 New Tools)

Fetch's tool suite has been expanded from 13 to **21 tools** with 8 new GitHub-native tools. All tools execute `gh` CLI commands inside the `fetch-kennel` container via `dockerExec`.

- **PR Management:**
  - `github_pr_create` — Create pull requests (defaults to draft mode for safety)
  - `github_pr_list` — List PRs filtered by state (open/closed/all)
  - `github_pr_view` — View PR details including reviews, comments, and merge status

- **Issue Tracking:**
  - `github_issue_create` — Create issues with optional labels

### 💅 UX & Reliability Improvements

- **Expanded `/help` Command**: Now lists all 21 tools and available AI harnesses.
- **Context Preservation Fix**: Identity memory slice increased to 4 messages on retry to prevent "No tool call found" errors.
- **Simplified Status**: Removed detailed settings from `/status` output for cleaner reporting.
  - `github_issue_list` — List issues with state, assignee, and label filters

- **Branching:**
  - `github_branch_create` — Create and push new branches, optionally from a specified base

- **CI/CD Monitoring:**
  - `github_action_status` — View latest GitHub Actions workflow runs and their statuses

- **Repository Search:**
  - `github_search_repos` — Search GitHub repositories by keyword (no workspace required)

### 🐕 WhatsApp UX & Persona Upgrade

Improved Fetch's feedback loops and personality for a better WhatsApp experience.

- **Improved `/status` Command**:
  - Overhauled with personality-driven terminology: `supervised` -> "Leashed", `autoCommit` -> "Burying bones", `verbose` -> "Barky".
  - Added "Mood: Tail Wagging" and "Fetch v4.0.6" status headers.
- **Context-Aware Progressive Feedback**:
  - Implemented `generateProgressMessage` to provide specific feedback based on user intent (e.g., "sniffing out status", "hunting down bugs").
  - Replaced generic "fetching again" messages with randomized, dog-themed prefixes ("Woof!", "Bark!", "Awoo!").
- **Proactive Thinking Timer**:
  - Added a 3-second timer in the handler to send initial "thinking" feedback for long-running requests, ensuring the user isn't left in silence.
- **Version String Upgrade**:
  - Unified versioning across `/v` and `/status` to v4.0.6.

#### Files Changed

| File | Change |
|---|---|
| `src/validation/tools.ts` | +8 Zod schemas, type exports, registry entries |
| `src/tools/github.ts` | **NEW** — 8 handler functions + tool descriptions |
| `src/workspace/manager.ts` | +8 backend methods using `dockerExec` + `gh` CLI |
| `src/tools/registry.ts` | Import + register 8 GitHub tools as builtins |

#### Safety

- Write operations (`pr_create`, `issue_create`, `branch_create`) are gated as `DangerLevel.MODERATE`
- Read operations (`pr_list`, `pr_view`, `issue_list`, `action_status`, `search_repos`) are `DangerLevel.SAFE`
- PR creation defaults to **draft mode** to prevent accidental merges

## [0.0.29] - 2026-02-09

### 🔄 Hotreload & TUI UX

- **Automated Service Restart**:
  - **Feature**: The TUI Manager now automatically restarts the `fetch-bridge` container after saving configuration changes.
  - **Benefit**: Ensures newly configured environment variables (like agent models) are applied immediately without manual Docker commands.
- **Global Link Fix**: Streamlined the installation process for linking the local `fetch-manager` to the global `fetch` command.

## [0.0.28] - 2026-02-09

### 🐛 Bug Fixes

- **Agent Selection Ambiguity (Final Fix)**:
  - **Issue**: LLM was bypassing the ambiguity check by explicitly selecting an agent (e.g., `agent: 'gemini'`) instead of asking the user when multiple agents were enabled.
  - **Fix**: Updated `task_create` tool description and `TaskCreateInputSchema.agent` description to explicitly instruct the LLM to call `ask_user` BEFORE calling `task_create` when multiple agents are enabled.

- **Gemini CLI Read-Only Crash**:
  - **Issue**: Gemini CLI failed because `~/.gemini` was mounted read-only, blocking OAuth credential caching and temp file writes.
  - **Fix**: Changed `docker-compose.yml` mount from `:ro` to read-write.

- **Workspace Name Case Sensitivity**:
  - **Issue**: npm's `create-next-app` rejected workspace names with capital letters (e.g., `Nextjs-Demo`).
  - **Fix**: Added automatic lowercase normalization in `WorkspaceNameSchema` and `WorkspaceManager.createWorkspace()`. Names like `MyNextApp` are now normalized to `mynextapp`.

- **Improved Harness Error Reporting**:
  - **Issue**: Failed harness tasks returned vague "Process failed" errors without details.
  - **Fix**: Updated `HarnessExecutor.executeWithConfig()` to capture and include the last lines of harness output in error messages.
  
  ### 🚀 New Features
  
  - **TUI Model Configuration**:
    - **Feature**: Added configuration fields to the TUI manager for specifying agent models (`COPILOT_MODEL`, `CLAUDE_MODEL`, `GEMINI_MODEL`).
    - **Benefit**: Allows users to override the default models (e.g., set Copilot to use `gpt-4` or Claude to use `claude-3-opus`) without editing `.env` manually.

### 🔒 Security Hardening

- **Reaction Filtering**: Updated `SecurityGate` to filter out historical WhatsApp reactions and non-whitelisted emoji reactions, preventing stale reactions from being processed as active input.

## [0.0.27] - 2026-02-09

### ✨ UX Improvements

- **Informative "What can you do?" Response**:
  - Added a `## YOUR CAPABILITIES` section to the system prompt.
  - The agent now has explicit awareness of its safety commands (/stop, /undo, etc.), 13 orchestrator tools, and available AI harnesses.
- **New `workspace_publish` Tool**:
  - **Issue**: `workspace_sync` would skip creating a GitHub repository if the local project already had commits but no uncommitted changes.
  - **Fix**: Introduced `workspace_publish` for explicit, reliable creation of new GitHub repositories from existing local projects.
- **Improved Tool Awareness**: Updated the system prompt to explicitly list all available tools and their categories for better ReAct loop performance.

## [0.0.26] - 2026-02-09

### 🐛 Critical Bug Fixes

- **Session Recursion / Identity Crisis**:
  - **Issue**: `task_create` handler was receiving a `sessionId` (UUID) but passing it to `getOrCreateSession`, which expects a `userId` (Phone Number). This caused the system to create "nested" sessions where the `userId` field was populated with the previous UUID (`04fmpqa3...`), disconnecting the user from their phone number.
  - **Fix**: Implemented and used `getSessionById(sessionId)` in `fetch-app/src/session/manager.ts` and updated `fetch-app/src/tools/task.ts` to strictly distinguish between `startTime` UUIDs and phone numbers.

- **Notification Breakdown**:
  - **Issue**: Proactive notifications (e.g., "Task completed") were failing because the bridge was attempting to send WhatsApp messages to the internal `sessionId` UUID instead of the user's phone number.
  - **Fix**: Updated `fetch-app/src/bridge/client.ts` to look up the `userId` from the `SessionManager` before sending proactive messages. It now correctly resolves `bo0ejfbe...` -> `25565...`.

- **Agent Hallucination & Selection Ambiguity**:
  - **Issue**: The LLM would sometimes select disabled agents or fail to prompt when multiple agents were enabled.
  - **Fix**: Updated `fetch-app/src/validation/tools.ts` to restrict `AgentSelectionSchema` to only explicitly enabled agents.
  - **Fix**: Refined `TaskManager.selectAgent` to correctly handle `auto` selection and prompt for choice when multiple agents are active.
  - **Fix**: Fixed boolean string evaluation for `ENABLE_COPILOT`, `ENABLE_GEMINI`, and `ENABLE_CLAUDE` flags using an `isTrue()` helper.

### ⚡ Harness & Environment Updates

- **ESM/CommonJS Mismatch**:
  - **Issue**: An inline `require('../config/env.js')` in `TaskManager.selectAgent` caused silent crashes in the ESM-based bridge.
  - **Fix**: Replaced with a standard ES module `import`.

- **Kennel Tooling**:
  - **Issue**: The `kennel` container lacked the necessary CLIs for Gemini and Copilot task execution.
  - **Fix**: Updated `kennel/Dockerfile` to install `gh` and `gemini` (Google Generative AI) CLIs by default.

- **GitHub Copilot CLI Syntax**:
  - **Issue**: The previous `gh copilot suggest` CLI syntax was deprecated/incorrect for the installed version.
  - **Fix**: Updated `fetch-app/src/harness/copilot.ts` to use `gh copilot --yolo -p` for headless execution.

## [0.0.25] - 2026-02-07 (The Conversation IS the Interface 🐕)

> Sprint 1 of the v4.0 Conversational Refactor — collapsing 5 pre-LLM routing layers into a single LLM-first architecture.
> Based on competitive analysis of Claude Code, Goose, Cline, Aider, and Continue.dev.

### 🏗️ Architecture — LLM-First Routing (Sprint 1)

**The Big Change:** Every message now goes directly to the LLM with ALL 12 tools. No more intent classification, mode detection, or instinct pre-filtering. The LLM decides whether to chat or call tools — exactly how Claude Code, Goose, and Cline work.

- **Deleted Intent Classifier** (`agent/intent.ts`, 520 lines): Removed ~200 regex patterns that pre-classified messages as `conversation`, `action`, or `clarify`. The LLM handles this natively through tool-calling.
- **Deleted Mode Detector** (`conversation/detector.ts`, 73 lines): Removed keyword-based TASK/EXPLORATION/TEACHING/COLLABORATION/CHAT classification. Mode context now comes from the conversation itself.
- **Deleted Instinct Registry** (12 files, ~1,400 lines): Removed all hardcoded instinct handlers (`help`, `status`, `commands`, `skills`, `tools`, `scheduling`, `safety`, `whoami`, `identity`, `thread`, `index`, `types`). The LLM answers these questions from its system prompt and tool descriptions.
- **Unified Agent Core** (`agent/core.ts`, 1127→808 lines): Collapsed `handleConversation()` (3 read-only tools) + `handleWithTools()` (all tools) into a single `handleWithTools()` path. Removed `classifyIntent()` call, `handleInstinctAction()`, and the conversation/action split.
- **Cleaned Conversation Types** (`conversation/types.ts`): Removed `ModeDetectionResult` interface (no longer needed without mode detector).

### 🐛 Bug Fixes — Live Testing

- **Degenerate Arg Detection** (`agent/core.ts`): Fixed regex that incorrectly rejected `{}` as "degenerate" empty args. `{}` is valid JSON for no-argument tools like `workspace_list`. Changed `/^[\s{}]*$/` → `/^\s*$/` in both the execution filter and persistence filter.
- **Docker Exec Harness Path** (3 cascading fixes):
  - Added `container` field to `HarnessConfig` interface — when set, the spawner wraps commands with `docker exec` for the dual-container bridge→kennel architecture.
  - Updated `spawner.ts` to build `docker exec -w <cwd> [-e K=V] <container> <command> <args>` when `config.container` is set.
  - Fixed `executor.ts` to pass full config object to `pool.acquire()` instead of destructuring (which dropped the `container` field).
  - Updated all 3 harness adapters (`claude.ts`, `gemini.ts`, `copilot.ts`) to set `container: 'fetch-kennel'`.
- **Docker CLI in Bridge** (`fetch-app/Dockerfile`): Bridge container had docker.sock mounted but no `docker` CLI binary. Added `curl`, `gnupg`, and `docker-ce-cli` installation layer so the bridge can execute `docker exec` commands against the kennel.

### ✨ New Features

- **`workspace_sync` Tool**: New tool for syncing workspaces to GitHub. Stages all changes, commits (auto-generates message if not provided), creates a private GitHub repo if none exists, and pushes. Triggered conversationally ("push my code", "sync to GitHub", "back this up").
- **GitHub Auto-Sync on Create**: `workspace_create` now automatically creates a private GitHub repo and pushes the initial commit (non-blocking — workspace creation succeeds even if sync fails).
- **Kennel Entrypoint** (`kennel/entrypoint.sh`): New entrypoint script configures `gh` CLI auth and git identity from `GH_TOKEN` at container runtime, replacing the read-only host keyring mount approach.
- **Dev Setup GH_TOKEN** (`setup-dev.sh`): Auto-populates `GH_TOKEN` in `.env` from `gh auth token` if the host has `gh` CLI authenticated.

### 🧪 Tests

- **Deleted obsolete tests**: Removed `conversation.test.ts`, `workspace.test.ts` (integration tests that imported the deleted intent classifier), and `intent.test.ts` (unit tests for deleted module).
- **Updated test mocks** (`task-execution.test.ts`): Replaced `intent.ts` mock with mocks for identity manager, skill manager, thread manager, prompts, and repo-map to match the new single-path architecture.
- **New workspace sync tests** (`workspace-manager.test.ts`): Added 6 tests covering GitHub availability check, repo creation, existing repo linking, unavailable GitHub fallback, full sync flow, and non-existent workspace error.
- **Updated tool registry tests** (`tool-registry.test.ts`): Updated expected tool count from 11 to 12, added `workspace_sync` assertion.
- **Test suite:** 173 tests passing, tsc clean (0 errors).

### 📊 Stats

- **Deleted:** 17 files (~2,600 lines removed)
- **Modified:** 21 files
- **New files:** 3 (`CONVERSATIONAL_REFACTOR_PLAN.md`, `PLAN.md`, `kennel/entrypoint.sh`)
- **Architecture:** 5 routing layers → 1 (safety gate only). 12 instinct handlers → 0. Intent classifier regex → 0.

---

## [0.0.24] - 2026-02-08 (Dead Code Purge & Dependency Audit 🧹)

> Full codebase review sprint — systematic file-by-file audit of every src/ directory, config file, and dependency.

### 🗑️ Removed — Dead Code & Dependencies

- **Deleted `src/modes/`** (7 files, ~800 lines): Zombie directory from v4.0 refactor — entire mode system was superseded by LLM-first routing but directory persisted.
- **Deleted `src/conversation/`** (4 files): Thread manager, summarizer, detector, and types — all dead after v4.0 collapsed conversation handling into agent core.
- **Deleted `src/proactive/`** (3 files): Scheduler, watcher, and polling — proactive features deferred, 0 importers.
- **Deleted `types/qrcode-terminal.d.ts`**: Dead type declaration (0 imports) — QR code handled by Go TUI manager, not Node.
- **Deleted `fetch-app/data/`**: Stale duplicate of volume-mounted `data/` directory.
- **Removed 4 dead runtime deps**: `@anthropic-ai/sdk` (0 imports), `qrcode-terminal` (0 imports), `natural` (0 imports), `cron-parser` (0 imports).
- **Removed `@types/natural`** devDep (dead with `natural`).
- **Un-exported `TranscriptionResult`** in `transcription/index.ts` (0 external importers).

### 🐛 Bug Fixes

- **Always-true `.unref()` guards** (`bridge/client.ts`, `security/rateLimiter.ts`): Removed unnecessary `if (timer.unref)` conditionals — `NodeJS.Timeout` always has `.unref()`.
- **Test fixture type error** (`command-parser.test.ts`): Added missing `id` and `timestamp` fields to `Message` literal.

### 📦 Maintenance

- **Dockerfile**: Removed dead `git config --global` block (3 lines) — git identity is configured in Kennel, not Bridge.
- **Regenerated `package-lock.json`**: Was stale at v3.1.0 with 5 phantom packages. Now clean at v4.0.1 with 0 stale entries.
- **ARCHITECTURE.md**: Added **Dependencies (Runtime)** section documenting all 10 live packages with purposes. Includes note clarifying that the `openai` npm package routes through OpenRouter, not OpenAI.
- **README.md**: Fixed model defaults (`gpt-4.1-nano` → `gpt-4o-mini`), removed deleted directories from project structure, added `validation/` directory.

### 🧪 Tests

- **Test suite:** 173 tests passing (12 tests removed with deleted modules), tsc clean (0 errors).

### 📊 Stats

- **Deleted:** 15+ files (~1,600+ lines removed)
- **Dead dependencies removed:** 5 (4 runtime + 1 devDep)
- **Modified:** 10+ files

---

## [0.0.23] - 2026-02-07 (Make It Feel Alive 🧠)

> Full implementation of FIX_PLAN.md — addressing all critical issues found during live testing.
> Goal: Make Fetch feel like an intelligent agent, not a boxy command processor.

### 🧠 Phase 1 — Context Amnesia Fix

- **System Prompt Rebuild (1.1):** After `workspace_select`, `workspace_create`, and `task_create` tool calls, the system prompt (`messages[0]`) is now rebuilt with fresh session state. The LLM immediately sees the updated workspace context instead of stale "no project selected."
- **Workspace as Top-Level Directive (1.2):** Active workspace now appears as the **first** section in the context block with a bold `🎯 ACTIVE WORKSPACE` header and an explicit directive: "Do NOT ask the user to select or confirm a workspace."
- **Post-Create Persistence (1.3):** After `workspace_create` and `task_create`, session state is persisted and the system prompt rebuilt — the LLM sees its own actions reflected immediately.

### 🤖 Phase 2 — Autonomy & Confirmation Loop Fix

- **Autonomy Rules (2.1):** 7 autonomy rules injected as `HIGHEST PRIORITY` at the top of the system prompt. Includes: "Act first, summarize after", "Never ask for confirmation on non-destructive actions", "If user says 'create X', create X."
- **ask_user Guard (2.2):** The `ask_user` tool now pattern-matches unnecessary confirmations ("Shall I proceed?", "Would you like me to?", "Is that okay?"). In cautious/autonomous mode, these auto-approve with "Yes, proceed" without ever reaching the user's phone.
- **ToolContext Pipeline (2.2b):** `ToolContext` interface extended with `autonomyLevel` field. `ToolContext` moved from `registry.ts` to `types.ts` to eliminate circular imports. Both `handleWithTools()` and `handleConversation()` pass the session's autonomy level through.
- **Mode-Aware Instructions (2.3):** System prompt behavioral section now changes based on mode — supervised gets "ask before every action", cautious gets "ask only for destructive", autonomous gets "execute everything immediately."

### 🎯 Phase 3 — Intent Classification & Conversation Tools

- **Conversation Gets Tools (3.1):** `handleConversation()` now has 3 read-only tools: `workspace_list`, `workspace_select`, `workspace_status`. Questions like "what project am I on?" get real tool-based answers instead of hallucinated responses. Includes a 2-call tool loop and workspace state sync.
- **Short Message Cutoff (3.2):** Reduced from 15 chars to 5 chars with an action verb exception pattern (`fix`, `add`, `rm`, `ls`, `cd`, `run`, `git`). "fix auth" (8 chars) now correctly routes to action handler.
- **Greeting Pattern Fix (3.2b):** Added pattern for "hi <name>" style greetings (e.g., "hi Fetch") that were falling to the fallback classifier.
- **Reactions Pattern Fix (3.2c):** Added "maybe" to conversation reactions — was falling through to fallback with the tighter cutoff.

### 💅 Phase 4 — Command UX Polish

- **Descriptive Mode Toggles (4.1):** `/auto` and `/mode <name>` now return bullet-pointed explanations of what each mode does, not just "Switched to X mode."
- **`/mode verbose` Redirect (4.2):** Instead of "Invalid mode", now explains that verbose is a setting (use `/verbose`) and lists the actual modes.
- **Invalid Mode Help (4.2b):** `/mode <invalid>` now shows all 3 available modes with emoji and descriptions instead of a bare error.
- **Context-Aware `/files` (4.3):** `/files` shows project name in header. Empty state mentions project name. `/add` response includes project name.
- **Expanded Project Detection (4.4):** `ProjectType` expanded from 5 to 10 types: added `typescript` (tsconfig.json), `java` (pom.xml, build.gradle), `ruby` (Gemfile), `php` (composer.json), `dotnet` (*.csproj,*.sln). Glob pattern support added to `detectProjectType()`.
- **`/status` Shows Project (4.5):** `formatStatus()` rewritten to prominently show project info (name, path, branch, clean/dirty) before task and settings sections.
- **Version Bump (4.6):** `/version` now shows "Fetch v3.5.0 (Make It Feel Alive)".

### 📝 Phase 5 — System Prompt Optimization

- **Slimmed Prompt (5.1):** System prompt reduced from 12+ sections to ~6 focused sections. Removed redundant CORE DIRECTIVES, OPERATIONAL GUIDELINES, and UNDERSTANDING REQUESTS sections.
- **Conditional Skills (5.2):** Skills section only included when skills are actually loaded, reducing prompt noise.
- **Test Alignment:** Updated `pipeline-config.test.ts` to match actual config values (`chatMaxTokens: 512`, `toolMaxTokens: 2048`).

### 📊 Stats

- **Test suite:** 15 files, 200 tests, 0 failures
- **Modified files:** 14 source + test files
- **Net impact:** +347 lines, −108 lines
- **Commit:** `845aef5`

## [0.0.22] - 2026-02-06 (Context Pipeline 🧠)

### 🧠 Phase 0 — Centralized Configuration Layer

- **Pipeline Config Module (0.1):** Created `config/pipeline.ts` — single source of truth for all 44 tunable pipeline parameters. Every threshold, token budget, temperature, and limit reads from here.
- **Magic Number Replacement (0.2):** Replaced hardcoded constants across 9 source files (`agent/core.ts`, `session/manager.ts`, `agent/prompts.ts`, `handler/index.ts`, `tools/task.ts`, `tools/interaction.ts`, `harness/executor.ts`, `security/rateLimiter.ts`, `task/manager.ts`) with `pipeline.*` references.
- **Env-Tunable Overrides (0.3):** All 44 parameters are overridable via `FETCH_*` environment variables (e.g. `FETCH_HISTORY_WINDOW=30`, `FETCH_COMPACTION_THRESHOLD=60`). Sane defaults work out of the box.
- **TUI Pipeline Tuning (0.4):** Added Pipeline Tuning section to the Go Manager TUI config editor — 10 key `FETCH_*` fields editable from the terminal interface.
- **Docker Compose Integration (0.5):** Wired 10 pipeline env vars through `docker-compose.yml` with commented defaults for quick tuning without code changes.

### 🔌 Phase 1 — Wire the Pipes

- **Handler API Fix (1.1):** Replaced bare `session.messages.push()` in `handler/index.ts` with `sManager.addUserMessage()` + `sManager.addAssistantMessage()` — messages now persist through the full SessionManager lifecycle.
- **Tool Call Persistence (1.2):** After tool execution in `agent/core.ts`, now calls `sManager.addAssistantToolCallMessage()` and `sManager.addToolMessage()` — tool interactions survive across turns.
- **OpenAI Multi-Turn Format (1.3):** Rewrote `buildMessageHistory()` to emit proper OpenAI function calling format: `assistant` messages with `tool_calls` array, `tool` messages with matching `tool_call_id`. Orphan tool messages gracefully fall back to `assistant` role.
- **Session-Aware Tools (1.4):** Introduced `ToolContext` interface in `tools/registry.ts`. `execute()` now passes `{ sessionId }` through the registry to tool handlers. `handleTaskCreate()` in `tools/task.ts` receives the session context.
- **Task Completion Hooks (1.5):** Added `task:completed` and `task:failed` event listeners in `handler/index.ts`. Writes completion/failure messages to session history and sends proactive WhatsApp notifications. New `registerWhatsAppSender()` export wired via `bridge/client.ts`.
- **Task Goal Framing (1.6):** `handleTaskCreate()` now calls `frameTaskGoal()` before dispatching to the harness — goals are self-contained with full context instead of raw user text. Non-fatal fallback to raw goal on error.
- **Compaction Engine (1.7):** New `compactIfNeeded()` method on `SessionManager` — triggers when messages exceed `pipeline.compactionThreshold` (default 40). Builds transcript from old messages, LLM-summarizes via `pipeline.compactionModel`, stores in `session.metadata.compactionSummary`, shrinks message array to last `pipeline.historyWindow` (default 20). Prompts now read compaction summaries instead of legacy `conversation_summaries` table.
- **Dead Code Removal:** Removed `conversation/summarizer.ts` import from session manager (replaced by built-in compaction). Legacy `conversation_summaries` table retained for backward compatibility.

### 📊 Stats

- **Test suite:** 15 files, 200 tests, 0 failures (up from 13 files / 177 tests)
- **New files:** `config/pipeline.ts`, `tests/unit/context-pipeline.test.ts`
- **Modified files:** 18 source files across Phase 0 + Phase 1
- **New interfaces:** `ToolContext { sessionId?: string }` in `tools/registry.ts`
- **New exports:** `registerWhatsAppSender()` from `handler/index.ts`
- **New methods:** `compactIfNeeded()`, `generateCompactionSummary()` on `SessionManager`
- **Commits:** `1db8814` (Phase 0), `91c2856` (Phase 1)

## [0.0.21] - 2026-02-06 (Deep Refinement 🏗️)

### 🏗️ Phase 4 — Architecture Simplification

- **Unified Dual Task System (4.1):** Deleted `SessionTask` from session types. `session/manager.ts` task methods now delegate to `task/manager.ts` — single source of truth for task state. Eliminated `taskApproval` session system.
- **Eliminated Redundant Task Queue (4.2):** Deleted `task/queue.ts` (267 lines). Exposed `getRunningTask()` / `hasRunningTask()` on `TaskManager`. All consumers use TaskManager directly.
- **Centralized Env Config (4.3):** Created `config/env.ts` with Zod schema validating all 13 env vars at startup. Proxy-based lazy access for test compatibility. All files import from `env.ts` instead of reading `process.env` directly.
- **Harness Base Class (4.4):** Extracted `AbstractHarnessAdapter` with shared `formatGoal()`, `isQuestion()`, `extractSummary()`, `extractFileOperations()`. Claude, Gemini, Copilot adapters extend it — ~200 lines of duplication eliminated.
- **Fixed Dual Harness Registration (4.5):** Executor now looks up adapters from the single `HarnessRegistry` instead of maintaining its own parallel Map.
- **Split Command Parser (4.6):** Decomposed 1,096-line god module into ~240-line router + 5 handler modules (`task.ts`, `context.ts`, `project.ts`, `settings.ts`, `identity-commands.ts`).
- **Single Formatting Point (4.7):** Removed `formatForWhatsApp()` from `agent/core.ts`. Formatting now happens only in `handler/index.ts` after receiving the raw response.
- **Intent Collapse (4.8):** Merged `workspace` and `task` intents into single `action` intent — the distinction served no purpose since both took the identical LLM+tools path.

### ⚙️ Phase 5 — Infrastructure & Reliability

- **WhatsApp Reconnection (5.1):** Implemented exponential backoff reconnection (5s base, 5min cap, jitter) with fresh `Client` instance. Max 10 retries. Resets on successful reconnect.
- **Graceful Shutdown (5.2):** Ordered cleanup sequence: proactive system → harness `killAll()` → bridge destroy → SQLite `close()`. Module-scoped bridge reference. `TaskStore.close()` and `HarnessSpawner.killAll()` methods added.
- **Unhandled Rejection Handler (5.3):** Global `unhandledRejection` / `uncaughtException` handlers trigger graceful shutdown. Spawner error handler attached immediately after `spawn()` (fixes ENOENT crash).
- **LOG_LEVEL Filtering (5.4):** Added `LOG_LEVEL` env var (debug/info/warn/error). Logger now filters output below configured severity threshold.
- **Transcription Availability Fix (5.6):** `isTranscriptionAvailable()` now checks `existsSync()` for whisper binary and model instead of hardcoded `return true`.
- **Rate Limiter Rewrite (5.7):** Replaced fixed-window (mislabeled as sliding) with true sliding window using per-key timestamp arrays. Added periodic eviction sweep (2× window interval).
- **Dedup Optimization (5.8):** `MessageDeduplicator` switched from O(n) per-message Map scan to interval-based eviction. `isNew()` is now O(1).

### 📡 Phase 6 — Proactive System Completion

- **Wired Proactive Commands (6.1):** `/remind`, `/schedule`, `/cron` (list/remove) now routed through the command parser to proactive handlers.
- **One-Shot Reminders (6.2):** Added `oneShot` flag to `CronJob` interface. Scheduler auto-deletes one-shot jobs after first execution. `/remind` sets `oneShot: true`.
- **Watcher Events (6.3):** `WatcherService` now extends `EventEmitter` with typed events (`file:add`, `file:change`, `file:remove`, `git:behind`). Events are emitted instead of dead-ending into logger.
- **`/schedule list` (6.4):** Implemented sub-command parsing in `handleScheduleCommand` — `list`/`ls` routes to `handleCronList()`.

### 🧪 Phase 7 — Test Coverage & Strictness

- **Command Parser Tests (7.1):** 27 tests covering passthrough, unknown commands, help/aliases, status, version, settings (verbose/autocommit/auto/mode), project, context, proactive (remind/schedule/cron), task control, and aliases.
- **Security Tests (7.2):** 41 tests covering `InputValidator` (14), `sanitizePath` (4), `RateLimiter` (6), and `SecurityGate` (17) — including injection detection, authorization flows, group behavior, and broadcast handling.
- **Renamed e2e → integration (7.3):** Moved all test files from `tests/e2e/` to `tests/integration/`. Removed `test:e2e` script. Fixed flaky timing threshold (100ms → 90ms).
- **Strict tsconfig (7.5):** Enabled `noUnusedLocals` and `noUnusedParameters`. Fixed 4 violations (dead import, dead method, unused params).

### 📊 Stats

- **Test suite:** 13 files, 177 tests, 0 failures (up from 11 files / 109 tests)
- **New files:** 10 (5 command handlers, base class, env config, command types, 2 test suites)
- **Deleted files:** `task/queue.ts` (267 lines), `tests/e2e/` directory (moved)
- **Net impact:** ~1,400 lines deleted, ~1,800 lines changed/added

## [0.0.20] - 2026-02-05 (Runtime Fixes, Security Hardening & Dead Code Purge 🔒)

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

## [0.0.19] - 2026-02-05 (Identity & Skills Pipeline Unification 🧬)

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

## [0.0.18] - 2026-02-05 (Code Audit & State Architecture 🧹)

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

## [0.0.17] - 2026-02-05 (The Responsive Orchestrator)

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

## [0.0.16] - 2026-02-04 (The Orchestrator Architecture)

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

## [0.0.15] - 2026-02-04 (Stability & Voice Fix 🎙️)

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

## [0.0.14] - 2026-02-04 (Zero Trust Bonding 🔐)

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

## [0.0.13] - 2026-02-04 (Repo Maps & Media Intelligence 🗺️👀)

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

## [0.0.12] - 2026-02-04 (Harness Alignment & Diagnostics 🛠️)

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

## [0.0.11] - 2026-02-04 (Reliability & Persistence 🔄 💾)

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

## [0.0.10] - 2026-02-04 (Auto-scaffold Templates 🛠️)

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

## [0.0.9] - 2026-02-04 (Test Harness Integration 🧪)

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

## [0.0.8] - 2026-02-03 (SQLite Cleanup 🗄️)

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

## [0.0.7] - 2026-02-03 (Documentation & Diagrams Update 📊)

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

## [0.0.6] - 2026-02-03 (Good Boy Update 🐕)

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

## [0.0.5] - 2026-02-03 (Prompt Engineering Update)

### 🐕 "Good Sniffer Dog" Prompt Engineering

Major prompt engineering improvements to make Fetch a better companion.

### Added

**Prompt System:**

- `CORE_IDENTITY` - Enhanced personality with "good sniffer dog" metaphor
- `UNDERSTANDING_PATTERNS` - Smart interpretation of vague requests
- `CAPABILITIES` - Clear, scannable list of what Fetch can do
- [docs/markdown/CONTEXT_PIPELINE.md](docs/markdown/CONTEXT_PIPELINE.md) - Prompt/context pipeline guide

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

## [0.0.4] - 2026-02-03 (Fetch-v2-demo)

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

## [0.0.3] - 2026-02-02

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

## [0.0.2] - 2026-02-02

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

## [0.0.1] - 2026-02-01

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
| 0.0.35 | 2026-02-11 | Comprehensive Codebase Hardening (50 Issues) |
| 0.0.34 | 2026-02-11 | Harness, Identity, Skills & Tool Hardening |
| 0.0.33 | 2026-02-11 | TUI Layout Overhaul & Dead Code Cleanup |
| 0.0.32 | 2026-02-11 | Web Fetch, Web Search & Browser Automation |
| 0.0.31 | 2026-02-11 | Documentation & UX Overhaul |
| 0.0.30 | 2026-02-10 | GitHub Tools Expansion (8 New Tools) |
| 0.0.29 | 2026-02-09 | Hotreload & TUI UX |
| 0.0.28 | 2026-02-09 | Bug Fixes & TUI Configuration |
| 0.0.27 | 2026-02-09 | New `workspace_publish` Tool |
| 0.0.26 | 2026-02-09 | Session Recursion & Bug Fixes |
| 0.0.24 | 2026-02-08 | Dead Code Purge & Dependency Audit |
| 0.0.25 | 2026-02-07 | The Conversation IS the Interface |
| 0.0.23 | 2026-02-07 | Make It Feel Alive |
| 0.0.22 | 2026-02-06 | Context Pipeline |
| 0.0.21 | 2026-02-06 | Deep Refinement |
| 0.0.20 | 2026-02-05 | Runtime Fixes, Security Hardening & Dead Code Purge |
| 0.0.19 | 2026-02-05 | Identity & Skills Pipeline Unification |
| 0.0.18 | 2026-02-05 | Code Audit & State Architecture |
| 0.0.17 | 2026-02-05 | Dynamic Identity, Skills, Crash Recovery |
| 0.0.16 | 2026-02-04 | Orchestrator Architecture & Mode System |
| 0.0.15 | 2026-02-04 | Stability & Voice Fix |
| 0.0.14 | 2026-02-04 | Zero Trust Bonding |
| 0.0.13 | 2026-02-04 | Repo Maps & Media Intelligence |
| 0.0.12 | 2026-02-04 | Harness Alignment & Diagnostics |
| 0.0.11 | 2026-02-04 | Reliability & Persistence |
| 0.0.10 | 2026-02-04 | Auto-scaffold Templates |
| 0.0.9 | 2026-02-04 | Test Harness Integration |
| 0.0.8 | 2026-02-03 | SQLite Cleanup |
| 0.0.7 | 2026-02-03 | Documentation & Diagrams |
| 0.0.6 | 2026-02-03 | Good Boy Update |
| 0.0.5 | 2026-02-03 | Prompt Engineering |
| 0.0.4 | 2026-02-03 | V2 Orchestrator Architecture |
| 0.0.3 | 2026-02-02 | 4-Mode Architecture & Zod Validation |
| 0.0.2 | 2026-02-02 | TUI Redesign |
| 0.0.1 | 2026-02-01 | Initial beta release |

[0.0.35]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.34...v0.0.35
[0.0.34]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.33...v0.0.34
[0.0.33]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.32...v0.0.33
[0.0.32]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.31...v0.0.32
[0.0.31]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.30...v0.0.31
[0.0.30]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.29...v0.0.30
[0.0.29]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.28...v0.0.29
[0.0.28]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.27...v0.0.28
[0.0.27]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.26...v0.0.27
[0.0.26]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.24...v0.0.26
[0.0.24]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.25...v0.0.24
[0.0.25]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.23...v0.0.25
[0.0.23]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.22...v0.0.23
[0.0.22]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.21...v0.0.22
[0.0.21]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.20...v0.0.21
[0.0.20]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.19...v0.0.20
[0.0.19]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.18...v0.0.19
[0.0.18]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.17...v0.0.18
[0.0.17]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.16...v0.0.17
[0.0.16]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.15...v0.0.16
[0.0.15]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.14...v0.0.15
[0.0.14]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.13...v0.0.14
[0.0.13]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.12...v0.0.13
[0.0.4]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/Traves-Theberge/Fetch/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/Traves-Theberge/Fetch/releases/tag/v0.0.1
