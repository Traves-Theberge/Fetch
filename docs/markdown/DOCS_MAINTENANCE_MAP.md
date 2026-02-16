# Documentation Maintenance Map

This file is the canonical maintenance checklist for docs accuracy.

Use it when shipping features, refactors, or releases.

## Maintenance Workflow

1. Update code/config first.
2. Identify affected docs pages from the mapping table below.
3. Update those pages in the same PR/commit.
4. Run link + consistency checks (`rg` for stale filenames, versions, container names).
5. Mark checklist items complete with date/commit.

## Full Audit Checklist

- [x] `README.md`
- [x] `DOCUMENTATION.md`
- [x] `SETUP_GUIDE.md`
- [x] `INSTALL_UNINSTALL_UPDATE.md`
- [x] `SECURITY_RUNBOOK.md`
- [x] `COMMANDS.md`
- [x] `WORKFLOW_AUTOMATION.md`
- [x] `TUI_GUIDE.md`
- [x] `CONFIGURATION.md`
- [x] `TESTING_GUIDE.md`
- [x] `ARCHITECTURE.md`
- [x] `SYSTEMS_DEEP_DIVE.md`
- [x] `CONTEXT_PIPELINE.md`
- [x] `HARNESS_SYSTEM.md`
- [x] `STATE_MANAGEMENT.md`
- [x] `IDENTITY_SYSTEM.md`
- [x] `SKILLS_GUIDE.md`
- [x] `API_REFERENCE.md`
- [x] `GLOSSARY.md`
- [x] `AGENTIC_WORKFLOW.md` (pointer page)

Last full audit: 2026-02-16.

## Page To Source Mapping

