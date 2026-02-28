# Repository Guidelines

## Project Structure & Module Organization
- Turborepo monorepo with npm workspaces. Root `turbo.json` defines the task pipeline.
- `apps/bridge/`: Node.js/TypeScript "bridge" service (WhatsApp/Discord client + LLM orchestration). Source in `apps/bridge/src/`, tests in `apps/bridge/tests/`, build output in `apps/bridge/dist/`.
- `apps/manager/`: Go "manager" binary with `apps/manager/main.go` and supporting code in `apps/manager/internal/`.
- `packages/typescript-config/`: Shared TypeScript compiler configuration.
- `packages/types/`: Shared TypeScript type definitions.
- `kennel/`: Dockerized Ubuntu sandbox for agent execution and browser tooling (outside Turborepo — infrastructure only).
- `config/`, `data/`, `docs/`, `scripts/`: runtime configuration, data files, documentation, and automation scripts.

## Build, Test, and Development Commands
- `bash setup-dev.sh`: verify Node/Go/Docker, install deps, build apps, and set up dev environment.
- `npm install`: install all workspace dependencies (run from repo root).
- `turbo run build`: build all packages (TypeScript + Go manager).
- `turbo run build --filter=@fetch/bridge`: build bridge and its dependencies only.
- `turbo run dev --filter=@fetch/bridge`: run bridge with `ts-node` (TypeScript, ESM).
- `turbo run lint`: run TypeScript type checking across packages.
- `turbo run test:run`: run all Vitest tests once.
- `go build -o fetch-manager .`: build the manager binary (run inside `apps/manager/`).
- `bash apps/manager/build.sh`: full manager build (multi-arch).
- `./deploy.sh` or `docker compose up -d`: build and start containers.

## Coding Style & Naming Conventions
- TypeScript: 2-space indentation, ES module syntax, ESLint with `@typescript-eslint` (unused args allowed with `_` prefix). See `apps/bridge/eslint.config.js`.
- Go: standard `gofmt` formatting and idiomatic Go naming.
- Paths and filenames are kebab-case or lower_snake_case; tests live under `apps/bridge/tests/` and mirror source structure.

## Testing Guidelines
- Framework: Vitest (`apps/bridge/vitest.config.ts`).
- Naming: `*.test.ts` under `apps/bridge/tests/` (unit and integration subfolders).
- Run a single test file: `npx vitest run apps/bridge/tests/unit/<file>.test.ts`.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (examples: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `build:`); scopes are optional.
- PRs should include: a concise description, rationale, and test evidence (commands run + results). Add screenshots for docs/UX changes when relevant.
- Release discipline: for every version tag/release, append human-readable release notes to the GitHub Release body (never leave it as compare-link only). Keep prior notes and append new sections for the new version.
