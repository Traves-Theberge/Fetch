# AGENTS.md
Guidance for agentic coding tools operating in `/home/traves/Development/Fetch`.

## 1) Repository Layout
- `fetch-app/`: Node.js + TypeScript bridge service (WhatsApp client, orchestration, tools).
- `fetch-app/src/`: implementation code.
- `fetch-app/tests/unit/`: unit tests.
- `fetch-app/tests/integration/`: integration tests.
- `manager/`: Go TUI/manager binary.
- `manager/internal/`: Go internal packages.
- `kennel/`: sandbox/container assets.
- `docs/markdown/`: product and engineering docs.
- `scripts/`: installation and automation scripts.

## 2) Build/Lint/Test Commands
Run commands from repo root unless noted.

### Bootstrap
- `bash setup-dev.sh`
  - Verifies prerequisites, installs dependencies, runs initial builds.

### Bridge (`fetch-app`)
- `npm install` (in `fetch-app/`)
- `npm run dev` (in `fetch-app/`)
- `npm run build` (in `fetch-app/`)
- `npm run clean` (in `fetch-app/`)
- `npm run lint` (in `fetch-app/`)
  - `lint` is `tsc --noEmit` (type-check lint), not ESLint.

### Manager (`manager`)
- `go build -o fetch-manager .` (in `manager/`)
- `bash manager/build.sh`
  - Builds current platform plus Linux ARM64 binary.

### Runtime/Stack
- `./deploy.sh`
- `docker compose up -d`
- `docker compose down`

## 3) Testing Commands (Especially Single-Test)

### All bridge tests
- `npm run test` (watch mode, `fetch-app/`)
- `npm run test:run` (single-run CI style, `fetch-app/`)
- `npm run test:unit` (`fetch-app/tests/unit`)
- `npm run test:integration` (`fetch-app/tests/integration`)

### Single TypeScript test file
- `npx vitest run tests/unit/<file>.test.ts` (in `fetch-app/`)
- Example: `npx vitest run tests/unit/handler.test.ts`

### Single test by name
- `npx vitest run tests/unit/handler.test.ts -t "should return LLM response"`

### Coverage
- `npx vitest run --coverage` (in `fetch-app/`)

### Go tests (`manager`)
- `go test ./...`
- Single package: `go test ./internal/paths`
- Single test function: `go test ./internal/paths -run TestResolveProjectDir`

## 4) TypeScript Style Conventions (`fetch-app`)
Derived from `fetch-app/tsconfig.json` and current source style.

### Formatting/Syntax
- 2-space indentation.
- Semicolons are used consistently.
- Prefer single quotes for strings.
- ESM only (`"type": "module"`, `module: "NodeNext"`).
- Local source imports include `.js` extension.

### Imports
- Keep imports at file top.
- Common ordering pattern:
  1. side-effect imports (`import 'dotenv/config';`)
  2. Node/builtin + third-party imports
  3. internal relative imports
- Prefer type-only imports when possible:
  - `import type { ToolResult } from './types.js';`

### Types and Safety
- Strict TypeScript is enabled (`strict: true`).
- Avoid `any`; prefer `unknown` at boundaries and narrow safely.
- Normalize unknown errors as: `err instanceof Error ? err.message : String(err)`.
- Add explicit return types for exported/public functions.
- Prefer schema validation at tool boundaries (Zod is used heavily).

### Naming
- `camelCase`: variables/functions.
- `PascalCase`: interfaces/types/classes.
- `UPPER_SNAKE_CASE`: env vars and true constants.
- Files: `kebab-case.ts`; tests: `*.test.ts`.

### Error Handling
- Wrap I/O/process/network boundaries in `try/catch`.
- Prefer returning structured error payloads from tool handlers.
- Keep user-facing errors actionable and specific.
- Use fail-safe cleanup paths (best-effort shutdown, guarded catches).

### Tests
- Framework: Vitest (`describe`, `it`, `expect`, `vi`).
- Unit tests in `tests/unit`, integration tests in `tests/integration`.
- Mock external services aggressively in unit tests.

## 5) Go Style Conventions (`manager`)

### Formatting/Structure
- Follow standard `gofmt` formatting.
- Keep package names short/lowercase (`docker`, `status`, `layout`, etc.).
- Prefer small helper functions around commands and message mapping.

### Naming
- Exported identifiers: `PascalCase`.
- Unexported identifiers: `camelCase`.
- Constants: prefer idiomatic Go naming (`camelCase`/`PascalCase`, not screaming snake case).

### Error Handling
- Return `error` for expected failures; avoid panics.
- Wrap with context where relevant (`fmt.Errorf("...: %w", err)`).
- Include command output on shell failures when useful.

### Tests
- Use standard `go test`.
- Existing coverage in manager is limited; add focused package tests for new behavior.

## 6) Agent Workflow Expectations
- Prefer minimal, surgical edits.
- Do not refactor unrelated code for scoped tasks.
- Update tests/docs when behavior changes.
- Preserve existing safety patterns (confirmation gates, cautious modes, guardrails).

## 7) Commit/PR Guidance
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `build:`, `test:`.
- PR descriptions should include:
  - intent/rationale,
  - concise change summary,
  - exact verification commands and results.

## 8) Cursor and Copilot Rules
Scanned for supplemental instruction files:
- `.cursor/rules/`
- `.cursorrules`
- `.github/copilot-instructions.md`

Result at time of writing: no Cursor or Copilot instruction files were found.
If these files are added later, update this AGENTS.md and treat them as authoritative supplements.