| Docs Page | Core Runtime Sources | Related Config/Data | Tests To Cross-Check | Mermaid Recommended |
|---|---|---|---|---|
| `README.md` | `fetch-app/src/index.ts`, `fetch-app/src/handler/index.ts`, `scripts/fetch-cli.sh`, `manager/main.go` | `docker-compose.yml`, `.env.example`, `VERSION`, `release-manifest.json` | `fetch-app/tests/unit/index-runtime.test.ts` | Yes |
| `DOCUMENTATION.md` | `docs/index.html` | `docs/markdown/` | n/a | Optional |
| `SETUP_GUIDE.md` | `scripts/install.sh`, `scripts/fetch-cli.sh`, `manager/main.go`, `manager/internal/status/client.go` | `.env.example`, `docker-compose.yml`, `config/searxng/settings.yml` | `fetch-app/tests/unit/env-runtime-validation.test.ts` | Yes |
| `INSTALL_UNINSTALL_UPDATE.md` | `scripts/install.sh`, `scripts/fetch-cli.sh`, `scripts/uninstall.sh` | `release-manifest.json`, `VERSION` | `fetch-app/tests/unit/index-runtime.test.ts` | Yes |
| `SECURITY_RUNBOOK.md` | `fetch-app/src/security/gate.ts`, `fetch-app/src/security/rateLimiter.ts`, `fetch-app/src/security/validator.ts`, `fetch-app/src/security/whitelist.ts` | `.env.example`, `data/whitelist.json` | `fetch-app/tests/unit/security.test.ts`, `fetch-app/tests/unit/whitelist.test.ts` | Optional |
| `COMMANDS.md` | `fetch-app/src/commands/parser.ts`, `fetch-app/src/commands/index.ts`, `fetch-app/src/tools/registry.ts` | `fetch-app/src/validation/tools.ts` | `fetch-app/tests/unit/command-parser.test.ts`, `fetch-app/tests/unit/tool-validation-contracts.test.ts` | Yes |
| `WORKFLOW_AUTOMATION.md` | `fetch-app/src/tools/workflow.ts`, `fetch-app/src/workflow/manager.ts`, `fetch-app/src/workflow/types.ts` | `data/workflows.json` | `fetch-app/tests/unit/workflow-tools.test.ts`, `fetch-app/tests/unit/workflow-manager.test.ts` | Yes |
| `TUI_GUIDE.md` | `manager/main.go`, `manager/internal/components/*`, `manager/internal/docker/docker.go`, `manager/internal/status/client.go` | `docs/index.html`, `docker-compose.yml` | `manager/internal/paths/paths_test.go` | Yes |
| `CONFIGURATION.md` | `fetch-app/src/config/env.ts`, `fetch-app/src/config/pipeline.ts`, `fetch-app/src/config/paths.ts` | `.env.example`, `docker-compose.yml`, `config/searxng/settings.yml`, `config/github/README.md` | `fetch-app/tests/unit/env-runtime-validation.test.ts`, `fetch-app/tests/unit/pipeline-config.test.ts` | Yes |
| `TESTING_GUIDE.md` | `fetch-app/tests/unit/*`, `fetch-app/tests/integration/*`, `manager/internal/paths/paths.go` | `fetch-app/vitest.config.ts`, `fetch-app/package.json` scripts | all listed in guide | Yes |
| `ARCHITECTURE.md` | `fetch-app/src/agent/core.ts`, `fetch-app/src/handler/index.ts`, `fetch-app/src/tools/registry.ts`, `fetch-app/src/harness/spawner.ts` | `docker-compose.yml`, `kennel/Dockerfile` | `fetch-app/tests/integration/agent-loop.test.ts` | Yes |
| `SYSTEMS_DEEP_DIVE.md` | `fetch-app/src/identity/*`, `fetch-app/src/session/*`, `fetch-app/src/task/*`, `fetch-app/src/agent/*`, `fetch-app/src/skills/*` | `data/identity/*`, `data/skills/`, `data/cli-configs/*` | `fetch-app/tests/unit/identity-manager.test.ts`, `fetch-app/tests/unit/session-manager.test.ts`, `fetch-app/tests/unit/task-manager.test.ts` | Yes |
| `CONTEXT_PIPELINE.md` | `fetch-app/src/session/manager.ts`, `fetch-app/src/workspace/profiler.ts`, `fetch-app/src/workspace/repo-map.ts`, `fetch-app/src/workspace/symbols.ts` | `fetch-app/src/config/pipeline.ts` | `fetch-app/tests/unit/context-pipeline.test.ts`, `fetch-app/tests/unit/project-profiler.test.ts`, `fetch-app/tests/unit/repo-map.test.ts` | Yes |
| `HARNESS_SYSTEM.md` | `fetch-app/src/harness/base.ts`, `fetch-app/src/harness/registry.ts`, `fetch-app/src/harness/spawner.ts`, `fetch-app/src/harness/executor.ts` | `kennel/Dockerfile`, `kennel/entrypoint.sh`, `docker-compose.yml` | `fetch-app/tests/unit/harness-adapters.test.ts`, `fetch-app/tests/unit/spawner.test.ts` | Yes |
| `STATE_MANAGEMENT.md` | `fetch-app/src/session/store.ts`, `fetch-app/src/session/manager.ts`, `fetch-app/src/task/store.ts`, `fetch-app/src/task/manager.ts`, `fetch-app/src/task/integration.ts` | runtime DBs in `data/`, active projects in `workspace/` | `fetch-app/tests/unit/session-store.test.ts`, `fetch-app/tests/unit/task-store.test.ts`, `fetch-app/tests/unit/task-integration.test.ts` | Yes |
| `IDENTITY_SYSTEM.md` | `fetch-app/src/identity/loader.ts`, `fetch-app/src/identity/manager.ts`, `fetch-app/src/identity/types.ts`, `fetch-app/src/agent/prompts.ts` | `data/identity/COLLAR.md`, `data/identity/ALPHA.md`, `data/cli-configs/*` | `fetch-app/tests/unit/identity-loader.test.ts`, `fetch-app/tests/unit/identity-manager.test.ts` | Yes |
| `SKILLS_GUIDE.md` | `fetch-app/src/skills/manager.ts`, `fetch-app/src/skills/loader.ts`, `fetch-app/src/skills/types.ts`, `fetch-app/src/validation/tools.ts` | `fetch-app/src/skills/builtin/**/SKILL.md`, `data/skills/` | `fetch-app/tests/unit/skills-manager.test.ts`, `fetch-app/tests/unit/tool-validation-contracts.test.ts` | Yes |
| `API_REFERENCE.md` | `fetch-app/src/index.ts`, `fetch-app/src/api/status.ts`, `fetch-app/src/tools/*`, `fetch-app/src/validation/tools.ts` | `.env.example`, `docs/index.html` | `fetch-app/tests/unit/status-api.test.ts`, `fetch-app/tests/unit/*-tools.test.ts` | Yes |
| `GLOSSARY.md` | Cross-reference docs + runtime modules listed in this map | Cross-reference docs set | n/a | Optional |
| `AGENTIC_WORKFLOW.md` | `docs/markdown/SYSTEMS_DEEP_DIVE.md` | n/a | n/a | No (pointer) |

## Detailed Coverage (Per Page)

Use this section when the summary table is not enough.

### `README.md`
- Runtime: `fetch-app/src/index.ts`, `fetch-app/src/handler/index.ts`, `fetch-app/src/tools/registry.ts`, `manager/main.go`, `scripts/fetch-cli.sh`.
- Infra/config: `docker-compose.yml`, `.env.example`, `VERSION`, `release-manifest.json`.
- Related docs assets: `docs/index.html`, `docs/assets/style.css`.

### `SETUP_GUIDE.md`
- Bootstrap scripts: `scripts/install.sh`, `scripts/install_prereqs.sh`, `scripts/install_gh_cli.sh`, `scripts/manage_harnesses.sh`.
- Runtime wiring: `scripts/fetch-cli.sh`, `manager/main.go`, `manager/internal/status/client.go`.
- Infra/config: `docker-compose.yml`, `config/searxng/settings.yml`, `.env.example`.

### `INSTALL_UNINSTALL_UPDATE.md`
- Lifecycle scripts: `scripts/install.sh`, `scripts/fetch-cli.sh`, `scripts/uninstall.sh`, `scripts/build_manager.sh`.
- Release metadata: `release-manifest.json`, `VERSION`.

### `SECURITY_RUNBOOK.md`
- Security gate: `fetch-app/src/security/gate.ts`, `fetch-app/src/security/rateLimiter.ts`, `fetch-app/src/security/validator.ts`, `fetch-app/src/security/whitelist.ts`.
- Admin/auth config: `fetch-app/src/config/env.ts`, `.env.example`.

### `COMMANDS.md`
- Parser + command handling: `fetch-app/src/commands/parser.ts`, `fetch-app/src/commands/index.ts`, `fetch-app/src/commands/task.ts`, `fetch-app/src/commands/trust.ts`.
- Tool contract sources: `fetch-app/src/tools/registry.ts`, `fetch-app/src/validation/tools.ts`.

### `WORKFLOW_AUTOMATION.md`
- Workflow runtime: `fetch-app/src/tools/workflow.ts`, `fetch-app/src/workflow/manager.ts`, `fetch-app/src/workflow/types.ts`.
- Persistence: `data/workflows.json`.

### `TUI_GUIDE.md`
- Main app: `manager/main.go`.
- UI internals: `manager/internal/components/*`, `manager/internal/layout/*`, `manager/internal/theme/*`, `manager/internal/logs/logs.go`.
- Docker/status integration: `manager/internal/docker/docker.go`, `manager/internal/status/client.go`.

### `CONFIGURATION.md`
- Env + runtime config: `fetch-app/src/config/env.ts`, `fetch-app/src/config/pipeline.ts`, `fetch-app/src/config/paths.ts`.
- Infra/config files: `.env.example`, `docker-compose.yml`, `config/searxng/settings.yml`, `config/github/README.md`.

### `TESTING_GUIDE.md`
- Unit/integration suites: `fetch-app/tests/unit/*`, `fetch-app/tests/integration/*`.
- Test helpers and runner config: `fetch-app/tests/helpers/*`, `fetch-app/vitest.config.ts`, `fetch-app/package.json`.
- Manager test baseline: `manager/internal/paths/paths_test.go`.

### `ARCHITECTURE.md`
- Agent and orchestration core: `fetch-app/src/agent/core.ts`, `fetch-app/src/handler/index.ts`, `fetch-app/src/tools/registry.ts`.
- Execution stack: `fetch-app/src/harness/spawner.ts`, `fetch-app/src/harness/executor.ts`, `fetch-app/src/utils/docker.ts`.
- Infra layout: `docker-compose.yml`, `kennel/Dockerfile`, `kennel/browser-agent.mjs`.

### `SYSTEMS_DEEP_DIVE.md`
- Identity/session/task systems: `fetch-app/src/identity/*`, `fetch-app/src/session/*`, `fetch-app/src/task/*`.
- Agent runtime and notifications: `fetch-app/src/agent/*`.
- Skills + prompt shaping: `fetch-app/src/skills/*`, `data/skills/`, `data/identity/*`.

### `CONTEXT_PIPELINE.md`
- Session memory flow: `fetch-app/src/session/manager.ts`, `fetch-app/src/session/store.ts`.
- Repo/context signals: `fetch-app/src/workspace/profiler.ts`, `fetch-app/src/workspace/repo-map.ts`, `fetch-app/src/workspace/symbols.ts`.
- Tuning source: `fetch-app/src/config/pipeline.ts`.

### `HARNESS_SYSTEM.md`
- Harness adapters and spawning: `fetch-app/src/harness/base.ts`, `fetch-app/src/harness/*.ts`, `fetch-app/src/harness/registry.ts`, `fetch-app/src/harness/spawner.ts`.
- Kennel runtime: `kennel/Dockerfile`, `kennel/entrypoint.sh`, `docker-compose.yml`.

### `STATE_MANAGEMENT.md`
- Session persistence: `fetch-app/src/session/types.ts`, `fetch-app/src/session/store.ts`, `fetch-app/src/session/manager.ts`.
- Task persistence: `fetch-app/src/task/types.ts`, `fetch-app/src/task/store.ts`, `fetch-app/src/task/manager.ts`, `fetch-app/src/task/integration.ts`.
- Runtime data directories: `data/`, `workspace/`.

### `IDENTITY_SYSTEM.md`
- Identity load/compose pipeline: `fetch-app/src/identity/loader.ts`, `fetch-app/src/identity/manager.ts`, `fetch-app/src/identity/types.ts`.
- Prompt assembly hooks: `fetch-app/src/agent/prompts.ts`.
- Identity sources: `data/identity/COLLAR.md`, `data/identity/ALPHA.md`, `data/cli-configs/*`.

### `SKILLS_GUIDE.md`
- Skill lifecycle: `fetch-app/src/skills/index.ts`, `fetch-app/src/skills/loader.ts`, `fetch-app/src/skills/manager.ts`, `fetch-app/src/skills/types.ts`.
- Built-in skill content: `fetch-app/src/skills/builtin/**/SKILL.md`.
- Tool-name contract: `fetch-app/src/validation/tools.ts`, `fetch-app/src/tools/registry.ts`.
- User skill directory: `data/skills/`.

### `API_REFERENCE.md`
- API routing and status endpoints: `fetch-app/src/index.ts`, `fetch-app/src/api/status.ts`.
- Tool handlers and schemas: `fetch-app/src/tools/*`, `fetch-app/src/validation/tools.ts`.
- Supporting runtime modules: `fetch-app/src/utils/logger.ts`, `fetch-app/src/utils/version.ts`, `fetch-app/src/security/*`.

### `GLOSSARY.md`
- Maintained by cross-checking all pages above plus:
  - `fetch-app/src/tools/types.ts`
  - `fetch-app/src/harness/types.ts`
  - `fetch-app/src/workflow/types.ts`

### `AGENTIC_WORKFLOW.md`
- Pointer page. Must track `docs/markdown/SYSTEMS_DEEP_DIVE.md` only.

## Drift Checks (run before release)

```bash
rg -n "INSTALL_UPDATE\\.md|UNINSTALL\\.md|CHANGELOG\\.md|data-doc=\"CHANGELOG\\.md\"" docs README.md
rg -n "v0\\.0\\." docs/index.html docs/markdown README.md
rg -n "40 tools|42 tunable|all 40 tools|full registered toolset" docs/markdown
rg -n "container_name|fetch-searxng|searxng" docker-compose.yml docs/markdown
rg -n "src/message/handler\\.ts|src/context/" docs/markdown
```
